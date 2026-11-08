"""Download, verify, and transform the official Dashboard Royale release.

Usage: python scripts/build_data.py
Dependencies: pandas, numpy, pyarrow. All source money stays in its published unit;
exported money is USD. Source files are SHA-256 verified against the pinned manifest.
"""
from __future__ import annotations

import concurrent.futures
import argparse
import datetime as dt
import hashlib
import json
import math
import sys
from pathlib import Path
import urllib.request

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))
from src.q1_decomposition import _zone_factor_loo
SOURCE = ROOT / "data" / "source"
OUT = ROOT / "public" / "data"
REPO = "tamu-datathon-org/dashboard-royale"
SOURCE_COMMIT = "5f9274bdc3efa6614e6c081becaeadda34c57a32"
FILES = [
    "1_prepared_views/prepared_daily_view", "1_prepared_views/property_day",
    "1_prepared_views/player_period", "2_machine_decision/machine_day",
    "2_machine_decision/machines", "2_machine_decision/game_math",
    "2_machine_decision/calendar_day", "2_machine_decision/floor_locations",
    "2_machine_decision/floor_walkways", "2_machine_decision/placements",
    "2_machine_decision/operations", "2_machine_decision/action_catalog",
    "2_machine_decision/cost_rules", "4_context/events",
    "4_context/zone_traffic_hourly", "4_context/real_sources/city_visitation_monthly",
    "4_context/real_sources/weather_daily", "5_optional/shift_roster",
    "5_optional/visitor_profile_monthly",
]


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Gilded-Ace-Analytics/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()


def source_data():
    SOURCE.mkdir(parents=True, exist_ok=True)
    pin = SOURCE / "source_commit.txt"
    if pin.exists():
        commit = pin.read_text().strip()
        if commit != SOURCE_COMMIT:
            raise ValueError("Source cache belongs to another release; choose a fresh --source-dir")
    else:
        commit = SOURCE_COMMIT
        pin.write_text(commit)
    raw = f"https://raw.githubusercontent.com/{REPO}/{commit}"
    manifest_file = SOURCE / "manifest.json"
    if not manifest_file.exists():
        manifest_file.write_bytes(get(f"{raw}/data/manifest.json"))
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    registry = {f["path"]: f for f in manifest["files"]}

    def fetch(name):
        relative = name + ".parquet"
        destination = SOURCE / relative
        info = registry[relative]
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(get(f"{raw}/data/{relative}"))
        actual = hashlib.sha256(destination.read_bytes()).hexdigest()
        if actual != info["sha256"]:
            raise ValueError(f"Checksum mismatch: {relative}")
        frame = pd.read_parquet(destination)
        assert len(frame) == info["rows"], f"Row mismatch: {relative}"
        # Arrow DECIMAL values become Python Decimal; convert for vectorized math.
        for col in frame:
            if frame[col].dtype == object:
                nonnull = frame[col].dropna()
                if len(nonnull) and hasattr(nonnull.iloc[0], "as_tuple"):
                    frame[col] = frame[col].astype(float)
        if "gaming_date" in frame:
            frame["gaming_date"] = pd.to_datetime(frame["gaming_date"])
        return Path(name).name, frame

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        frames = dict(pool.map(fetch, FILES))
    print(f"Verified {len(frames)} source tables at {commit}", flush=True)
    return frames, manifest, commit


def clean(value):
    if value is None or value is pd.NA or value is pd.NaT:
        return None
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, np.ndarray)):
        return [clean(x) for x in value]
    if isinstance(value, (pd.Timestamp, dt.datetime, dt.date)):
        return value.isoformat()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        return round(float(value), 6) if math.isfinite(value) else None
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def records(frame):
    return clean(frame.to_dict("records"))


def ratio(a, b):
    return float(a / b) if b else None


