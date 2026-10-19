#!/bin/bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <s3-release-uri> <release-id>" >&2
  exit 2
fi

release_uri="$1"
release_id="$2"
release_dir="/opt/fullja/releases/$release_id"
archive="/tmp/fullja-$release_id.zip"
current="$(readlink -f /opt/fullja/current || true)"

/usr/local/bin/fullja-backup
aws s3 cp "$release_uri" "$archive"
rm -rf "$release_dir"
mkdir -p "$release_dir"
unzip -q "$archive" -d "$release_dir"
test -s "$release_dir/server.js"
test -s "$release_dir/index.html"
rm -rf "$release_dir/data"
chown -R fullja:fullja "$release_dir"

if [ -n "$current" ] && [ -d "$current" ]; then
  ln -sfn "$current" /opt/fullja/previous
fi
ln -sfn "$release_dir" /opt/fullja/current
systemctl restart fullja-cloudguard

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null; then
    echo "Release $release_id is healthy"
    exit 0
  fi
  sleep 1
done

if [ -n "$current" ] && [ -d "$current" ]; then
  ln -sfn "$current" /opt/fullja/current
  systemctl restart fullja-cloudguard
fi
echo "Release $release_id failed health check and was rolled back" >&2
exit 1
