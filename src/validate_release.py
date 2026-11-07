"""Portable manifest/format verification plus accounting checks for the release."""
from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import numpy as np

from src import metrics as m


def verify_manifest(data: Path):
    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    listed = {entry["path"] for entry in manifest["files"]}
    actual = {p.relative_to(data).as_posix() for p in data.rglob("*") if p.suffix in {".gz", ".parquet"}}
    if listed != actual:
        raise AssertionError(f"Manifest differs: missing={listed-actual}, extra={actual-listed}")
    con = duckdb.connect(config={"threads": 2, "memory_limit": "512MB"})
    spill = Path("outputs/verification-spill").resolve()
    spill.mkdir(parents=True, exist_ok=True)
    con.execute("SET temp_directory = ?", [spill.as_posix()])
    tables = 0
    total_rows = 0
    for entry in manifest["files"]:
        path = data / entry["path"]
        assert path.stat().st_size == entry["bytes"], f"Size mismatch: {entry['path']}"
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        assert digest == entry["sha256"], f"Checksum mismatch: {entry['path']}"
        if path.suffix != ".parquet":
            continue
        parquet = con.read_parquet(str(path))
        assert parquet.count("*").fetchall()[0][0] == entry["rows"]
        csv = con.read_csv(str(path.with_suffix(".csv.gz")), columns=dict(zip(parquet.columns, map(str, parquet.types))), header=True)
        parquet.create_view("p", replace=True)
        csv.create_view("c", replace=True)
        assert csv.count("*").fetchall()[0][0] == entry["rows"]
        for left, right in [("p", "c"), ("c", "p")]:
            assert not con.sql(f"(SELECT * FROM {left} EXCEPT ALL SELECT * FROM {right}) LIMIT 1").fetchall(), f"Format difference: {path.name}"
        tables += 1
        total_rows += entry["rows"]
        print(f"Verified {path.stem}: {entry['rows']:,} rows", flush=True)
    con.close()
    return {"files": len(listed), "tables": tables, "rows": total_rows, "version": manifest["version"],
            "sha256_manifest": hashlib.sha256((data / "manifest.json").read_bytes()).hexdigest()}


def accounting_checks():
    daily = m.floor_daily()
    supplied = m.sql(f"SELECT * FROM {m.table('property_day')} ORDER BY gaming_date")
    checks = []
    for ours, theirs in [("coin_in", "coin_in_usd"), ("payout", "payout_usd"), ("house_win", "house_win_usd"),
                         ("theo", "theo_usd"), ("available_hours", "available_machine_hours"), ("occupied_hours", "occupied_machine_hours")]:
        delta = float(np.max(np.abs(daily[ours].to_numpy(float)-supplied[theirs].to_numpy(float))))
        checks.append({"name": f"181 daily {ours} totals reconcile", "passed": delta < .01, "max_absolute_error": delta})
    checks.append({"name": "1,018 off-floor rows excluded", "passed": int(m.summarize().machine_days.iloc[0]) == 55092})
    dst = m.floor_daily("2025-03-08", "2025-03-08").iloc[0]
    checks.append({"name": "DST gaming day has 23 scheduled hours per machine", "passed": bool(dst.scheduled_hours == 23*dst.machines)})
    cards = m.sql(f"SELECT sum(carded_coin_in_cents)/100.0 coin, sum(carded_payout_cents)/100.0 payout FROM {m.table('machine_day')}")
    players = m.sql(f"SELECT sum(tracked_coin_in_usd) coin, sum(tracked_payout_usd) payout FROM {m.table('player_period')}")
    for col in ["coin", "payout"]:
        delta = abs(float(cards[col].iloc[0])-float(players[col].iloc[0]))
        checks.append({"name": f"Tracked {col} matches carded meters, not all-play meters", "passed": delta < .01, "max_absolute_error": delta})
    assert all(c["passed"] for c in checks), checks
    return checks


def main():
    data = m.data_dir()
    manifest = verify_manifest(data)
    commit = subprocess.run(["git", "-C", str(data.parent), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    report = {"generated_at_utc": datetime.now(timezone.utc).isoformat(), "data_commit": commit,
              "release": manifest["version"], "manifest": manifest, "checks": accounting_checks(),
              "method": "Exact SHA-256 and byte sizes for all manifest files; both-direction EXCEPT ALL comparisons of typed CSV and Parquet rows; per-day money reconciliation.",
              "portability_note": "Organizer verify_data.py has a Windows path-separator mismatch before hash checks. This equivalent normalizes relative paths using as_posix().",
              "scope_note": "These are data checks; browser usability, public access, and human submission are separate gates."}
    Path("outputs").mkdir(exist_ok=True)
    Path("outputs/validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
