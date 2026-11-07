"""Regenerate the evidence appendix from the exact reports embedded in the UI."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
reports = json.loads((root / "dashboard/reports.json").read_text(encoding="utf-8"))

def cell(value):
    return str(value or "").replace("|", "\\|").replace("\n", " ")

lines = ["# Claims and Evidence appendix", "",
         "All casino observations are synthetic. The analysis covers January 1–June 30, 2025; the proposed action budget covers July 1–30. Monetary values are USD. This appendix is generated from the dashboard's report bundle.", "",
         "## Claim register", "",
         "| Claim and dashboard evidence ID | Table and query | Result and comparison | Alternative explanation | Limitation |",
         "| --- | --- | --- | --- | --- |"]
for key, report in reports.items():
    if not isinstance(report, dict):
        continue
    for row in report.get("evidence", report.get("claims", [])):
        label = row.get("title", row.get("claim", row["id"]))
        source = row.get("source", "")
        if row.get("query"):
            source += "; " + row["query"]
        if row.get("method"):
            source += ". " + row["method"]
        values = [f"{label} ({row['id']})", source, row.get("result"), row.get("alternative"), row.get("limitation")]
        lines.append("| " + " | ".join(cell(v) for v in values) + " |")
lines += ["", "## Every machine in the GM list", "",
          "Baseline: rank total actual house win ascending. Local demand index = total theo / available-hour exposure times leave-one-out same-config, same-zone, same-date peer theo rate (minimum three peers; floor same-config fallback). Intervals are descriptive 95% weekly block bootstrap intervals, not simultaneous causal tests. Location index compares that local expectation to same-game floor peers. Payout p-values use a two-sided normal approximation and Bonferroni correction over all 310 machines.", "",
          "| Machine | On-floor days | Actual win | Theo per available hour | Local demand index and 95% interval | Location index | Availability | Payout z and adjusted p | Decision |",
          "| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | --- |"]
for x in reports["q1"]["bottom10"]:
    values = [x["machine_id"], f"{x['machine_days']:.0f}", f"${x['house_win']:,.2f}", f"${x['theo_per_avail_hour']:.2f}",
              f"{x['adjusted_index']:.3f} [{x['adjusted_ci_low']:.3f}, {x['adjusted_ci_high']:.3f}]",
              f"{x['location_index']:.3f}", f"{x['availability']:.3%}", f"{x['luck_z']:.3f}; p={x['payout_p_bonferroni']:.6f}", x["diagnosis"]]
    lines.append("| " + " | ".join(cell(v) for v in values) + " |")
lines += ["", "Each machine's full report also provides down hours, peer fallback counts, game/manufacturer, dated banks, null hold bands and competing luck/location/downtime/demand tests. Retired machines are not eligible for a second replacement order.", "",
          "## July action and tradeoffs", "",
          "| Choice | Cost | Timing and effect | Why |", "| --- | ---: | --- | --- |"]
for a in reports["actions"]["actions"]:
    lines.append(f"| {cell(a['name'])} | ${a['cost']:,.0f} | {a['lead_days']} lead day; {a['operating_days']} remaining days; {a['downtime_minutes']} minutes unavailable. {cell(a['expected_effect'])} | {cell(a['measurement'])} |")
for a in reports["actions"]["alternatives"]:
    cost = f"${a['cost']:,.0f}" if "cost" in a else "Not funded"
    lines.append(f"| {cell(a['name'])} | {cost} | {cell(a['status'])} | {cell(a['reason'])} |")
summary = reports["actions"]["summary"]
lines += ["", f"Funded spend ${summary['spend']:,.0f}; unspent ${summary['reserve']:,.0f}. {summary['sensitivity_note']}", "",
          "## Validation and provenance", ""]
v = reports["validation"]
lines += [f"Data commit `{v['data_commit']}`, release `{v['release']}`. Verified {v['manifest']['files']} SHA-256 checksums and byte sizes, {v['manifest']['tables']} exact typed CSV/Parquet pairs totaling {v['manifest']['rows']:,} rows, and {len(v['checks'])} accounting/time/scope checks. All six checked floor totals match the supplied property table exactly on every one of 181 dates.", "",
          "The organizer's checksum utility compares POSIX manifest names with Windows path strings and stops before hashing. Our portable verifier normalizes relative separators; it does not waive any checksum, size, duplicate-row or parity test.", "",
          "Reproduce with the module commands in README, then run `python docs/build_appendix.py`. Model selection uses Jan–Feb fitting and Mar–Apr validation, refits on Jan–Apr, and evaluates May–Jun once. Tourism, realized holdout weather and future repairs are excluded. The empirical nominal 90% forecast interval achieved 85.25% coverage, so it is not a guaranteed coverage statement.", "",
          "## External context sources", ""]
for source in reports["q2"].get("sources", []):
    lines.append(f"- [{source['name']}]({source['url']}): {source['use']}")
lines += ["", "External observations describe destination tourism or calendar-day airport weather, not this casino's customer population. The bundled 2026 revisions were not available at a 2025 forecast origin. Raw LVCVA and Missouri tables are omitted from the submitted artifact.", "",
          "## Scope and disclosure", "",
          "Guest figures are carded-only; concentration ranks each player's summed window results before computing shares. Loss concentration uses summed gross positive losses among losing players, not net losses after offsetting winners. Wagers include replay. Comp face value is not revenue or economic cost; comp cost is already inside POS cogs. Supplied costs do not establish net profit.", "",
          "Read [AI use disclosure](AI_DISCLOSURE.md) for tool contributions and review responsibilities. The local artifact is complete; public hosting, recorded video and Devpost submission are separate human gates.", ""]
(root / "docs/CLAIMS_EVIDENCE.md").write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {len(lines)} lines to docs/CLAIMS_EVIDENCE.md")
