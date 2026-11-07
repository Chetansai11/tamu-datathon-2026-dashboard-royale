"""Catalog-constrained July decision: buy information, preserve option value."""
from __future__ import annotations

import json
from pathlib import Path

from src import metrics as m


def catalog():
    return m.sql(f"SELECT * FROM {m.table('action_catalog')}").set_index("action_type_id").to_dict("index")


def price(row, quantity=1, horizon=30):
    if not isinstance(quantity, int) or quantity < 1 or quantity > row["quantity_limit"]:
        raise ValueError("Quantity must be a positive integer within catalog limit")
    return quantity*(row["unit_cost_cents"] + row["recurring_cost_cents_per_day"]*max(0, horizon-row["lead_days"]))/100


def validate_plan(actions, budget=100000):
    cat = catalog()
    kinds = {a["action_type_id"] for a in actions if a["action_type_id"] != "A-HOLD"}
    if len(kinds) > 3:
        raise ValueError("At most three funded action types")
    if {"A-COMP-PILOT", "A-COMP-CHANGE"} <= kinds:
        raise ValueError("Comp policy actions are incompatible")
    occupied = set()
    cost = 0
    quantities = {}
    for action in actions:
        key = action["action_type_id"]
        row = cat[key]
        quantities[key] = quantities.get(key, 0) + action["quantity"]
        if quantities[key] > row["quantity_limit"]:
            raise ValueError("Cumulative quantity exceeds limit")
        if row["incompatibility_group"] == "same_machine":
            for target in action["targets"]:
                if target in occupied:
                    raise ValueError("Conflicting moves or replacements on the same target")
                occupied.add(target)
        cost += price(row, action["quantity"]) + action.get("additional_comp_cost", 0)
    if cost > budget:
        raise ValueError("Plan exceeds budget")
    return cost


