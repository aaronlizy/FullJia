import base64
import datetime as dt
import decimal
import hashlib
import json
import os
import uuid

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ["TABLE_NAME"]
EVIDENCE_BUCKET = os.environ["EVIDENCE_BUCKET"]
NOTIFICATION_TOPIC_ARN = os.environ["NOTIFICATION_TOPIC_ARN"]
DEFAULT_TENANT_ID = os.environ.get("DEFAULT_TENANT_ID", "fullja")
AWS_REGION = os.environ.get("AWS_REGION", "ap-southeast-1")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
s3 = boto3.client("s3")
sns = boto3.client("sns")

class Encoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        if isinstance(obj, (dt.datetime, dt.date)):
            return obj.isoformat()
        if isinstance(obj, bytes):
            return base64.b64encode(obj).decode("ascii")
        return super().default(obj)

def utcnow():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:16]}"

def tenant_from_event(event):
    context = event.get("requestContext", {})
    claims = context.get("authorizer", {}).get("claims") or context.get("authorizer", {}).get("jwt", {}).get("claims", {})
    return claims.get("custom:tenant_id") or claims.get("tenant_id") or DEFAULT_TENANT_ID

def user_from_event(event):
    context = event.get("requestContext", {})
    claims = context.get("authorizer", {}).get("claims") or context.get("authorizer", {}).get("jwt", {}).get("claims", {})
    return claims.get("email") or claims.get("username") or claims.get("sub") or "aws-service"

def response(status, data):
    return {
        "statusCode": status,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": os.environ.get("CORS_ORIGIN", "*"),
            "access-control-allow-headers": "authorization,content-type,x-tenant-id",
            "access-control-allow-methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(data, cls=Encoder, ensure_ascii=False),
    }

def parse_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)

def put_entity(tenant_id, entity_type, entity, entity_id=None):
    entity_id = entity_id or entity.get("id") or new_id(entity_type.lower())
    now = utcnow()
    item = {
        **entity,
        "PK": f"TENANT#{tenant_id}",
        "SK": f"{entity_type.upper()}#{entity_id}",
        "GSI1PK": f"TYPE#{entity_type.upper()}",
        "GSI1SK": now,
        "tenantId": tenant_id,
        "entityType": entity_type.upper(),
        "id": entity_id,
        "updatedAt": now,
    }
    item.setdefault("createdAt", now)
    table.put_item(Item=json.loads(json.dumps(item, cls=Encoder), parse_float=decimal.Decimal))
    return item

def get_entity(tenant_id, entity_type, entity_id):
    return table.get_item(Key={"PK": f"TENANT#{tenant_id}", "SK": f"{entity_type.upper()}#{entity_id}"}).get("Item")

def list_entities(tenant_id, entity_type, limit=200):
    result = table.query(
        KeyConditionExpression=Key("PK").eq(f"TENANT#{tenant_id}") & Key("SK").begins_with(f"{entity_type.upper()}#"),
        Limit=limit,
    )
    return result.get("Items", [])

def audit(tenant_id, actor, action, entity_type, entity_id, detail=None):
    return put_entity(tenant_id, "AUDIT", {
        "actor": actor,
        "action": action,
        "targetType": entity_type,
        "targetId": entity_id,
        "detail": detail or {},
    })

def store_evidence(tenant_id, actor, name, payload, sources):
    artifact_id = new_id("evd")
    captured_at = utcnow()
    body = json.dumps(payload, cls=Encoder, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8")
    digest = hashlib.sha256(body).hexdigest()
    key = f"tenants/{tenant_id}/evidence/{captured_at[:10]}/{artifact_id}.json"
    result = s3.put_object(
        Bucket=EVIDENCE_BUCKET,
        Key=key,
        Body=body,
        ContentType="application/json",
        ServerSideEncryption="aws:kms",
        Metadata={"sha256": digest, "tenant-id": tenant_id},
    )
    artifact = put_entity(tenant_id, "EVIDENCE", {
        "id": artifact_id,
        "name": name,
        "bucket": EVIDENCE_BUCKET,
        "objectKey": key,
        "versionId": result.get("VersionId"),
        "hash": digest,
        "sources": sources,
        "collectedBy": actor,
        "status": "collected",
    }, artifact_id)
    audit(tenant_id, actor, "evidence.collect", "EVIDENCE", artifact_id, {"key": key, "sha256": digest})
    return artifact

def publish_notification(subject, message, attributes=None):
    kwargs = {"TopicArn": NOTIFICATION_TOPIC_ARN, "Subject": subject[:100], "Message": json.dumps(message, cls=Encoder, ensure_ascii=False)}
    if attributes:
        kwargs["MessageAttributes"] = {k: {"DataType": "String", "StringValue": str(v)} for k, v in attributes.items()}
    return sns.publish(**kwargs)
