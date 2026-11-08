"""Catalog-constrained July tests of leading explanations, with unspent capital preserved."""
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


def back_forty_case(q1d):
    """Back Forty in June: footfall, occupancy and seated play against the rest of the floor."""
    june = m.summarize("zone_name", start="2025-06-01", end="2025-06-30").set_index("zone_name")
    bf, rest = june.loc["Back Forty"], june.drop(index="Back Forty")
    traffic = m.sql(f"""
        SELECT zone_id, SUM(entries_count)::DOUBLE / NULLIF(SUM(coverage_minutes) / 60.0, 0) AS per_hour
        FROM {m.table('zone_traffic_hourly')}
        WHERE entries_count IS NOT NULL AND coverage_minutes > 0
          AND CAST(hour_start_local - INTERVAL 6 HOUR AS DATE) BETWEEN DATE '2025-06-01' AND DATE '2025-06-30'
        GROUP BY 1""").set_index("zone_id").per_hour
    zone = next(z for z in q1d["zones"] if z["zone_name"] == "Back Forty")
    return {
        "june_available_hours_per_day": float(bf.available_hours) / 30,
        "june_occupancy": float(bf.occupancy),
        "other_zones_occupancy": float(rest.occupied_hours.sum() / rest.available_hours.sum()),
        "june_theo_per_occupied_hour": float(bf.theo / bf.occupied_hours),
        "other_theo_per_occupied_hour": float(rest.theo.sum() / rest.occupied_hours.sum()),
        "june_avg_bet": float(bf.avg_bet),
        "other_avg_bet": float(rest.coin_in.sum() / rest.spins.sum()),
        "june_entries_per_covered_hour": float(traffic.get("Z-B40")),
        "other_entries_per_covered_hour": float(traffic.drop("Z-B40").mean()),
        "location_factor_6m": zone["location_factor"],
        "theo_vs_game_mix_6m": zone["theo_vs_game_mix"],
        "location_factor_by_month": {r["month"]: r["location_factor"] for r in q1d["zone_monthly"] if r["zone_name"] == "Back Forty"},
    }


