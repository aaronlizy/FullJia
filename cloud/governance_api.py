import hashlib
import json
import os

import boto3
from botocore.exceptions import ClientError

from common import (
    AWS_REGION, DEFAULT_TENANT_ID, EVIDENCE_BUCKET, audit, get_entity,
    list_entities, new_id, parse_body, publish_notification, put_entity,
    response, s3, store_evidence, tenant_from_event, user_from_event, utcnow,
)

CLIENT_CONFIG = __import__("botocore.config", fromlist=["Config"]).Config(
    connect_timeout=2,
    read_timeout=5,
    retries={"max_attempts": 1, "mode": "standard"},
    max_pool_connections=50,
)


def aws_client(service, **kwargs):
    return boto3.client(service, config=CLIENT_CONFIG, **kwargs)


config = aws_client("config")
securityhub = aws_client("securityhub")
guardduty = aws_client("guardduty")
kms = aws_client("kms")
macie = aws_client("macie2")
tagging = aws_client("resourcegroupstaggingapi")
cloudwatch = aws_client("cloudwatch")
ce = aws_client("ce", region_name="us-east-1")
cloudformation = aws_client("cloudformation")
iam = aws_client("iam")
bedrock = aws_client("bedrock-runtime")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "")


def safe_call(fn, default=None):
    try:
        return fn()
    except ClientError as exc:
        return {"unavailable": True, "error": exc.response.get("Error", {}).get("Code", "ClientError"), "value": default}
    except Exception as exc:
        return {"unavailable": True, "error": type(exc).__name__, "value": default}


def collect_config():
    rules = safe_call(lambda: config.describe_config_rules(limit=100).get("ConfigRules", []), [])
    if isinstance(rules, dict):
        rules = rules.get("value", [])
    compliance = safe_call(lambda: config.describe_compliance_by_config_rule().get("ComplianceByConfigRules", []), [])
    if isinstance(compliance, dict):
        compliance = compliance.get("value", [])
    indexed = {x.get("ConfigRuleName"): x.get("Compliance", {}).get("ComplianceType", "INSUFFICIENT_DATA") for x in compliance}
    normalized = [{
        "code": r.get("ConfigRuleName"),
        "source": r.get("Source", {}).get("SourceIdentifier"),
        "status": indexed.get(r.get("ConfigRuleName"), "INSUFFICIENT_DATA").lower(),
        "evaluationModes": r.get("EvaluationModes", []),
    } for r in rules]
    compliant = sum(1 for r in normalized if r["status"] == "compliant")
    return {"rules": normalized, "totalRules": len(normalized), "compliantRules": compliant, "nonCompliantRules": sum(1 for r in normalized if r["status"] == "non_compliant"), "score": round(compliant / len(normalized) * 100) if normalized else None, "observedAt": utcnow(), "source": "AWS Config API"}


def collect_findings():
    sh = safe_call(lambda: securityhub.get_findings(Filters={"RecordState": [{"Value": "ACTIVE", "Comparison": "EQUALS"}]}, MaxResults=100).get("Findings", []), [])
    if isinstance(sh, dict):
        sh = sh.get("value", [])
    gd = []
    detectors = safe_call(lambda: guardduty.list_detectors().get("DetectorIds", []), [])
    if not isinstance(detectors, dict):
        for detector in detectors[:3]:
            ids = safe_call(lambda d=detector: guardduty.list_findings(DetectorId=d, FindingCriteria={"Criterion": {"service.archived": {"Eq": ["false"]}}}, MaxResults=50).get("FindingIds", []), [])
            if ids and not isinstance(ids, dict):
                found = safe_call(lambda d=detector, values=ids: guardduty.get_findings(DetectorId=d, FindingIds=values).get("Findings", []), [])
                if not isinstance(found, dict):
                    gd.extend(found)
    return {"securityHub": sh, "guardDuty": gd, "total": len(sh) + len(gd), "observedAt": utcnow()}


