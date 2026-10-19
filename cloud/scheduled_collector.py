from common import DEFAULT_TENANT_ID, audit, put_entity, store_evidence, utcnow
from governance_api import collect_config, collect_data_protection, collect_findings, collect_resources, parallel_collect, topology


def handler(event, context):
    actor = "eventbridge-scheduler"
    snapshot = parallel_collect({
        "config": collect_config,
        "findings": collect_findings,
        "dataProtection": collect_data_protection,
        "resources": collect_resources,
        "topology": topology,
    })
    snapshot["collectedAt"] = utcnow()
    record = put_entity(DEFAULT_TENANT_ID, "COLLECTIONRUN", {
        "status": "completed",
        "summary": {
            "configScore": snapshot["config"]["score"],
            "findings": snapshot["findings"]["total"],
            "resources": snapshot["resources"]["total"],
        },
    })
    evidence = store_evidence(DEFAULT_TENANT_ID, actor, "Scheduled AWS governance snapshot", snapshot, ["AWS Config", "Security Hub", "GuardDuty", "AWS KMS", "Amazon Macie", "CloudWatch", "Cost Explorer", "CloudFormation"])
    audit(DEFAULT_TENANT_ID, actor, "collector.complete", "COLLECTIONRUN", record["id"], {"evidenceId": evidence["id"]})
    return {"runId": record["id"], "evidenceId": evidence["id"], "status": "completed"}
