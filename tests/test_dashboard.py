"""Verify independent source reconciliation and JavaScript filter arithmetic."""
import json
import subprocess
from pathlib import Path

import pytest

from src import metrics as m
from src.build_dashboard import ROOT, SCHEMA, build


@pytest.fixture(scope="module")
def bundle():
    # Windows managed sandboxes may not grant pytest access to their temp root.
    # A deterministic, ignored workspace artifact also makes failures inspectable.
    return build(ROOT / "outputs" / "dashboard-test")


def test_exported_floor_matches_property_accounting(bundle):
    pos = {k: i for i, k in enumerate(SCHEMA)}
    sums = {}
    for r in bundle["daily"]:
        total = sums.setdefault(r[pos["date"]], [0.0, 0.0, 0.0])
        for i, key in enumerate(["coin", "payout", "theo"]):
            total[i] += r[pos[key]]
    assert len(sums) == 181
    for day in bundle["property"]:
        actual = sums[day["gaming_date"]]
        assert actual == pytest.approx([day["coin_in_usd"], day["payout_usd"], day["theo_usd"]], abs=0.001)


def test_export_preserves_dst_and_excludes_off_floor(bundle):
    pos = {k: i for i, k in enumerate(SCHEMA)}
    assert len(bundle["daily"]) == 55092
    assert all(r[pos["zone"]] and r[pos["bank"]] for r in bundle["daily"])
    assert {r[pos["scheduled"]] for r in bundle["daily"] if r[pos["date"]] == "2025-03-08"} == {23.0}


def test_js_filter_and_ratio_match_independent_sql(bundle):
    expectations = []
    for start, end, zone, bank in [("2025-01", "2025-06", "", ""), ("2025-03", "2025-04", "Z-B40", ""), ("2025-06", "2025-06", "", "B-51")]:
        clauses = ["month >= ?", "month <= ?"]
        params = [start, end]
        if zone:
            clauses.append("zone_id = ?")
            params.append(zone)
        if bank:
            clauses.append("bank_id = ?")
            params.append(bank)
        expected = m.sql("SELECT sum(coin_in_usd)::DOUBLE coin, sum(house_win_usd)::DOUBLE win, sum(available_hours)/sum(scheduled_hours) availability FROM floor WHERE " + " AND ".join(clauses), params).iloc[0].to_dict()
        expectations.append({"filters": {"start":start,"end":end,"zone":zone,"bank":bank}, "expected": expected})
    script = Path(__file__).with_name("dashboard_checks.cjs")
    result = subprocess.run(["node", str(script), str(ROOT / "src/app/app.js")], input=json.dumps({"bundle":bundle,"expectations":expectations}), text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Dashboard arithmetic checks passed" in result.stdout


def test_bundle_is_offline_and_contains_no_guest_identifiers(bundle):
    html = (ROOT / "src/app/index.html").read_text(encoding="utf-8")
    assert 'src="data.js"' in html
    assert 'src="app.js"' in html
    assert "https://" not in html
    js = (ROOT / "src/app/app.js").read_text(encoding="utf-8")
    assert "fetch(" not in js
    assert "player_id" not in json.dumps(bundle["reports"].get("guests", {}))