def build_report(q1=None, q3=None, q5=None, q1d=None):
    def read(name):
        return json.loads(Path(f"outputs/{name}.json").read_text(encoding="utf-8"))
    q1 = q1 or read("q1_machines")
    q3 = q3 or read("q3_downtime")
    q5 = q5 or read("q5_comps")
    q1d = q1d or read("q1_decomposition")
    cat = catalog()

    # Inspect the payout signal; the screen does not establish a defect or its cause.
    target = next(x for x in q1["ranking"] if x["machine_id"] == "M-1158")
    row = cat["A-INSPECT"]
    days = max(0, 30-row["lead_days"])
    spend = price(row)
    disruption = row["downtime_minutes"]/60*target["theo_per_avail_hour"]
    conditional_gap = max(0., -target["luck_residual"])/target["machine_days"]*days
    scenario_rows = [{"restored_fraction": f, "gross_conditional_house_win": f*conditional_gap,
                      "net_after_inspection_and_modeled_downtime": f*conditional_gap-spend-disruption}
                     for f in [0., .25, .5, 1.]]
    action = {"action_type_id": "A-INSPECT", "name": "Inspect M-1158 and verify its payout configuration", "quantity": 1,
              "cause": "Payout signal",
              "targets": ["M-1158"], "cost": spend, "unit_cost": row["unit_cost_cents"]/100,
              "recurring_daily_cost": row["recurring_cost_cents_per_day"]/100, "lead_days": row["lead_days"],
              "operating_days": days, "start_date": "2025-07-02", "end_date": "2025-07-30", "downtime_minutes": row["downtime_minutes"],
              "cost_formula": "1 × (120000 + 0 × max(0, 30 − 1)) / 100 = $1,200",
              "expected_effect": "One documented meter/paytable/configuration verification with a disposition. The inspection itself has no assumed revenue uplift.",
              "uncertainty": "The observed payout gap may be chance, a configuration mismatch or a recording issue. Inspection does not include a guaranteed repair. Reserve funds remain uncommitted until a verified finding and a new quote.",
              "measurement": "Before July 2, archive configuration ID, meter totals and an independent recalculation. On July 2, inspect and record no issue / verified mismatch / further diagnosis. If a correction is separately approved, document the change and monitor actual-minus-theo with supplied variance through July 30; do not judge success by a single month's hold returning to 10%.",
              "evidence_ids": ["q1-inspection", "q1-decomposition", "actions-budget"],
              "opportunity_cost_theo": disruption,
              "benefit_scenarios": scenario_rows}

    # Location: Back Forty wayfinding test.
    gm_machine = q1d["gm_bottom10_totals"]["machine"]
    bf = back_forty_case(q1d)
    way = cat["A-WAYFINDING"]
    way_days = max(0, 30-way["lead_days"])
    way_cost = price(way)
    value_per_point = bf["june_available_hours_per_day"]*0.01*bf["june_theo_per_occupied_hour"]
    break_even_points = way_cost/(value_per_point*way_days)
    way_rows = [{"occupancy_points_gained": pts, "displaced_from_other_zones": disp,
                 "zone_theo": pts*value_per_point*way_days,
                 "property_net_theo": pts*value_per_point*way_days*(1-disp)-way_cost}
                for pts in [0., .5, 1., 2.] for disp in [0., .5] if pts or not disp]
    march = bf["location_factor_by_month"].get("2025-03")
    wayfinding = {
        "action_type_id": "A-WAYFINDING", "name": "Wayfinding and sightlines for Back Forty", "quantity": 1, "cause": "Location hypothesis",
        "targets": ["Z-B40"], "cost": way_cost, "unit_cost": way["unit_cost_cents"]/100,
        "recurring_daily_cost": 0, "lead_days": way["lead_days"], "operating_days": way_days,
        "start_date": "2025-07-11", "end_date": "2025-07-30", "downtime_minutes": 0,
        "cost_formula": "1 × (750000 + 0 × max(0, 30 − 10)) / 100 = $7,500",
        "expected_effect": (f"Test whether more guests reach Back Forty; no occupancy gain is assumed. In June its seats were occupied {bf['june_occupancy']:.1%} of available hours versus "
                            f"{bf['other_zones_occupancy']:.1%} elsewhere, with {bf['june_entries_per_covered_hour']:.0f} sensor entries per covered hour versus "
                            f"{bf['other_entries_per_covered_hour']:.0f}, while seated play earns nearly the same (${bf['june_theo_per_occupied_hour']:.2f} vs "
                            f"${bf['other_theo_per_occupied_hour']:.2f} theo per occupied hour). At June capacity and play rates, each additional occupancy point implies ${value_per_point:,.0f} gross theo per day. "
                            f"The conditional July break-even is +{break_even_points:.2f} occupancy points with zero displacement and no additional operating costs."),
        "uncertainty": ("Signage may not change footfall, and guests drawn to Back Forty may come from other zones (see the 50% displacement rows). "
                        f"During the March walkway closure the zone's location factor fell to {march:.2f}, then recovered. This association is consistent with access pressure, "
                        "but does not identify a causal access or signage effect; game mix, guest mix and concurrent changes remain alternatives."),
        "measurement": ("Pre-register June baselines for Back Forty: occupancy, entries per covered sensor-hour and location factor. From July 11 to 30, compare "
                        "with June by difference-in-differences against Garage Entrance and Hotel Corridor on matched weekdays. Check floor-total coin-in "
                        "against the exported July 1-30 frozen reference. Watch a completed gaming day outside its dated lower/upper thresholds; review two consecutive same-direction breaches. "
                        "Missing days reset that streak. Reconcile meters and availability first; these operational alerts do not identify displacement or a causal pilot effect. "
                        "The initial zone signal to review is Back Forty occupancy up at least 1 point with more entries, "
                        "but that alone is not evidence of incremental revenue or cost recovery. Assess uncertainty, displaced play and statistical power before any expansion; a second zone requires a new decision."),
        "evidence_ids": ["q1-decomposition", "back-forty-footfall", "demand-location"],
        "opportunity_cost_theo": 0.,
        "benefit_scenarios": way_rows}

    waiting = q3["summary"]["technician_comparison"]["waiting_theo_by_shift"]
    best = max(waiting, key=lambda r: r["waiting_lost_theo"])
    tech_days = 30-cat["A-TECH-SHIFT"]["lead_days"]
    tech_ceiling = best["waiting_lost_theo"]/181*tech_days
    pilot_days = 30-cat["A-COMP-PILOT"]["lead_days"]
    comp_benchmark = q5["summary"]["post_cost_above_pre_reinvestment"]/61*pilot_days
    alternatives = [
        {"name": "Keep all $100,000", "cost": 0, "status": "Valid comparator", "reason": "No disruption or spend, but leaves both the payout signal and Back Forty's footfall gap untested.", "evidence_ids": ["q1-inspection", "q1-decomposition"]},
        {"name": "Lease ten replacement machines", "action_type_id": "A-REPLACE-LEASE", "cost": price(cat["A-REPLACE-LEASE"], 10), "lead_days": 14, "operating_days": 16,
         "status": "Defer blanket replacement", "reason": f"The combined descriptive machine component is ${gm_machine:,.0f}; the larger negative components relate to game math, location and exposure. This does not establish that each machine is healthy or estimate a replacement effect. Nine candidates spent time in Back Forty during the investigation, and two are already retired. Inspect individual evidence before purchasing replacements.", "evidence_ids": ["q1-decomposition", "q1-exposure"]},
        {"name": "Buy ten replacement machines", "action_type_id": "A-REPLACE-BUY", "cost": price(cat["A-REPLACE-BUY"], 10), "lead_days": 21, "operating_days": 9,
         "status": "Over budget", "reason": "$220,000 capital cost exceeds the $100,000 budget; the descriptive decomposition does not establish that replacing all ten would recover their earnings gap.", "evidence_ids": ["actions-budget", "q1-decomposition"]},
        {"name": "Move machines out of Back Forty", "action_type_id": "A-MOVE-MACHINE", "cost": price(cat["A-MOVE-MACHINE"]), "status": "Defer",
         "reason": "Seated play in Back Forty earns within 5% of elsewhere, but that comparison does not estimate relocation uplift. A move could redistribute existing play or change total demand. Check destination feasibility, comparable-machine support, disruption and displacement before funding a move.", "evidence_ids": ["back-forty-footfall"]},
        {"name": "Add a swing-shift technician", "action_type_id": "A-TECH-SHIFT", "cost": price(cat["A-TECH-SHIFT"]), "lead_days": 7, "operating_days": tech_days,
         "modeled_opportunity": tech_ceiling, "status": "Defer", "reason": f"Even eliminating all historical {best['shift']} waiting with 100% property recapture models only ${tech_ceiling:,.0f} July theo versus the $11,520 fixed package.", "evidence_ids": ["Q3-opportunity", "actions-tradeoffs"]},
        {"name": "Comp policy pilot", "action_type_id": "A-COMP-PILOT", "cost": price(cat["A-COMP-PILOT"]), "lead_days": 5, "operating_days": pilot_days,
         "modeled_opportunity": comp_benchmark, "additional_comp_cost": 0, "status": "Defer", "reason": f"A full reversal of the May-Jun excess-cost benchmark over {pilot_days} days is ${comp_benchmark:,.0f}, below the $4,000 design package before any extra comp costs.", "evidence_ids": ["Q5-schedule", "actions-tradeoffs"]},
    ]
    actions = [action, wayfinding]
    actual_cost = validate_plan(actions)
    summary = {"headline": f"Inspect the signal, test the location, keep ${100000-actual_cost:,.0f}.", "budget": 100000, "spend": actual_cost,
               "reserve": 100000-actual_cost, "action_types": len(actions), "horizon": "2025-07-01 to 2025-07-30",
               "baseline": "Keep the full $100,000; no assumed uplift and no disruption.",
               "expected_direct_revenue_uplift": 0, "modeled_inspection_downtime_theo": disruption,
               "conditional_gap_house_win_29d": conditional_gap, "conditional_break_even_restoration_fraction": (spend+disruption)/conditional_gap,
               "wayfinding_break_even_occupancy_points": break_even_points, "occupancy_point_value_theo_per_day": value_per_point,
               "back_forty": bf, "gm_machine_component": gm_machine,
               "sensitivity_note": "Scenarios are conditional, not forecasts. Inspection rows assume a confirmed, correctable payout gap fixed at no extra cost. Wayfinding rows assume an occupancy gain and show half of it displaced from other zones.",
               "decision": "Fund tests of the leading explanations: inspect the corrected payout signal and test Back Forty wayfinding. Defer blanket replacement because the current evidence does not establish a replacement benefit; a positive combined machine component does not clear every machine. Schedule routine maintenance on lower-demand Tuesdays using existing staff. Keep the rest; do not target heavy losers with promotions."}
    evidence = [
        {"id": "back-forty-footfall", "title": "Back Forty has lower footfall and similar seated-play economics",
         "source": "prepared_daily_view (June) + zone_traffic_hourly (covered hours, gaming dates); src/q6_actions.py::back_forty_case",
         "result": f"June occupancy {bf['june_occupancy']:.1%} vs {bf['other_zones_occupancy']:.1%} elsewhere; {bf['june_entries_per_covered_hour']:.1f} vs {bf['other_entries_per_covered_hour']:.1f} entries per covered sensor-hour (other-zone mean); theo per occupied hour ${bf['june_theo_per_occupied_hour']:.2f} vs ${bf['other_theo_per_occupied_hour']:.2f}; average bet ${bf['june_avg_bet']:.2f} vs ${bf['other_avg_bet']:.2f}.",
         "alternative": "Guest preferences, game appeal and location selection could also leave seats empty. Similar average seated-play economics do not rule out these differences.",
         "limitation": "Sensors count crossings, not people. Footfall and seated-play comparisons are descriptive; signage and relocation effects remain unmeasured."},
        {"id": "actions-budget", "title": "Price tests against the leading explanations",
         "source": "action_catalog + q1_machines + q1_decomposition; src/q6_actions.py::price/build_report",
         "result": f"1 × A-INSPECT ($1,200, 1 lead day) + 1 × A-WAYFINDING for Back Forty ($7,500, 10 lead days) = ${actual_cost:,.0f}; ${100000-actual_cost:,.0f} unspent. At June rates with zero displacement and no extra operating costs, wayfinding breaks even at +{break_even_points:.2f} occupancy points over {way_days} days; at 50% displacement the requirement doubles.",
         "alternative": "Keeping all funds avoids cost but leaves both the payout signal and the footfall gap untested.",
         "limitation": "Information value is not monetized; inspection is not a repair guarantee, and wayfinding uplift remains an untested hypothesis. The break-even calculation is conditional, not an estimated effect."},
        {"id": "actions-tradeoffs", "title": "Do not force July spending without a defensible return",
         "source": "action_catalog + q3 waiting overlap + q5 pre/post reinvestment; src/q6_actions.py::build_report",
         "result": f"23-day perfect waiting recovery scenario ${tech_ceiling:,.2f} versus $11,520 technician; 25-day comp benchmark ${comp_benchmark:,.2f} versus $4,000 pilot, before extra comps.",
         "alternative": "Service quality, risk reduction and learning after July may justify investment under a broader objective.",
         "limitation": "These are conditional comparisons under measured historical rates, not universal benefit bounds or causal treatment estimates."},
    ]
    return {"summary": summary, "actions": actions, "alternatives": alternatives, "evidence": evidence,
            "measurement_plan": action["measurement"] + " " + wayfinding["measurement"], "scenario_rows": scenario_rows,
            "wayfinding_rows": way_rows}


def main():
    report = build_report()
    Path("outputs").mkdir(exist_ok=True)
    Path("outputs/actions.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in report["summary"].items() if k != "back_forty"}, indent=2))
    print(json.dumps(report["summary"]["back_forty"], indent=1))


if __name__ == "__main__":
    main()