def machine_data(frames):
    daily = frames["prepared_daily_view"].copy()
    assert not daily.duplicated(["machine_id", "gaming_date"]).any()
    assert daily.location_id.isna().sum() == 1018
    assert np.allclose(daily.house_win_usd, daily.coin_in_usd - daily.payout_usd)
    assert np.allclose(daily.luck_residual_usd, daily.house_win_usd - daily.theo_usd)
    daily = daily[daily.active & daily.location_id.notna()].copy()
    raw = frames["machine_day"][["machine_id", "gaming_date", "scheduled_seconds", "sum_bet_squared"]]
    daily = daily.merge(raw, on=["machine_id", "gaming_date"], validate="one_to_one")
    daily = daily.merge(frames["game_math"][["config_id", "payout_multiplier_variance"]], on="config_id", validate="many_to_one")
    daily["scheduled"] = daily.scheduled_seconds / 3600
    daily["variance"] = daily.sum_bet_squared * daily.payout_multiplier_variance / 10000
    daily["cost"] = daily.lease_cost_usd + daily.service_cost_usd + daily.power_cost_usd + daily.repair_cost_usd
    daily["down"] = daily.scheduled - daily.available_hours
    assert daily.down.min() >= -1e-6
    assert daily.loc[daily.gaming_date == pd.Timestamp("2025-03-08"), "scheduled"].max() == 23

    # Retain the team's richer five-part attribution (q1_decomposition.py).
    # Exclude the target from floor/game rates and from every peer game rate
    # inside the monthly zone denominator. This remains a descriptive benchmark.
    def loo(keys, num, den):
        group = daily.groupby(keys)[[num, den]].transform("sum")
        own = daily.groupby(keys + ["machine_id"])[[num, den]].transform("sum")
        return (group[num] - own[num]) / (group[den] - own[den]).replace(0, np.nan)
    daily["floor_rate"] = loo(["gaming_date"], "theo_usd", "available_hours")
    daily["game_rate"] = loo(["gaming_date", "config_id"], "theo_usd", "available_hours").fillna(daily.floor_rate)
    daily["zone_factor"] = _zone_factor_loo(daily.rename(columns={"theo_usd": "theo", "available_hours": "h"}))
    daily["peer_rate"] = daily.game_rate * daily.zone_factor
    daily["peerTheo"] = daily.available_hours * daily.peer_rate
    daily["floorTheo"] = daily.available_hours * daily.floor_rate
    daily["gameTheo"] = daily.available_hours * daily.game_rate
    daily["lostTheo"] = daily.down * daily.peer_rate
    assert daily.peer_rate.notna().all()
    dates = sorted(daily.gaming_date.dt.strftime("%Y-%m-%d").unique())
    date_index = {x: i for i, x in enumerate(dates)}
    ids = sorted(daily.machine_id.unique())
    machine_index = {x: i for i, x in enumerate(ids)}
    daily["date"] = daily.gaming_date.dt.strftime("%Y-%m-%d").map(date_index)
    daily["machine"] = daily.machine_id.map(machine_index)
    renamed = daily.rename(columns={"zone_id": "zone", "bank_id": "bank", "coin_in_usd": "coin", "payout_usd": "payout", "house_win_usd": "win", "theo_usd": "theo", "available_hours": "available", "occupied_hours": "occupied", "paid_spins": "spins", "faults_opened": "faults", "carded_coin_in_usd": "cardedCoin"})
    renamed["location"] = daily.location_id
    columns = ["date", "machine", "zone", "bank", "coin", "payout", "win", "theo", "available", "scheduled", "occupied", "spins", "variance", "cost", "faults", "cardedCoin", "peerTheo", "lostTheo", "floorTheo", "gameTheo", "location"]
    numeric_columns = columns[4:-1]
    rows = renamed.sort_values(["date", "machine"])[columns]
    for col in numeric_columns:
        rows[col] = rows[col].round(3)
    summed = renamed.groupby("machine_id")[numeric_columns].sum()
    latest = daily.sort_values("gaming_date").groupby("machine_id").tail(1).set_index("machine_id")
    location = frames["floor_locations"].set_index("location_id")
    machines = []
    for ident in ids:
        row = latest.loc[ident]
        metrics = summed.loc[ident].to_dict()
        metrics["activeDays"] = int((daily.machine_id == ident).sum())
        metrics["availability"] = ratio(metrics["available"], metrics["scheduled"])
        metrics["theoPerHour"] = ratio(metrics["theo"], metrics["available"])
        metrics["demandIndex"] = ratio(metrics["theo"], metrics["peerTheo"])
        metrics["luckZ"] = ratio(metrics["win"] - metrics["theo"], np.sqrt(metrics["variance"]))
        metrics["bonferroniP"] = min(1, len(ids) * math.erfc(abs(metrics["luckZ"]) / math.sqrt(2)))
        metrics["expectedLow"] = metrics["theo"] - 1.96 * np.sqrt(metrics["variance"])
        metrics["expectedHigh"] = metrics["theo"] + 1.96 * np.sqrt(metrics["variance"])
        metrics["hold"] = ratio(metrics["win"], metrics["coin"])
        metrics["contribution"] = metrics["win"] - metrics["cost"]
        loc = location.loc[row.location_id]
        machines.append({"id": ident, "manufacturer": row.manufacturer, "theme": row.theme, "config": row.config_id, "volatility": row.volatility_class, "zone": row.zone_id, "bank": row.bank_id, "location": row.location_id, "x": loc.x_m, "y": loc.y_m, "lastActiveDate": row.gaming_date.strftime("%Y-%m-%d"), "metrics": metrics})
    return daily, dates, columns, clean(rows.to_numpy().tolist()), clean(machines)


