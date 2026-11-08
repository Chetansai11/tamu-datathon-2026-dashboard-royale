"""Create a local, explicit-allowlist submission ZIP; never publish or push."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(module):
    subprocess.run([sys.executable, "-m", module], cwd=ROOT, check=True)


def package():
    required = ["dashboard/index.html", "dashboard/data.js", "dashboard/app.js", "dashboard/styles.css",
                "docs/WRITEUP.md", "docs/CLAIMS_EVIDENCE.md", "docs/AI_DISCLOSURE.md", "docs/VIDEO_SCRIPT.md",
                "docs/HANDOFF.md", "outputs/validation.json"]
    for relative in required:
        if not (ROOT / relative).is_file():
            raise FileNotFoundError(f"Missing required deliverable: {relative}")
    reports = json.loads((ROOT / "dashboard/reports.json").read_text(encoding="utf-8"))
    for report in ["q1", "q2", "q3", "guests", "comps", "forecast", "actions", "validation"]:
        if report not in reports:
            raise ValueError(f"Dashboard missing {report} report")
    if len((ROOT / "docs/WRITEUP.md").read_text(encoding="utf-8").split()) > 400:
        raise ValueError("Main write-up exceeds 400 words")
    paths = []
    for folder in ["src", "tests", "docs", "dashboard"]:
        paths.extend(p for p in (ROOT / folder).rglob("*") if p.is_file() and "__pycache__" not in p.parts
                     and p.suffix.lower() in {".py", ".js", ".cjs", ".css", ".html", ".md", ".json", ".png"})
    paths.extend(ROOT / name for name in ["README.md", "requirements-dashboard.txt"])
    paths.extend((ROOT / "outputs").glob("*.json"))
    paths.extend((ROOT / "outputs").glob("q1_ranking.csv"))
    entries = sorted(set(paths), key=lambda p: p.relative_to(ROOT).as_posix())
    manifest = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in entries}
    archive = ROOT / "outputs/dashboard-royale-submission.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in entries:
            z.write(p, p.relative_to(ROOT).as_posix())
        z.writestr("PACKAGE_SHA256.json", json.dumps(manifest, indent=2))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        names = z.namelist()
        assert all(not n.startswith(("data/", ".git/", ".env")) for n in names)
        assert all(hashlib.sha256(z.read(name)).hexdigest() == digest for name, digest in manifest.items())
    print(json.dumps({"archive": str(archive), "files": len(entries)+1, "bytes": archive.stat().st_size,
                      "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}, indent=2))
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rebuild", action="store_true", help="Regenerate all analysis reports and the dashboard before packaging")
    parser.add_argument("--verify-data", action="store_true", help="Recheck all original hashes and format pairs (takes several minutes)")
    args = parser.parse_args()
    if args.verify_data:
        run("src.validate_release")
    if args.rebuild:
        for module in ["src.q1_machines", "src.q1_decomposition", "src.q2_demand", "src.q3_downtime", "src.forecast", "src.placement_model", "src.q4_q5_players", "src.q6_actions", "src.build_dashboard"]:
            run(module)
    package()
