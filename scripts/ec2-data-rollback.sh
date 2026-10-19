#!/bin/bash
set -euo pipefail

backup_bucket="${BACKUP_BUCKET:-fullja-cloudguard-ec2-backupbucket-h4oqbtm58jrw}"
version_id="${1:-}"
if [ -z "$version_id" ]; then
  echo "Usage: $0 <s3-version-id>" >&2
  exit 2
fi

temp_file="/var/lib/fullja/store.json.restore"
rollback_copy="/var/lib/fullja/store.json.before-rollback-$(date -u +%Y%m%d%H%M%S)"
/usr/local/bin/fullja-backup
aws s3api get-object \
  --bucket "$backup_bucket" \
  --key data/store.json \
  --version-id "$version_id" \
  "$temp_file" >/dev/null
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$temp_file"
cp /var/lib/fullja/store.json "$rollback_copy"
chown fullja:fullja "$temp_file"
chmod 600 "$temp_file"
mv "$temp_file" /var/lib/fullja/store.json
systemctl restart fullja-cloudguard

for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null; then
    echo "Data restored from S3 version $version_id"
    exit 0
  fi
  sleep 1
done

mv "$rollback_copy" /var/lib/fullja/store.json
chown fullja:fullja /var/lib/fullja/store.json
systemctl restart fullja-cloudguard
echo "Restored data failed health check; original data was recovered" >&2
exit 1