def guests(frames):
    source = frames["player_period"].copy()
    assert np.allclose(source.tracked_net_usd, source.tracked_payout_usd - source.tracked_coin_in_usd)
    assert np.allclose(source.tracked_contribution_usd, -source.tracked_net_usd + source.linked_pos_cash_usd - source.linked_pos_cogs_usd)
    source.age_band = source.age_band.fillna("Unknown")
    columns = {"tracked_coin_in_usd": "coin", "tracked_payout_usd": "payout", "tracked_net_usd": "net", "theo_usd": "theo", "comp_cost_usd": "compCost", "comp_face_value_usd": "compFace", "points_earned": "pointsEarned", "points_redeemed": "pointsRedeemed", "observed_visits": "visits", "tracked_contribution_usd": "contribution", "linked_pos_cash_usd": "posCash", "linked_pos_cogs_usd": "posCogs"}
    src = source.rename(columns=columns)
    dims = [("all", "All tracked guests", None, None)]
    for dim, field, label in [("tier", "opening_tier", "Tier"), ("region", "home_region", "Region"), ("age", "age_band", "Age")]:
        for val in sorted(src[field].unique()):
            dims.append((f"{dim}:{val}", f"{label} · {val}", field, val))
    months = sorted(src.period_month.unique())
    periods = []
    for start_index, start in enumerate(months):
        for end in months[start_index:]:
            period = src[(src.period_month >= start) & (src.period_month <= end)]
            for key, label, field, val in dims:
                selected = period if field is None else period[period[field] == val]
                by_player = selected.groupby("player_id")[list(columns.values())].sum()
                result = by_player.sum().to_dict()
                n = len(by_player)
                gaming = by_player[by_player.coin > 0]
                topn = max(1, math.ceil(len(gaming) * .01))
                top_coin = gaming.nlargest(topn, "coin")
                losses = -gaming.loc[gaming.net < 0, "net"]
                result.update({"startMonth": start, "endMonth": end, "group": key, "players": n, "gamblingPlayers": len(gaming), "aheadPlayers": int((gaming.net > 0).sum()), "behindPlayers": int((gaming.net < 0).sum()), "breakEvenPlayers": int((gaming.net == 0).sum()), "aheadRate": ratio((gaming.net > 0).sum(), len(gaming)), "medianNet": gaming.net.median() if len(gaming) else None, "top1CoinShare": ratio(top_coin.coin.sum(), gaming.coin.sum()), "top1PositiveLossShare": ratio(losses.nlargest(max(1, math.ceil(len(losses) * .01))).sum(), losses.sum()), "top1Players": topn, "compRate": ratio(result["compCost"], result["theo"]), "pointsPerTheo": ratio(result["pointsEarned"], result["theo"]), "redemptionCostPerPoint": ratio(result["compCost"], result["pointsRedeemed"])})
                periods.append(result)
    monthly = [x for x in periods if x["startMonth"] == x["endMonth"]]
    return {"guestGroups": [{"id": k, "label": l, "dimension": f, "value": v} for k, l, f, v in dims], "guestMonthly": monthly, "guestPeriods": periods}