def collect_identity():
    users = safe_call(lambda: iam.list_users().get("Users", []), [])
    if isinstance(users, dict):
        users = []
    sampled_users = users[:100]

    def access_keys(user):
        keys = safe_call(lambda: iam.list_access_keys(UserName=user["UserName"]).get("AccessKeyMetadata", []), [])
        if isinstance(keys, dict):
            return []
        return [{"user": user["UserName"], "accessKeySuffix": key["AccessKeyId"][-4:], "status": key.get("Status"), "createdAt": key["CreateDate"]} for key in keys]

    executor_class = __import__("concurrent.futures", fromlist=["ThreadPoolExecutor"]).ThreadPoolExecutor
    with executor_class(max_workers=min(20, max(1, len(sampled_users)))) as executor:
        results = executor.map(access_keys, sampled_users)
        overdue = [key for user_keys in results for key in user_keys]
    return {"users": len(users), "sampledUsers": len(sampled_users), "truncated": len(users) > len(sampled_users), "accessKeys": overdue, "observedAt": utcnow(), "source": "AWS IAM API"}


def collect_data_protection():
    executor_class = __import__("concurrent.futures", fromlist=["ThreadPoolExecutor"]).ThreadPoolExecutor

    def collect_rotation():
        keys = safe_call(lambda: kms.list_keys(Limit=100).get("Keys", []), [])
        if isinstance(keys, dict):
            keys = []

        def rotation_status(key):
            state = safe_call(lambda: kms.get_key_rotation_status(KeyId=key["KeyId"]), {})
            return {"keyId": key["KeyId"], "rotationEnabled": bool(state.get("KeyRotationEnabled")) if isinstance(state, dict) else False}

        with executor_class(max_workers=min(20, max(1, len(keys[:50])))) as executor:
            return list(executor.map(rotation_status, keys[:50]))

    def collect_buckets():
        s3_client = aws_client("s3")
        buckets = safe_call(lambda: s3_client.list_buckets().get("Buckets", []), [])
        if isinstance(buckets, dict):
            buckets = []

        def bucket_status(bucket):
            name = bucket["Name"]
            encryption = safe_call(lambda: s3_client.get_bucket_encryption(Bucket=name), {})
            public = safe_call(lambda: s3_client.get_public_access_block(Bucket=name).get("PublicAccessBlockConfiguration", {}), {})
            return {"name": name, "encrypted": bool(encryption and not encryption.get("unavailable")), "publicAccessBlocked": bool(public and all(public.values())) if isinstance(public, dict) and not public.get("unavailable") else False}

        with executor_class(max_workers=min(20, max(1, len(buckets[:100])))) as executor:
            return list(executor.map(bucket_status, buckets[:100]))

    def collect_macie():
        status = safe_call(lambda: macie.get_macie_session(), {})
        if not isinstance(status, dict) or status.get("unavailable"):
            return []
        ids = safe_call(lambda: macie.list_findings(maxResults=50).get("findingIds", []), [])
        if not ids or isinstance(ids, dict):
            return []
        findings = safe_call(lambda: macie.get_findings(findingIds=ids).get("findings", []), [])
        return [] if isinstance(findings, dict) else findings

    with executor_class(max_workers=3) as executor:
        rotation_future = executor.submit(collect_rotation)
        buckets_future = executor.submit(collect_buckets)
        macie_future = executor.submit(collect_macie)
        rotation = rotation_future.result()
        bucket_results = buckets_future.result()
        macie_findings = macie_future.result()
    total_assets = len(rotation) + len(bucket_results)
    protected = sum(1 for item in rotation if item["rotationEnabled"]) + sum(1 for item in bucket_results if item["encrypted"] and item["publicAccessBlocked"])
    return {"kmsKeys": rotation, "buckets": bucket_results, "macieFindings": macie_findings, "encryptionCoverage": round(protected / total_assets * 100) if total_assets else None, "observedAt": utcnow(), "source": "AWS KMS/S3/Macie APIs"}


def collect_resources():
    resources = safe_call(lambda: tagging.get_resources(ResourcesPerPage=100).get("ResourceTagMappingList", []), [])
    if isinstance(resources, dict):
        resources = []
    alarms = safe_call(lambda: cloudwatch.describe_alarms(StateValue="ALARM", MaxRecords=100).get("MetricAlarms", []), [])
    if isinstance(alarms, dict):
        alarms = []
    today = __import__("datetime").date.today()
    cost_period = {"Start": today.replace(day=1).isoformat(), "End": (today + __import__("datetime").timedelta(days=1)).isoformat()}
    cost = safe_call(lambda: ce.get_cost_and_usage(TimePeriod=cost_period, Granularity="MONTHLY", Metrics=["UnblendedCost"]), {})
    amount = 0
    try:
        amount = float(cost["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"])
    except Exception:
        pass
    return {"resources": resources, "total": len(resources), "activeAlarms": alarms, "monthlyCostUsd": round(amount, 2), "observedAt": utcnow(), "source": "Resource Groups Tagging/CloudWatch/Cost Explorer APIs"}


