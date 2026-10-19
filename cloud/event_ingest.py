import json

from common import audit, new_id, publish_notification, put_entity, utcnow

DEFAULT_TENANT_ID = __import__("os").environ.get("DEFAULT_TENANT_ID", "fullja")

def normalize(detail, source, event_id):
    if source == "aws.securityhub":
        findings = detail.get("findings", [])
        return [{
            "id": f.get("Id") or event_id,
            "type": f.get("Types", ["SecurityHubFinding"])[0],
            "severity": f.get("Severity", {}).get("Normalized", 0) / 10,
            "accountId": f.get("AwsAccountId"),
            "region": f.get("Region"),
            "resourceId": (f.get("Resources") or [{}])[0].get("Id"),
            "source": "Security Hub",
            "raw": f,
        } for f in findings]
    if source == "aws.guardduty":
        return [{
            "id": detail.get("id") or event_id,
            "type": detail.get("type", "GuardDutyFinding"),
            "severity": detail.get("severity", 0),
            "accountId": detail.get("accountId"),
            "region": detail.get("region"),
            "resourceId": detail.get("resource", {}).get("instanceDetails", {}).get("instanceId") or detail.get("resource", {}).get("resourceType"),
            "source": "GuardDuty",
            "raw": detail,
        }]
    if source == "aws.config":
        return [{
            "id": event_id,
            "type": detail.get("configRuleName", "ConfigComplianceChange"),
            "severity": 6 if detail.get("newEvaluationResult", {}).get("complianceType") == "NON_COMPLIANT" else 1,
            "accountId": detail.get("awsAccountId"),
            "region": detail.get("awsRegion"),
            "resourceId": detail.get("resourceId"),
            "source": "AWS Config",
            "raw": detail,
        }]
    return []

def handler(event, context):
    processed = 0
    failures = []
    for record in event.get("Records", []):
        message_id = record.get("messageId")
        try:
            envelope = json.loads(record.get("body", "{}"))
            source = envelope.get("source", "")
            findings = normalize(envelope.get("detail", {}), source, envelope.get("id") or message_id)
            for finding in findings:
                finding["status"] = "open"
                finding["observedAt"] = envelope.get("time") or utcnow()
                finding["ingestedAt"] = utcnow()
                item = put_entity(DEFAULT_TENANT_ID, "FINDING", finding, finding["id"].replace("/", "_"))
                audit(DEFAULT_TENANT_ID, "eventbridge", "finding.ingest", "FINDING", item["id"], {"source": finding["source"]})
                if float(finding.get("severity", 0)) >= 7:
                    publish_notification("CloudGuard high severity finding", {"findingId": item["id"], "type": finding["type"], "severity": finding["severity"], "accountId": finding.get("accountId")}, {"severity": finding["severity"]})
                processed += 1
        except Exception:
            failures.append({"itemIdentifier": message_id})
    return {"processed": processed, "batchItemFailures": failures}
