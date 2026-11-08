"""Package the local enhanced dashboard and source; no Git or hosting operations."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[2]
entries = {}
for folder in ["src", "tests", "web"]:
    for path in (ROOT / folder).rglob("*"):
        parts = path.relative_to(ROOT / folder).parts
        if not path.is_file() or any(p in {"node_modules", "dist", "data", ".vite", "test-output", "__pycache__"} for p in parts[:-1]):
            # The derived browser data is added explicitly below, never raw data.
            continue
        if path.suffix not in {".pyc", ".tsbuildinfo", ".zip"}:
            entries["source/" + path.relative_to(ROOT).as_posix()] = path
for path in (ROOT / "web/public/data").glob("*.json"):
    entries["source/" + path.relative_to(ROOT).as_posix()] = path
for name in ["README.md", "AGENTS.md", "package.json", "vercel.json", ".vercelignore", "requirements-dashboard.txt", "docs/build_appendix.py", "dashboard/reports.json"]:
    entries["source/" + name] = ROOT / name
for path in (ROOT / "web/dist").rglob("*"):
    if path.is_file():
        entries["site/" + path.relative_to(ROOT / "web/dist").as_posix()] = path
assert "site/offline.html" in entries
assert "site/docs/AI_DISCLOSURE.md" in entries
assert len((ROOT / "web/public/docs/WRITEUP.md").read_text(encoding="utf-8").split()) <= 400
manifest = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in sorted(entries.items())}
archive = ROOT / "outputs/gilded-ace-enhanced-submission.zip"
archive.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name, path in sorted(entries.items()):
        z.write(path, name)
    z.writestr("CONTENTS.sha256.json", json.dumps(manifest, indent=2))
    z.writestr("START_HERE.txt", "THE GILDED ACE - LOCAL SUBMISSION PACKAGE\n\nOpen site/offline.html. Keep site/docs and site/data alongside it for downloads.\nUse only site/docs for submission documents. The canonical combined AI disclosure is site/docs/AI_DISCLOSURE.md.\n\nSource lives in source/. Requires Node >=22.12 to rebuild: cd source/web, npm ci, npm run build.\nRepackage from source/: python web/scripts/package-submission.py.\n\nThis package is generated from the current checkout and may include uncommitted changes. It does not establish a deployed update, public access, a recorded video, or Devpost submission. See site/docs/DEVPOST_COPY.md.\n")
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert all(hashlib.sha256(z.read(name)).hexdigest() == digest for name, digest in manifest.items())
print(json.dumps({"archive": str(archive), "files": len(entries) + 2, "bytes": archive.stat().st_size, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}))