def topology():
    stack_name = os.environ.get("STACK_NAME")
    stack_resources = []
    if stack_name:
        result = safe_call(lambda: cloudformation.describe_stack_resources(StackName=stack_name).get("StackResources", []), [])
        if not isinstance(result, dict):
            stack_resources = [{"logicalId": x.get("LogicalResourceId"), "type": x.get("ResourceType"), "status": x.get("ResourceStatus"), "physicalId": x.get("PhysicalResourceId")} for x in result]
    return {"stackName": stack_name, "stackResources": stack_resources, "region": AWS_REGION, "observedAt": utcnow(), "source": "AWS CloudFormation API", "implementation": "aws-native"}


def generate_bedrock_summary(payload):
    if not BEDROCK_MODEL_ID:
        return {"status": "disabled", "text": None}
    sanitized = {
        "configScore": payload.get("config", {}).get("score"),
        "configRules": payload.get("config", {}).get("totalRules"),
        "nonCompliantRules": payload.get("config", {}).get("nonCompliantRules"),
        "findingCount": payload.get("findings", {}).get("total"),
        "encryptionCoverage": payload.get("dataProtection", {}).get("encryptionCoverage"),
        "resourceCount": payload.get("resources", {}).get("total"),
        "monthlyCostUsd": payload.get("resources", {}).get("monthlyCostUsd"),
    }
    prompt = "You are an AWS SMB security governance assistant. Produce a concise Chinese executive summary with top 3 actions. Only use the supplied aggregate metrics; do not invent facts. Metrics: " + json.dumps(sanitized, ensure_ascii=False)
    result = safe_call(lambda: bedrock.converse(ModelId=BEDROCK_MODEL_ID, messages=[{"role": "user", "content": [{"text": prompt}]}], inferenceConfig={"maxTokens": 600, "temperature": 0.1}), {})
    if result.get("unavailable"):
        return {"status": "fallback", "error": result.get("error"), "text": None}
    text = result.get("output", {}).get("message", {}).get("content", [{}])[0].get("text")
    return {"status": "generated" if text else "fallback", "modelId": BEDROCK_MODEL_ID, "text": text}


def verify_evidence(tenant_id, evidence_id, actor):
    item = get_entity(tenant_id, "EVIDENCE", evidence_id)
    if not item:
        raise ValueError("Evidence not found")
    obj = s3.get_object(Bucket=item["bucket"], Key=item["objectKey"], **({"VersionId": item["versionId"]} if item.get("versionId") else {}))
    digest = hashlib.sha256(obj["Body"].read()).hexdigest()
    valid = digest == item.get("hash")
    item["integrityValid"] = valid
    item["verifiedAt"] = utcnow()
    put_entity(tenant_id, "EVIDENCE", item, evidence_id)
    audit(tenant_id, actor, "evidence.verify", "EVIDENCE", evidence_id, {"valid": valid, "sha256": digest})
    return {"id": evidence_id, "integrityValid": valid, "calculatedHash": digest, "expectedHash": item.get("hash")}


def parallel_collect(collectors):
    executor_class = __import__("concurrent.futures", fromlist=["ThreadPoolExecutor"]).ThreadPoolExecutor
    with executor_class(max_workers=len(collectors)) as executor:
        futures = {name: executor.submit(collector) for name, collector in collectors.items()}
        return {name: future.result() for name, future in futures.items()}