def model_data(frames):
    prop = frames["property_day"].sort_values("gaming_date").copy()
    train = prop[prop.gaming_date <= "2025-04-30"].copy()
    test = prop[prop.gaming_date >= "2025-05-01"].copy()
    constant = train.coin_in_usd.mean()
    weekday = train.groupby(train.gaming_date.dt.dayofweek).coin_in_usd.mean()
    fit = train[train.gaming_date <= "2025-02-28"]
    calibration = train[train.gaming_date >= "2025-03-01"]
    assert (len(train), len(test), len(fit), len(calibration)) == (120, 61, 59, 61)
    fit_weekday = fit.groupby(fit.gaming_date.dt.dayofweek).coin_in_usd.mean()
    early_weekday = calibration.gaming_date.dt.dayofweek.map(fit_weekday).to_numpy()
    early_constant = np.full(len(calibration), fit.coin_in_usd.mean())
    validation_mae = {"constant_mean": np.abs(calibration.coin_in_usd - early_constant).mean(), "weekday_mean": np.abs(calibration.coin_in_usd - early_weekday).mean()}
    selected = min(validation_mae, key=validation_mae.get)
    predicted = test.gaming_date.dt.dayofweek.map(weekday).to_numpy() if selected == "weekday_mean" else np.full(len(test), constant)
    actual = test.coin_in_usd.to_numpy()
    baseline_mae = np.abs(actual - constant).mean()
    mae = np.abs(actual - predicted).mean()
    # Calibrate on chronological Jan–Feb → Mar–Apr forecast errors, before test.
    calibration_prediction = early_weekday if selected == "weekday_mean" else early_constant
    radius = np.quantile(np.abs(calibration.coin_in_usd - calibration_prediction), .9, method="higher")
    result = {"method": "Frozen weekday-mean forecast", "description": "Seven weekday averages fitted on Jan–Apr, frozen before the May–Jun holdout. The baseline is the constant Jan–Apr daily mean. No holdout values, tourism data, future repairs, or rolling holdout features are inputs.", "trainStart": "2025-01-01", "trainEnd": "2025-04-30", "testStart": "2025-05-01", "testEnd": "2025-06-30", "trainDays": len(train), "testDays": len(test), "baselineMAE": baseline_mae, "modelMAE": mae, "improvementPct": (baseline_mae - mae) / baseline_mae * 100, "baselineMean": constant, "weekdayMeans": [{"weekday": name, "prediction": weekday[i]} for i, name in enumerate(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])], "intervalRadius": radius, "intervalLabel": "90th percentile absolute training residual band", "holdoutIntervalCoverage": np.mean(np.abs(actual - predicted) <= radius), "baselineWAPE": np.abs(actual - constant).sum() / actual.sum(), "modelWAPE": np.abs(actual - predicted).sum() / actual.sum(), "predictions": [{"date": day.strftime("%Y-%m-%d"), "actual": a, "baseline": constant, "predicted": p, "low": max(0, p - radius), "high": p + radius} for day, a, p in zip(test.gaming_date, actual, predicted)], "limitations": ["One fixed split, 61 holdout days; neither causal nor an intervention-uplift model.", "Weekday averages cannot predict unmodeled structural changes or unusual events.", "Residual band is calibrated in sample and its actual holdout coverage is reported."]}
    result["decision"] = "Schedule planned maintenance in the lowest-demand forecast weekdays; protect peak forecast days. Use the holdout result to decide how much confidence to place in this timing rule, not to promise revenue uplift."
    result["validationMAE"] = validation_mae
    return clean(result)


