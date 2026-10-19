import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
release_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
output = ROOT / f"fullja-cloudguard-{release_id}.zip"
files = [
    "index.html",
    "app.js",
    "styles.css",
    "cloud-config.js",
    "server.js",
    "package.json",
    "seed-demo.js",
    "data/store.json",
]
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for relative in files:
        source = ROOT / relative
        if not source.is_file():
            raise FileNotFoundError(source)
        archive.write(source, arcname=Path(relative).as_posix())
print(json.dumps({
    "releaseId": release_id,
    "file": output.name,
    "artifactKey": f"ec2/releases/{release_id}/{output.name}",
    "entries": files,
}, ensure_ascii=False))