def execute_action(tenant_id, actor, action):
    started = utcnow()
    if action == "config_rules":
        result = collect_config()
        evidence = store_evidence(tenant_id, actor, "AWS Config compliance snapshot", result, ["AWS Config"])
    elif action == "rotate_keys":
        collected = parallel_collect({"identity": collect_identity, "protection": collect_data_protection})
        result = {**collected, "execution": "read-only assessment; approval required for changes"}
        evidence = store_evidence(tenant_id, actor, "Identity and key rotation assessment", result, ["AWS IAM", "AWS KMS"])
    elif action == "auto_remediate":
        findings = collect_findings()
        work_order = put_entity(tenant_id, "WORKORDER", {"title": "Security finding remediation approval", "status": "approval_required", "priority": "P0" if findings["total"] else "P3", "source": "Security Hub/GuardDuty", "payload": findings})
        publish_notification("CloudGuard remediation approval required", {"tenantId": tenant_id, "workOrderId": work_order["id"], "findingCount": findings["total"]}, {"tenantId": tenant_id})
        result = {"findings": findings, "workOrder": work_order, "execution": "queued_for_approval"}
        evidence = None
    elif action == "collect_evidence":
        result = parallel_collect({"config": collect_config, "findings": collect_findings, "dataProtection": collect_data_protection, "topology": topology})
        evidence = store_evidence(tenant_id, actor, "Security governance evidence package", result, ["AWS Config", "Security Hub", "GuardDuty", "AWS KMS", "Amazon Macie", "CloudFormation"])
    elif action == "generate_report":
        result = parallel_collect({"config": collect_config, "findings": collect_findings, "dataProtection": collect_data_protection, "resources": collect_resources})
        result["bedrockSummary"] = generate_bedrock_summary(result)
        evidence = store_evidence(tenant_id, actor, "Security governance report", result, ["AWS Config", "Security Hub", "GuardDuty", "AWS KMS", "Amazon Macie", "CloudWatch", "Cost Explorer"])
    else:
        raise ValueError("Unsupported action")
    run = put_entity(tenant_id, "AGENTRUN", {"action": action, "status": "completed", "result": result, "evidenceId": evidence.get("id") if evidence else None, "startedAt": started, "completedAt": utcnow(), "engine": "aws-native-collector"})
    audit(tenant_id, actor, "platform.action.complete", "AGENTRUN", run["id"], {"action": action, "evidenceId": run.get("evidenceId")})
    return run


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return response(204, {})
    method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("path") or event.get("rawPath", "/")
    tenant_id = tenant_from_event(event)
    actor = user_from_event(event)
    try:
        if method == "GET" and path.endswith("/health"):
            return response(200, {"status": "ok", "mode": "aws", "region": AWS_REGION, "time": utcnow()})
        if method == "GET" and path.endswith("/platform/topology"):
            return response(200, topology())
        if method == "GET" and path.endswith("/resources"):
            return response(200, collect_resources())
        if method == "GET" and path.endswith("/data-protection"):
            return response(200, collect_data_protection())
        if method == "GET" and path.endswith("/config-monitoring"):
            return response(200, collect_config())
        if method == "GET" and path.endswith("/evidence"):
            return response(200, {"items": list_entities(tenant_id, "EVIDENCE")})
        if method == "POST" and path.endswith("/agent/runs"):
            body = parse_body(event)
            scenario = body.get("scenario", "security_baseline")
            action = {"security_baseline": "config_rules", "identity_governance": "rotate_keys", "threat_response": "auto_remediate", "data_protection": "collect_evidence", "compliance_audit": "generate_report"}.get(scenario)
            if not action:
                raise ValueError("Unsupported scenario")
            run = execute_action(tenant_id, actor, action)
            run["scenario"] = scenario
            run["prompt"] = str(body.get("prompt", ""))[:500]
            return response(201, run)
        if method == "POST" and path.endswith("/platform/actions"):
            return response(201, execute_action(tenant_id, actor, parse_body(event).get("action")))
        if method == "POST" and path.endswith("/resources/health-check"):
            result = collect_resources()
            snapshot = put_entity(tenant_id, "RESOURCESNAPSHOT", result)
            audit(tenant_id, actor, "resources.health.check", "RESOURCESNAPSHOT", snapshot["id"], {"count": result["total"]})
            return response(201, snapshot)
        if method == "POST" and path.endswith("/data-protection/scan"):
            result = collect_data_protection()
            scan = put_entity(tenant_id, "PROTECTIONSCAN", result)
            audit(tenant_id, actor, "data-protection.scan", "PROTECTIONSCAN", scan["id"], {"coverage": result["encryptionCoverage"]})
            return response(201, scan)
        if method == "POST" and "/evidence/" in path and path.endswith("/verify"):
            return response(200, verify_evidence(tenant_id, path.split("/evidence/")[1].split("/")[0], actor))
        return response(404, {"error": "Route not found", "method": method, "path": path})
    except ValueError as exc:
        return response(422, {"error": str(exc)})
    except ClientError as exc:
        return response(502, {"error": exc.response.get("Error", {}).get("Message", str(exc)), "awsErrorCode": exc.response.get("Error", {}).get("Code")})
    except Exception as exc:
        return response(500, {"error": str(exc), "type": type(exc).__name__})