def ops_data(frames, daily):
    op = frames["operations"].copy()
    raw = op.copy()
    for col in ["opened_at_utc", "work_started_at_utc", "available_at_utc"]:
        op[col] = pd.to_datetime(op[col])
    op["waitHours"] = (op.work_started_at_utc - op.opened_at_utc).dt.total_seconds() / 3600
    op["workHours"] = (op.available_at_utc - op.work_started_at_utc).dt.total_seconds() / 3600
    op["downHours"] = (op.available_at_utc - op.opened_at_utc).dt.total_seconds() / 3600
    op["month"] = pd.to_datetime(op.opened_at_local).dt.strftime("%Y-%m")
    op["localHour"] = pd.to_datetime(op.opened_at_local).dt.hour
    op["shift"] = pd.cut(op.localHour, bins=[-1, 5, 13, 21, 23], labels=["grave", "day", "swing", "grave"], ordered=False)
    op = op.merge(frames["machines"][["machine_id", "manufacturer"]], on="machine_id", validate="many_to_one")
    faults = op[op.event_type == "fault_repair"].copy()
    group = faults.groupby(["month", "manufacturer", "shift"], observed=True).agg(tickets=("machine_id", "size"), waitHours=("waitHours", "sum"), workHours=("workHours", "sum"), downHours=("downHours", "sum")).reset_index()
    manu = daily.groupby("manufacturer").agg(available=("available_hours", "sum"), scheduled=("scheduled", "sum"), lostTheo=("lostTheo", "sum"), downHours=("down", "sum"), faults=("faults_opened", "sum"), machineCount=("machine_id", "nunique")).reset_index()
    roster = frames["shift_roster"]
    roster = roster[roster.role == "slot_tech"].copy()
    roster["month"] = roster.gaming_date.dt.strftime("%Y-%m")
    staffing = roster.groupby(["month", "shift"]).agg(planned=("planned_headcount", "sum"), actual=("actual_headcount", "sum")).reset_index()
    tickets = op.rename(columns={"machine_id": "machine", "event_type": "type", "opened_at_local": "opened", "direct_cost_cents": "directCostCents"})[["machine", "type", "opened", "manufacturer", "shift", "waitHours", "workHours", "downHours", "directCostCents"]]
    return clean({"faultTickets": len(faults), "waitHours": faults.waitHours.sum(), "workHours": faults.workHours.sum(), "ticketDownHours": faults.downHours.sum(), "waitShare": ratio(faults.waitHours.sum(), faults.downHours.sum()), "byMonthManufacturerShift": records(group), "manufacturers": records(manu), "staffing": records(staffing), "tickets": records(tickets), "note": "Tickets describe repair timing and may cross the observation window or overlap. Availability loss uses machine meters, not summed tickets. Lost theo is a peer-rate counterfactual, not observed cash or guaranteed recoverable revenue."})


def context_data(frames, daily):
    # Traffic repeats on every machine row in the prepared view: deduplicate first.
    traffic = daily[["gaming_date", "zone_id", "zone_entries_observed", "zone_counter_coverage_hours"]].drop_duplicates(["gaming_date", "zone_id"])
    traffic = traffic.rename(columns={"gaming_date": "date", "zone_id": "zone", "zone_entries_observed": "entries", "zone_counter_coverage_hours": "coverageHours"})
    traffic["date"] = traffic.date.dt.strftime("%Y-%m-%d")
    zones = daily.groupby(["month", "zone_id", "zone_name"]).agg(coin=("coin_in_usd", "sum"), win=("house_win_usd", "sum"), theo=("theo_usd", "sum"), available=("available_hours", "sum"), occupied=("occupied_hours", "sum"), scheduled=("scheduled", "sum"), lostTheo=("lostTheo", "sum")).reset_index().rename(columns={"zone_id": "zone", "zone_name": "name"})
    # Renovation contrast, descriptive difference-in-differences with nonrandom controls.
    windows = {"before": ("2025-01-27", "2025-03-02"), "closed": ("2025-03-03", "2025-04-06"), "after": ("2025-04-07", "2025-05-11")}
    closure = []
    for phase, (start, end) in windows.items():
        period = daily[daily.gaming_date.between(start, end)]
        for name, sub in [("Back Forty", period[period.zone_id == "Z-B40"]), ("Other zones", period[period.zone_id != "Z-B40"])]:
            closure.append({"phase": phase, "start": start, "end": end, "group": name, "coin": sub.coin_in_usd.sum(), "available": sub.available_hours.sum(), "coinPerHour": ratio(sub.coin_in_usd.sum(), sub.available_hours.sum()), "theoPerHour": ratio(sub.theo_usd.sum(), sub.available_hours.sum())})
    return clean({"events": records(frames["events"]), "walkways": records(frames["floor_walkways"]), "survey": records(frames["visitor_profile_monthly"]), "zoneDaily": records(traffic), "zoneMonthly": records(zones), "renovation": closure, "renovationNote": "Equal 35-day windows balance weekdays. Back Forty versus all other zones is a descriptive comparison, not a randomized control. Game mix, guest mix, concurrent events and counter outages remain competing explanations."})