def build_report(q1=None, q3=None, q5=None):
    def read(name):
        return json.loads(Path(f"outputs/{name}.json").read_text(encoding="utf-8"))
    q1 = q1 or read("q1_machines")
    q3 = q3 or read("q3_downtime")
    q5 = q5 or read("q5_comps")
    cat = catalog()
    target = next(x for x in q1["ranking"] if x["machine_id"] == "M-1158")
    row = cat["A-INSPECT"]
    days = max(0, 30-row["lead_days"])
    spend = price(row)
    disruption = row["downtime_minutes"]/60*target["theo_per_avail_hour"]
    conditional_gap = max(0., -target["luck_residual"])/target["machine_days"]*days
    scenario_rows = [{"restored_fraction": f, "gross_conditional_theo": f*conditional_gap,
                      "net_after_inspection_and_modeled_downtime": f*conditional_gap-spend-disruption}
                     for f in [0., .25, .5, 1.]]
    action = {"action_type_id": "A-INSPECT", "name": "Inspect M-1158 and verify its payout configuration", "quantity": 1,
              "targets": ["M-1158"], "cost": spend, "unit_cost": row["unit_cost_cents"]/100,
              "recurring_daily_cost": row["recurring_cost_cents_per_day"]/100, "lead_days": row["lead_days"],
              "operating_days": days, "start_date": "2025-07-02", "end_date": "2025-07-30", "downtime_minutes": row["downtime_minutes"],
              "cost_formula": "1 × (120000 + 0 × max(0, 30 − 1)) / 100 = $1,200",
              "expected_effect": "One documented meter/paytable/configuration verification with a disposition. The inspection itself has no assumed revenue uplift.",
              "uncertainty": "The observed payout gap may be chance, a configuration mismatch or a recording issue. Inspection does not include a guaranteed repair. Reserve funds remain uncommitted until a verified finding and a new quote.",
              "measurement": "Before July 2, archive configuration ID, meter totals and an independent recalculation. On July 2, inspect and record no issue / verified mismatch / further diagnosis. If a correction is separately approved, document the change and monitor actual-minus-theo with supplied variance through July 30; do not judge success by a single month's hold returning to 10%.",
              "evidence_ids": ["q1-inspection", "q1-peers", "actions-budget"],
              "opportunity_cost_theo": disruption,
              "benefit_scenarios": scenario_rows}
    waiting = q3["summary"]["technician_comparison"]["waiting_theo_by_shift"]
    best = max(waiting, key=lambda r: r["waiting_lost_theo"])
    tech_days = 30-cat["A-TECH-SHIFT"]["lead_days"]
    tech_ceiling = best["waiting_lost_theo"]/181*tech_days
    pilot_days = 30-cat["A-COMP-PILOT"]["lead_days"]
    comp_benchmark = q5["summary"]["post_cost_above_pre_reinvestment"]/61*pilot_days
    alternatives = [
        {"name": "Keep all $100,000", "cost": 0, "status": "Valid comparator", "reason": "No disruption or spend; leaves the one floor-wide payout signal unresolved.", "evidence_ids": ["q1-inspection"]},
        {"name": "Add a swing-shift technician", "action_type_id": "A-TECH-SHIFT", "cost": price(cat["A-TECH-SHIFT"]), "lead_days": 7, "operating_days": tech_days,
         "modeled_opportunity": tech_ceiling, "status": "Defer", "reason": f"Even eliminating all historical {best['shift']} waiting with 100% property recapture models only ${tech_ceiling:,.0f} July theo versus $11,520 fixed package. This excludes possible service-quality or long-term value.", "evidence_ids": ["Q3-opportunity", "actions-tradeoffs"]},
        {"name": "Comp policy pilot", "action_type_id": "A-COMP-PILOT", "cost": price(cat["A-COMP-PILOT"]), "lead_days": 5, "operating_days": pilot_days,
         "modeled_opportunity": comp_benchmark, "additional_comp_cost": 0, "status": "Defer", "reason": f"A full reversal of the May-Jun excess-cost benchmark over {pilot_days} days is ${comp_benchmark:,.0f}, below the $4,000 design package before any extra comp costs. The difference is not causal savings; a pilot could still have longer-term learning value.", "evidence_ids": ["Q5-schedule", "actions-tradeoffs"]},
        {"name": "Lease ten replacement machines", "action_type_id": "A-REPLACE-LEASE", "cost": price(cat["A-REPLACE-LEASE"], 10), "lead_days": 14, "operating_days": 16,
         "status": "Reject blanket order", "reason": "Ten units cost $33,800 within July, but two GM candidates are already retired and a new title's incremental demand is unmeasured. No replacement uplift is assumed.", "evidence_ids": ["q1-exposure", "q1-peers"]},
        {"name": "Buy ten replacement machines", "action_type_id": "A-REPLACE-BUY", "cost": price(cat["A-REPLACE-BUY"], 10), "lead_days": 21, "operating_days": 9,
         "status": "Over budget", "reason": "$220,000 capital cost exceeds the $100,000 budget, before any opportunity cost.", "evidence_ids": ["actions-budget"]},
        {"name": "Move machines or buy signage for Back Forty", "status": "Defer", "reason": "The documented walkway reopened April 7. The earlier closure contrast is not evidence that a July relocation or signs would reproduce its inverse.", "evidence_ids": ["demand-location"]}
    ]
    actual_cost = validate_plan([action])
    summary = {"headline": "Inspect one machine. Preserve $98,800.", "budget": 100000, "spend": actual_cost, "reserve": 100000-actual_cost,
               "action_types": 1, "horizon": "2025-07-01 to 2025-07-30", "baseline": "Keep the full $100,000; no assumed uplift and no disruption.",
               "expected_direct_revenue_uplift": 0, "modeled_inspection_downtime_theo": disruption,
               "conditional_gap_29d": conditional_gap, "conditional_break_even_restoration_fraction": (spend+disruption)/conditional_gap,
               "sensitivity_note": "Conditional scenarios are not the funded inspection's expected return. They assume a confirmed persistent, correctable gap and a separately authorized correction at zero additional cost; any repair cost reduces net value. No defect probability is estimated.",
               "decision": "Use one action type to resolve the strongest payout signal. Schedule routine maintenance on lower-demand Tuesdays using existing staff. Keep remaining funds; do not target heavy losers with promotions."}
    evidence = [
        {"id": "actions-budget", "title": "Fund one priced diagnostic action", "source": "action_catalog + q1_machines; src/q6_actions.py::price/build_report",
         "result": f"1 × A-INSPECT: ${actual_cost:,.0f}, one lead day, 120 minutes outage; ${100000-actual_cost:,.0f} unspent. Modeled outage theo ${disruption:.2f}; funded direct revenue uplift $0.",
         "alternative": "Keeping all funds avoids inspection cost but leaves the one family-wise payout signal unresolved.",
         "limitation": "Information value is not monetized; inspection is not a repair guarantee. Conditional restoration is not part of the funded effect."},
        {"id": "actions-tradeoffs", "title": "Do not force July spending without a defensible return", "source": "action_catalog + q3 waiting overlap + q5 pre/post reinvestment; src/q6_actions.py::build_report",
         "result": f"23-day perfect waiting recovery scenario ${tech_ceiling:,.2f} versus $11,520 technician; 25-day comp benchmark ${comp_benchmark:,.2f} versus $4,000 pilot, before extra comps.",
         "alternative": "Service quality, risk reduction and learning after July may justify investment under a broader objective.",
         "limitation": "These are conditional comparisons under measured historical rates, not universal benefit bounds or causal treatment estimates."}
    ]
    return {"summary": summary, "actions": [action], "alternatives": alternatives, "evidence": evidence,
            "measurement_plan": action["measurement"], "scenario_rows": scenario_rows}


def main():
    report = build_report()
    Path("outputs").mkdir(exist_ok=True)
    Path("outputs/actions.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
