"""Q1: exposure-adjusted demand, location association and payout diagnostics.

Run ``python -m src.q1_machines``. Retrospective peer adjustment is descriptive,
not an estimate of a relocation or replacement's causal effect.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from src import metrics as m


def peer_rate(frame: pd.DataFrame, keys: list[str], minimum: int = 3):
    """Leave this machine-day out of numerator, exposure and peer count."""
    grouped = frame.groupby(keys, dropna=False)
    hours = grouped.available_hours.transform("sum") - frame.available_hours
    theo = grouped.theo_usd.transform("sum") - frame.theo_usd
    count = grouped.machine_id.transform("count") - 1
    return (theo / hours.where(hours > 0)).where(count >= minimum), count


def weekly_ratio_interval(frame: pd.DataFrame, repetitions: int = 2000, seed: int = 2026):
    """Paired calendar-week block bootstrap; includes shared demand fluctuations."""
    week = (pd.to_datetime(frame.gaming_date) - pd.Timestamp("2025-01-01")).dt.days // 7
    blocks = frame.groupby(week)[["theo_usd", "expected_theo"]].sum().to_numpy(float)
    if len(blocks) < 4:
        return None, None
    rng = np.random.default_rng(seed)
    draws = blocks[rng.integers(0, len(blocks), size=(repetitions, len(blocks)))].sum(axis=1)
    ratios = draws[:, 0] / draws[:, 1]
    return tuple(float(x) for x in np.quantile(ratios, [0.025, 0.975]))


def adjusted_days(start="2025-01-01", end="2025-06-30"):
    d = m.machine_days(start, end).copy()
    for col in ["theo_usd", "available_hours", "scheduled_hours"]:
        d[col] = d[col].astype(float)
    zone, counts = peer_rate(d, ["gaming_date", "zone_id", "config_id"])
    global_rate, _ = peer_rate(d, ["gaming_date", "config_id"], minimum=1)
    bank, _ = peer_rate(d, ["gaming_date", "bank_id", "config_id"])
    d["peer_rate"] = zone.fillna(global_rate)
    d["peer_fallback"] = zone.isna()
    d["peer_count"] = counts
    d["expected_theo"] = d.available_hours * d.peer_rate
    d["global_expected_theo"] = d.available_hours * global_rate
    d["bank_expected_theo"] = d.available_hours * bank
    d["down_theo_opportunity"] = (d.scheduled_hours - d.available_hours) * d.peer_rate
    return d


def analyze(start="2025-01-01", end="2025-06-30"):
    d = adjusted_days(start, end)
    base = m.summarize("machine_id", start, end).set_index("machine_id")
    bottom_ids = m.manager_bottom10(start, end).machine_id.tolist()
    total_days = (pd.Timestamp(end) - pd.Timestamp(start)).days + 1
    records = []
    for machine, rows in d.groupby("machine_id", sort=True):
        record = base.loc[machine].to_dict()
        record["machine_id"] = machine
        record["expected_theo"] = float(rows.expected_theo.sum())
        record["adjusted_index"] = record["theo"] / record["expected_theo"]
        record["adjusted_ci_low"], record["adjusted_ci_high"] = weekly_ratio_interval(rows)
        record["location_index"] = record["expected_theo"] / float(rows.global_expected_theo.sum())
        record["down_theo_opportunity"] = float(rows.down_theo_opportunity.sum())
        record["peer_fallback_days"] = int(rows.peer_fallback.sum())
        record["min_zone_peers"] = int(rows.peer_count.min())
        bank_rows = rows[rows.bank_expected_theo.notna()]
        record["bank_matched_days"] = len(bank_rows)
        record["bank_adjusted_index"] = (float(bank_rows.theo_usd.sum() / bank_rows.bank_expected_theo.sum())
                                          if len(bank_rows) else None)
        record["bank_ids"] = sorted(rows.bank_id.unique().tolist())
        record["zone_names"] = sorted(rows.zone_name.unique().tolist())
        record["theme"] = rows.theme.iloc[0]
        record["manufacturer"] = rows.manufacturer.iloc[0]
        record["first_day"] = str(rows.gaming_date.min().date())
        record["last_day"] = str(rows.gaming_date.max().date())
        record["on_floor_at_end"] = record["last_day"] == end
        record["payout_p_approx"] = math.erfc(abs(record["luck_z"]) / math.sqrt(2))
        record["payout_p_bonferroni"] = min(1., record["payout_p_approx"] * len(base))
        record["inspect_signal"] = record["payout_p_bonferroni"] < .05
        record["null_hold_low"] = record["theo_hold"] - 1.96 * record["luck_sd"] / record["coin_in"]
        record["null_hold_high"] = record["theo_hold"] + 1.96 * record["luck_sd"] / record["coin_in"]
        record["short_exposure"] = record["machine_days"] < total_days * .8
        record["gm_bottom10"] = machine in bottom_ids
        record["luck_test"] = ("Payout inspection signal after screening all machines; not proof of a fault."
                                if record["inspect_signal"] else "No family-wise payout anomaly; luck remains plausible.")
        record["location_test"] = f"Same-game local peers run at {record['location_index']:.0%} of same-game floor peers; association only."
        record["downtime_test"] = f"{record['availability']:.2%} available; {record['down_hours']:.1f} down hours."
        record["demand_test"] = f"{record['adjusted_index']:.0%} of same-game, same-zone, same-day peer expectation."
        if record["inspect_signal"]:
            diagnosis = "Inspect payout configuration"
        elif not record["on_floor_at_end"]:
            diagnosis = "Already retired; do not replace again"
        elif record["short_exposure"]:
            diagnosis = "Short exposure; monitor a full operating window"
        elif record["adjusted_ci_high"] is not None and record["adjusted_ci_high"] < .85:
            diagnosis = "Demand test candidate; avoid automatic replacement"
        elif record["location_index"] < .8:
            diagnosis = "Location association; test placement before replacement"
        else:
            diagnosis = "Retain; low totals alone do not justify replacement"
        record["diagnosis"] = diagnosis
        records.append(record)
    ranking = sorted(records, key=lambda x: x["adjusted_index"])
    for rank, record in enumerate(ranking, 1):
        record["adjusted_rank"] = rank
    by_id = {x["machine_id"]: x for x in records}
    bottom = [by_id[x] for x in bottom_ids]
    overall = m.summarize(start=start, end=end).iloc[0].to_dict()
    evidence = [
        {"id": "q1-exposure", "title": "Raw earnings confound time on the floor", "source": "prepared_daily_view + machine_day + calendar_day; src/q1_machines.py::analyze",
         "result": f"GM bottom ten contain {sum(x['short_exposure'] for x in bottom)} machines with fewer than 80% of the period on floor; {sum(not x['on_floor_at_end'] for x in bottom)} are already retired.",
         "alternative": "A short-lived machine can still have weak demand; compare theoretical win per available hour and like-for-like peers.",
         "limitation": "Peer normalization is retrospective and does not identify an individual machine's causal effect."},
        {"id": "q1-inspection", "title": "Screen payout behavior across all machines", "source": "machine_day.sum_bet_squared × game_math.payout_multiplier_variance / 10000; src/q1_machines.py::analyze",
         "result": f"{sum(x['inspect_signal'] for x in records)} of {len(records)} machines pass a two-sided normal-approximation Bonferroni screen at family alpha 0.05.",
         "alternative": "Rare payout variation, a configuration mismatch, or data/meter issues; an inspection distinguishes these.",
         "limitation": "Normal approximation assumes independent spins and correct supplied variance; signal is not proof of wrongdoing."},
        {"id": "q1-peers", "title": "Separate location association from within-location demand", "source": "prepared_daily_view dated zone/config; leave-one-out same-zone/config/day peer theo per available hour; src/q1_machines.py::adjusted_days",
         "result": f"Ranked {len(ranking)} machines using observed theo / peer expected theo; {int(d.peer_fallback.sum())} machine-days used same-config floor fallback.",
         "alternative": "Local foot traffic, bank position, game mix and player preferences remain intertwined.",
         "limitation": "95% paired weekly bootstrap intervals describe temporal stability, are not simultaneous selection-adjusted tests, and do not guarantee replacement uplift."}
    ]
    return {
        "meta": {"start": start, "end": end, "scope": "Fixed six-month investigation; filter explorer separately", "release": "0.9.0-draft", "bootstrap_seed": 2026},
        "method": {"ranking": "Observed theo divided by available hours times leave-one-out same config/zone/date peer rate; minimum 3 peers, otherwise same config/date floor peers.",
                   "baseline": "GM ranks total actual house win; also show absolute theo/hour and same-config floor benchmark.",
                   "uncertainty": "2,000 paired nonoverlapping calendar-week block bootstrap draws; 95% descriptive intervals, not causal or simultaneous.",
                   "payout": "z=(house_win-theo)/sqrt(sum supplied spin payout variance); normal-approximation p × number of machines (Bonferroni)."},
        "summary": {"machines": len(records), "on_floor_rows": len(d), "excluded_rows": 56110-len(d) if start == '2025-01-01' and end == '2025-06-30' else None,
                    "bottom10_short_exposure": sum(x["short_exposure"] for x in bottom), "bottom10_already_retired": sum(not x["on_floor_at_end"] for x in bottom),
                    "inspection_signals": [x["machine_id"] for x in records if x["inspect_signal"]], "floor_theo_per_avail_hour": overall["theo_per_avail_hour"]},
        "ranking": ranking, "bottom10": bottom, "evidence": evidence,
    }


def main():
    report = analyze()
    output = Path("outputs")
    output.mkdir(exist_ok=True)
    (output / "q1_machines.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    pd.DataFrame(report["ranking"]).to_csv(output / "q1_ranking.csv", index=False)
    print(json.dumps(report["summary"], indent=2))
    print(pd.DataFrame(report["bottom10"])[["machine_id", "machine_days", "adjusted_index", "adjusted_ci_low", "adjusted_ci_high", "location_index", "luck_z", "payout_p_bonferroni", "diagnosis"]].to_string(index=False))


if __name__ == "__main__":
    main()