def main():
    global SOURCE, OUT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--reports", type=Path, default=None)
    args = parser.parse_args()
    SOURCE, OUT = args.source_dir.resolve(), args.output.resolve()
    frames, manifest, commit = source_data()
    daily, dates, daily_columns, daily_rows, machines = machine_data(frames)
    prop = frames["property_day"].copy()
    assert np.allclose(prop.house_win_usd, prop.coin_in_usd - prop.payout_usd)
    rollup = daily.groupby("gaming_date").coin_in_usd.sum()
    assert np.allclose(prop.set_index("gaming_date").coin_in_usd.sort_index(), rollup.sort_index())
    prop = prop.rename(columns={"gaming_date": "date", "coin_in_usd": "coin", "payout_usd": "payout", "house_win_usd": "win", "theo_usd": "theo", "comp_cost_usd": "compCost", "comp_face_value_usd": "compFace", "pos_cash_usd": "posCash", "pos_cogs_usd": "posCogs", "tech_labor_cost_usd": "techCost", "machine_supplied_costs_usd": "cost", "total_zone_entries_observed": "traffic", "counter_coverage_share": "coverage", "available_machine_hours": "available", "occupied_machine_hours": "occupied", "faults_opened": "faults", "active_machines": "activeMachines", "contribution_after_supplied_costs_usd": "contribution", "carded_coin_in_share": "cardedShare", "entrance_zone_entries_observed": "entranceTraffic", "local_weekday": "weekday", "events_active": "events"})
    prop["date"] = prop.date.dt.strftime("%Y-%m-%d")
    loc = frames["floor_locations"]
    zones = records(loc[loc.node_type == "zone"].rename(columns={"location_id": "id", "x_m": "x", "y_m": "y"})[["id", "name", "x", "y"]])
    banks = records(loc[loc.node_type == "bank"].rename(columns={"location_id": "id", "zone_id": "zone", "x_m": "x", "y_m": "y"})[["id", "name", "zone", "x", "y"]])
    guest_data = guests(frames)
    model = model_data(frames)
    # Preserve the team's completed investigations and independently reconcile
    # the core forecasts and machine exposures with our filtered explorer.
    candidates = [ROOT.parent / "dashboard" / "reports.json", ROOT / "team-repo" / "dashboard" / "reports.json", ROOT / "references" / "team-reports.json"]
    report_path = args.reports or next((p for p in candidates if p.exists()), None)
    if report_path is None:
        raise FileNotFoundError("Missing original team reports; pass --reports /path/to/reports.json")
    reports = json.loads(report_path.read_text(encoding="utf-8"))
    placement_path = ROOT.parent / "outputs" / "placement_model.json"
    placement = json.loads(placement_path.read_text(encoding="utf-8"))
    # Full predictions load only in Placement Lab; share evidence and validation.
    reports["placement"] = {k: placement[k] for k in ["meta", "validation", "evidence"]}
    forecast = reports["forecast"]
    summary = forecast["summary"]
    assert abs(model["baselineMAE"] - summary["baseline_mae"]) < .001
    assert abs(model["modelMAE"] - summary["model_mae"]) < .001
    assert abs(model["intervalRadius"] - summary["interval_radius_usd"]) < .001
    assert abs(model["holdoutIntervalCoverage"] - summary["coverage_90"]) < .000001
    for calc, archived in zip(model["predictions"], forecast["daily"]):
        assert calc["date"] == archived["date"]
        assert abs(calc["predicted"] - archived["prediction"]) < .001
    assert reports["validation"]["data_commit"] == commit
    model.update({"description": "Select constant versus weekday mean on Jan–Feb fits evaluated on Mar–Apr. Refit selected weekday mean on Jan–Apr and freeze all 61 May–Jun predictions. Only calendar weekday enters the model.", "intervalRadius": summary["interval_radius_usd"], "intervalLabel": "90th percentile of March–April errors from January–February fit", "holdoutIntervalCoverage": summary["coverage_90"], "validationMAE": summary["validation_mae"], "improvementCI": summary["mae_improvement_ci95"], "decision": summary["decision"], "predictions": [{"date": p["date"], "actual": p["actual"], "baseline": p["baseline"], "predicted": p["prediction"], "low": p["lower"], "high": p["upper"]} for p in forecast["daily"]], "limitations": ["One fixed split, 61 holdout days; neither causal nor an intervention-uplift model.", "Weekday averages cannot predict unmodeled structural changes or unusual events.", "Interval is calibrated on earlier chronological errors; holdout coverage is 85.2%, below nominal 90%."]})
    decomposition = {r["machine_id"]: r for r in reports["decomp"]["all_machines"]}
    for machine in machines:
        original = decomposition[machine["id"]]
        assert abs(machine["metrics"]["win"] - original["actual_win"]) < .02
        assert abs(machine["metrics"]["theo"] - original["theo"]) < .02
        assert abs(machine["metrics"]["demandIndex"] - original["machine_factor"]) < .0001
        machine["metrics"]["decomposition"] = original
    ops = ops_data(frames, daily)
    context = context_data(frames, daily)
    actions = records(frames["action_catalog"])
    for action in actions:
        action["unitCost30Days"] = (action["unit_cost_cents"] + action["recurring_cost_cents_per_day"] * max(0, 30 - action["lead_days"])) / 100
        action["benefitDays"] = max(0, 30 - action["lead_days"])
    total = daily[["coin_in_usd", "house_win_usd", "theo_usd", "available_hours", "scheduled", "down", "lostTheo", "variance"]].sum()
    bottom = sorted(machines, key=lambda m: m["metrics"]["win"])[:10]
    significant = [m for m in machines if m["metrics"]["luckZ"] < 0 and m["metrics"]["bonferroniP"] < .05]
    all_guests = next(x for x in guest_data["guestPeriods"] if x["startMonth"] == "2025-01" and x["endMonth"] == "2025-06" and x["group"] == "all")
    comp_months = [x for x in guest_data["guestMonthly"] if x["group"] == "all"]
    facts = {"totalCoin": total.coin_in_usd, "totalWin": total.house_win_usd, "totalTheo": total.theo_usd, "availability": total.available_hours / total.scheduled, "downHours": total.down, "lostTheo": total.lostTheo, "bottomTen": [m["id"] for m in bottom], "bottomTenDiagnostics": [{"id": m["id"], **m["metrics"]} for m in bottom], "strongNegativeResiduals": [{"id": m["id"], "z": m["metrics"]["luckZ"], "residual": m["metrics"]["win"] - m["metrics"]["theo"]} for m in significant], "trackedPlayers": all_guests["players"], "trackedNet": all_guests["net"], "top1CoinShare": all_guests["top1CoinShare"], "compMonths": comp_months}
    result = {"meta": {"title": "The Gilded Ace", "dataset": manifest["dataset"], "release": manifest["version"], "sourceCommit": commit, "sourceUrl": f"https://github.com/{REPO}/tree/{commit}", "guideUrl": f"https://github.com/{REPO}/blob/{commit}/GUIDE.md", "windowStart": dates[0], "windowEnd": dates[-1], "gamingTimezone": "America/Los_Angeles", "gamingDayStartsAt": "06:00", "moneyUnit": "USD", "synthetic": True, "sourceRows": {name: len(frame) for name, frame in frames.items()}, "activeDailyRows": len(daily), "excludedOffFloorRows": 1018, "tests": ["All source SHA-256 hashes and row counts match the pinned manifest", "Unique machine/date keys", "Machine, guest and property accounting identities", "Active-only machine totals reconcile to property totals", "March 8 DST schedule is 23 hours", "Peer rates are finite and self-excluding", "Model uses Jan–Apr only and is frozen across May–Jun"], "definitions": {"theo": "Wagers × (1 − configured RTP); exposure-based expected house win.", "hold": "Sum house win / sum wagers.", "variance": "Sum bet² in cents² × configured payout multiplier variance / 10,000.", "luckZ": "(House win − theo) / sqrt(modeled variance). Normal approximation, independent spins, configured math; a screening statistic, not proof of a fault.", "peerTheo": "Available hours × other machines' theo/available-hour for the same game configuration, zone and month. All observations of the target machine are excluded; under 300 peer hours, same game/month floor peers are used.", "demandIndex": "Theo / peerTheo. Below 1 means weaker demand than matched contemporaneous peers; not a causal machine-quality score.", "lostTheo": "Unavailable hours × the same matched-peer theo rate. A descriptive counterfactual before displacement, repair effectiveness and intervention cost, not guaranteed recoverable revenue.", "guestScope": "Tracked loyalty guests only. Whole calendar months; guest date boundaries are not day-level because the source is player-month.", "contribution": "House win + POS cash − POS COGS − supplied machine costs − technician labor at property level; partial costs only.", "compCost": "Economic comp cost, already included in POS COGS. Never subtract it again."}}, "dates": dates, "dailyColumns": daily_columns, "daily": daily_rows, "machines": machines, "zones": zones, "banks": banks, "locations": records(loc), "propertyDaily": records(prop), **guest_data, "model": model, "operations": ops, "context": context, "actions": actions, "facts": facts}
    result["reports"] = reports
    facts["coarseDailyLostTheo"] = facts["lostTheo"]
    facts["lostTheo"] = reports["q3"]["summary"]["lost_theo"]
    result["meta"]["definitions"]["peerTheo"] = "Five-part decomposition: available hours × daily same-game theo rate × monthly game-mix-adjusted zone factor. The target is excluded from peer rows and from the game rates used to value those peers. Retrospective and descriptive, not a causal effect. Explorer uses full-release reference rates when dates change."
    result["meta"]["definitions"]["demandIndex"] = "Theo / peerTheo. Descriptive game-and-location-adjusted machine factor; below 1 is weaker than benchmark, not sufficient evidence to replace."
    result["meta"]["definitions"]["lostTheo"] = "Coarse explorer sensitivity: unavailable hours × matched game/location theo rate. For the primary calibrated hourly counterfactual and filters use reports.q3.daily_bank; do not mix these estimates."
    result["meta"]["tests"][5] = "Peer rates are finite; full-period machine-factor results reproduce team decomposition"
    result["meta"]["teamReportSHA256"] = hashlib.sha256(report_path.read_bytes()).hexdigest()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "placement_model.json").write_bytes(placement_path.read_bytes())
    (OUT / "reports.json").write_text(json.dumps(reports, indent=2, allow_nan=False), encoding="utf-8")
    target = OUT / "dashboard.json"
    target.write_text(json.dumps(clean(result), separators=(",", ":"), ensure_ascii=False, allow_nan=False), encoding="utf-8")
    (OUT / "audit.json").write_text(json.dumps(clean({"meta": result["meta"], "facts": facts, "model": {k: v for k, v in model.items() if k != "predictions"}, "operations": {k: v for k, v in ops.items() if k not in {"tickets", "byMonthManufacturerShift", "staffing"}}, "renovation": context["renovation"]}), indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps(clean({"output": str(target), "bytes": target.stat().st_size, "activeMachineDays": len(daily), "placementMachines": len(placement["machines"]), "modelMAE": model["modelMAE"], "baselineMAE": model["baselineMAE"]}), indent=2), flush=True)


if __name__ == "__main__":
    main()
