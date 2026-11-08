"""Build an offline dashboard from source tables and reproducible report JSON.

Run python -m src.build_dashboard after the analysis scripts. No web dependencies.
The generated bundle uses ordinary scripts so file:// works without a server.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from src import metrics as m

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ["date", "machine", "zone", "bank", "coin", "payout", "theo", "available", "scheduled", "occupied", "variance", "costs", "faults", "carded"]


def clean(value):
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()[:10]
    if isinstance(value, np.generic):
        return clean(value.item())
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def records(frame):
    return clean(frame.to_dict("records"))


def build(output=ROOT / "dashboard", reports_dir=ROOT / "outputs"):
    output, reports_dir = Path(output), Path(reports_dir)
    output.mkdir(parents=True, exist_ok=True)
    frame = m.sql("""SELECT strftime(gaming_date,'%Y-%m-%d') AS date, machine_id AS machine,
        zone_id AS zone, bank_id AS bank, coin_in_usd::DOUBLE AS coin,
        payout_usd::DOUBLE AS payout, theo_usd::DOUBLE AS theo,
        available_hours AS available, scheduled_hours AS scheduled,
        occupied_hours AS occupied, house_win_var_usd2 AS variance,
        (lease_cost_usd+service_cost_usd+power_cost_usd+repair_cost_usd)::DOUBLE AS costs,
        faults_opened AS faults, carded_coin_in_usd::DOUBLE AS carded
        FROM floor ORDER BY gaming_date,machine_id""")
    reports = {}
    for key, filename in {
        "q1": "q1_machines.json", "decomp": "q1_decomposition.json", "q2": "q2_demand.json", "q3": "q3_downtime.json",
        "guests": "q4_guests.json", "comps": "q5_comps.json", "forecast": "forecast.json",
        "actions": "actions.json", "guest_windows": "guest_windows.json", "validation": "validation.json",
    }.items():
        path = reports_dir / filename
        if path.exists():
            reports[key] = json.loads(path.read_text(encoding="utf-8-sig"))
    # Release verification pins source provenance even for an extracted archive.
    commit = reports.get("validation", {}).get("data_commit")
    if not commit:
        try:
            commit = subprocess.check_output(["git", "-C", str(m.data_dir().parent), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
        except (OSError, subprocess.CalledProcessError):
            commit = "unavailable"
    data = {
        "meta": {"built_utc": datetime.now(timezone.utc).isoformat(), "release": "0.9.0-draft", "data_commit": commit,
                 "start": str(frame.date.min()), "end": str(frame.date.max()), "machine_days": len(frame),
                 "synthetic": True},
        "schema": SCHEMA,
        "daily": clean(frame.values.tolist()),
        "locations": records(m.sql("SELECT DISTINCT zone_id,zone_name,bank_id FROM floor ORDER BY zone_name,bank_id")),
        "machines": records(m.sql("SELECT DISTINCT machine_id,manufacturer,theme,volatility_class FROM floor ORDER BY machine_id")),
        "property": records(m.sql(f"SELECT * FROM {m.table('property_day')} ORDER BY gaming_date")),
        "reports": reports,
    }
    (output / "data.js").write_text("window.DR_DATA=" + json.dumps(clean(data), separators=(",", ":"), allow_nan=False) + ";\n", encoding="utf-8")
    for name in ["index.html", "styles.css", "app.js"]:
        shutil.copy2(ROOT / "src" / "app" / name, output / name)
    (output / "reports.json").write_text(json.dumps(clean(reports), indent=2, allow_nan=False), encoding="utf-8")
    summary = {"directory": str(output), "machine_days": len(frame), "reports": sorted(reports), "data_bytes": (output / "data.js").stat().st_size}
    print(json.dumps(summary))
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "dashboard")
    parser.add_argument("--reports-dir", type=Path, default=ROOT / "outputs")
    args = parser.parse_args()
    build(args.output, args.reports_dir)
