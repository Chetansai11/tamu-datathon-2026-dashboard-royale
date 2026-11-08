"""Time-validated, support-aware placement demand scenarios; not causal move effects.

Run: DR_DATA=/path/to/organizer/data python -m src.placement_model
Only pre-origin metadata and deterministic weekdays are prediction features.
The browser receives predictions, provenance and an inventory, never a pickle.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import OneHotEncoder
from threadpoolctl import threadpool_limits

from .metrics import data_dir

SEED = 2025
FEATURES = ["config_id", "zone_id", "manufacturer", "weekday", "zone_config"]
METADATA = ["config_id", "zone_id", "manufacturer"]
FOLDS = [
    ("2025-01-31", "2025-02-01", "2025-02-28"),
    ("2025-02-28", "2025-03-01", "2025-03-31"),
    ("2025-03-31", "2025-04-01", "2025-04-15"),
]
TRAIN_END = "2025-04-15"
CALIBRATION_START, CALIBRATION_END = "2025-04-16", "2025-04-30"
TEST_START, TEST_END = "2025-05-01", "2025-06-30"
AS_OF = "2025-06-30"
NOMINAL_COVERAGE = .9
MIN_MACHINES, MIN_MACHINE_DAYS = 3, 120
MODEL_NAMES = {
    "baseline": "Configuration × weekday mean",
    "ridge": "Regularized location regression",
    "histogram": "Histogram gradient boosting",
}


def features(rows: pd.DataFrame) -> pd.DataFrame:
    """Allowlist deliberately excludes IDs, outcomes, actual traffic and downtime."""
    result = rows[METADATA].astype(str).copy()
    result["weekday"] = pd.to_datetime(rows.gaming_date).dt.dayofweek.astype(str)
    result["zone_config"] = result.zone_id + "|" + result.config_id
    return result[FEATURES]


def frozen_metadata(history: pd.DataFrame, future: pd.DataFrame, origin: str) -> tuple[pd.DataFrame, int]:
    """Use last metadata observed by origin, including for machines that later move.

    New machines absent at origin are excluded and counted, never backfilled with
    their future configuration. Future outcomes survive solely for scoring.
    """
    observed = history.loc[history.gaming_date <= pd.Timestamp(origin)]
    snapshot = observed.sort_values(["gaming_date", "machine_id"]).drop_duplicates("machine_id", keep="last")
    snapshot = snapshot.set_index("machine_id")[METADATA]
    out = future.loc[future.machine_id.isin(snapshot.index)].copy()
    out["actual_zone_id"] = out.zone_id
    out["actual_config_id"] = out.config_id
    for col in METADATA:
        out[col] = out.machine_id.map(snapshot[col])
    return out, len(future) - len(out)


class RateModel:
    """Small fixed candidate set; no test-driven hyperparameter search."""
    def __init__(self, name: str):
        if name not in MODEL_NAMES:
            raise ValueError(f"Unknown candidate: {name}")
        self.name = name

    def fit(self, rows: pd.DataFrame) -> "RateModel":
        x = features(rows)
        weights = rows.available_hours.to_numpy(float)
        y = rows.rate.to_numpy(float)
        if self.name == "baseline":
            aggregate = x[["config_id", "weekday"]].copy()
            aggregate["weighted_y"] = y * weights
            aggregate["weight"] = weights
            def rates(keys):
                totals = aggregate.groupby(keys, observed=True)[["weighted_y", "weight"]].sum()
                return (totals.weighted_y / totals.weight).to_dict()
            self.config_weekday = rates(["config_id", "weekday"])
            self.config_rate = rates(["config_id"])
            self.global_rate = float(np.average(y, weights=weights))
        else:
            self.encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False, dtype=np.float64)
            encoded = self.encoder.fit_transform(x)
            self.estimator = (Ridge(alpha=50.0) if self.name == "ridge" else HistGradientBoostingRegressor(
                loss="squared_error", learning_rate=.07, max_iter=100,
                max_leaf_nodes=15, min_samples_leaf=80, l2_regularization=20.,
                early_stopping=False, random_state=SEED,
            ))
            self.estimator.fit(encoded, y, sample_weight=weights)
        return self

    def predict(self, rows: pd.DataFrame) -> np.ndarray:
        x = features(rows)
        if self.name == "baseline":
            prediction = np.asarray([
                self.config_weekday.get((config, weekday), self.config_rate.get(config, self.global_rate))
                for config, weekday in zip(x.config_id, x.weekday)
            ])
        else:
            prediction = self.estimator.predict(self.encoder.transform(x))
        return np.maximum(0., prediction)


def metrics(rows: pd.DataFrame, prediction: np.ndarray, widths: np.ndarray | None = None) -> dict:
    y, w = rows.rate.to_numpy(float), rows.available_hours.to_numpy(float)
    errors = np.abs(y - prediction)
    result = {
        "nRows": len(rows), "nMachines": int(rows.machine_id.nunique()),
        "mae": float(errors.mean()), "weightedMae": float(np.average(errors, weights=w)),
        "rmse": float(np.sqrt(np.average((y-prediction)**2, weights=w))),
        "bias": float(np.average(prediction-y, weights=w)),
    }
    if widths is not None:
        lower, upper = np.maximum(0., prediction-widths), prediction+widths
        result.update(coverage90=float(np.mean((y >= lower) & (y <= upper))),
                      meanWidth=float(np.mean(upper-lower)))
    return result


def select_candidate(rows: pd.DataFrame) -> tuple[str, list[dict], list[dict]]:
    """All selection ends April 15; calibration and May–June never enter here."""
    candidate_results, fold_records = [], []
    for name, label in MODEL_NAMES.items():
        all_errors, all_weights, scores = [], [], []
        for origin, start, end in FOLDS:
            train = rows.loc[rows.gaming_date <= pd.Timestamp(origin)]
            raw_future = rows.loc[rows.gaming_date.between(start, end)]
            future, excluded = frozen_metadata(rows, raw_future, origin)
            model = RateModel(name).fit(train)
            pred = model.predict(future)
            score = metrics(future, pred)
            scores.append({"trainEnd": origin, "validationStart": start, "validationEnd": end,
                           "excludedUnknownMachineRows": excluded, **score})
            all_errors.extend(np.abs(future.rate.to_numpy(float)-pred))
            all_weights.extend(future.available_hours.to_numpy(float))
        candidate_results.append({"id": name, "name": label,
                                  "innerWeightedMae": float(np.average(all_errors, weights=all_weights)),
                                  "folds": scores})
        if not fold_records:
            fold_records = [{k: v for k, v in row.items() if k in (
                "trainEnd", "validationStart", "validationEnd", "nRows", "excludedUnknownMachineRows")}
                for row in scores]
    # Deterministic ties favor the simpler candidate in the declared order.
    winner = min(candidate_results, key=lambda c: c["innerWeightedMae"])["id"]
    return winner, candidate_results, fold_records


def residual_quantile(values: np.ndarray, coverage: float = NOMINAL_COVERAGE) -> float:
    values = np.sort(np.asarray(values, dtype=float))
    if not len(values) or not np.isfinite(values).all():
        raise ValueError("Calibration needs finite observed errors")
    rank = min(len(values), math.ceil((len(values)+1)*coverage))
    return float(values[rank-1])


def calibrate(rows: pd.DataFrame, prediction: np.ndarray) -> dict:
    errors = np.abs(rows.rate.to_numpy(float)-prediction)
    groups = {}
    for zone in sorted(rows.zone_id.unique()):
        mask = (rows.zone_id == zone).to_numpy()
        if mask.sum() >= 100:
            groups[zone] = residual_quantile(errors[mask])
    return {"pooled": residual_quantile(errors), "byZone": groups,
            "nRows": len(rows), "nDates": int(rows.gaming_date.nunique())}


def interval_widths(rows: pd.DataFrame, calibration: dict) -> np.ndarray:
    return np.asarray([calibration["byZone"].get(z, calibration["pooled"]) for z in rows.zone_id], dtype=float)


def support_table(rows: pd.DataFrame) -> dict:
    grouped = rows.groupby(["zone_id", "config_id"], observed=True).agg(
        machines=("machine_id", "nunique"), machineDays=("machine_id", "size"))
    return {(zone, config): {"supportMachines": int(row.machines), "supportDays": int(row.machineDays)}
            for (zone, config), row in grouped.iterrows()}


def support_for(support: dict, zone: str, config: str) -> dict:
    sample = support.get((zone, config), {"supportMachines": 0, "supportDays": 0})
    supported = sample["supportMachines"] >= MIN_MACHINES and sample["supportDays"] >= MIN_MACHINE_DAYS
    return {**sample, "supported": supported,
            "reason": None if supported else f"Needs at least {MIN_MACHINES} distinct machines and {MIN_MACHINE_DAYS} machine-days for this game configuration in this zone."}


def load_data() -> tuple[pd.DataFrame, dict[str, pd.DataFrame], dict]:
    base = data_dir()
    tables, provenance = {}, {}
    connection = duckdb.connect()
    for name in ["prepared_daily_view", "floor_locations", "placements", "action_catalog"]:
        matches = list(base.rglob(name+".parquet"))
        if len(matches) != 1:
            raise FileNotFoundError(f"Expected one {name}.parquet in {base}")
        path = matches[0]
        tables[name] = connection.execute("SELECT * FROM read_parquet(?)", [str(path)]).df()
        provenance[name] = {"path": path.relative_to(base).as_posix(),
                            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "rows": len(tables[name])}
    connection.close()
    rows = tables["prepared_daily_view"].copy()
    rows.gaming_date = pd.to_datetime(rows.gaming_date)
    rows = rows.loc[rows.active & rows.location_id.notna() & (rows.available_hours > 0)].copy()
    rows["rate"] = rows.theo_usd.astype(float) / rows.available_hours.astype(float)
    if not np.isfinite(rows.rate).all() or not (rows.rate >= 0).all():
        raise ValueError("Expected-win rates must be finite and nonnegative")
    return rows.sort_values(["gaming_date", "machine_id"]).reset_index(drop=True), tables, provenance


def inventory(tables: dict, rows: pd.DataFrame) -> tuple[list, list, pd.DataFrame]:
    # A wholly unavailable machine still occupies its slot. Inventory must not
    # reuse the positive-exposure filtering needed to fit rates.
    raw = tables["prepared_daily_view"]
    current = raw.loc[(pd.to_datetime(raw.gaming_date) == pd.Timestamp(AS_OF)) & raw.active & raw.location_id.notna()].copy()
    locs = tables["floor_locations"]
    zone_names = rows.drop_duplicates("zone_id").set_index("zone_id").zone_name.to_dict()
    zones = [{"id": str(z), "name": str(zone_names[z])} for z in sorted(zone_names)]
    occupied = current.set_index("location_id").machine_id.to_dict()
    if current.location_id.duplicated().any():
        raise ValueError("Two current machines occupy one slot")
    locations = [{"id": str(r.location_id), "zone": str(r.zone_id), "bank": str(r.bank_id),
                  "occupant": occupied.get(r.location_id), "x": float(r.x_m), "y": float(r.y_m)}
                 for r in locs.loc[locs.node_type == "slot"].sort_values("location_id").itertuples()]
    return zones, locations, current


def scenario_predictions(model: RateModel, current: pd.DataFrame, zones: list, support: dict, calibration: dict,
                         prediction_start: str = "2025-07-03", prediction_end: str = "2025-07-30") -> list:
    # Both current and destination rates use the same post-lead calendar. Two
    # catalog lead days leave July 3–30, exactly four occurrences of each weekday.
    dates = pd.date_range(prediction_start, prediction_end)
    # Batch all scenarios once; no repeated encoder/model construction.
    combinations = [(r.machine_id, r.config_id, r.manufacturer, z["id"], day)
                    for r in current.sort_values("machine_id").itertuples() for z in zones for day in dates]
    scenarios = pd.DataFrame(combinations, columns=["machine_id", "config_id", "manufacturer", "zone_id", "gaming_date"])
    scenarios["prediction"] = model.predict(scenarios)
    means = scenarios.groupby(["machine_id", "zone_id"], observed=True).prediction.mean().to_dict()
    machines = []
    for row in current.sort_values("machine_id").itertuples():
        predictions = {}
        for zone in zones:
            info = support_for(support, zone["id"], row.config_id)
            point = float(means[(row.machine_id, zone["id"])])
            width = calibration["byZone"].get(zone["id"], calibration["pooled"])
            predictions[zone["id"]] = {"mean": point if info["supported"] else None,
                                       "lower": max(0., point-width) if info["supported"] else None,
                                       "upper": point+width if info["supported"] else None, **info}
        machines.append({"id": str(row.machine_id), "config": str(row.config_id), "theme": str(row.theme),
                         "manufacturer": str(row.manufacturer), "currentLocation": str(row.location_id),
                         "currentZone": str(row.zone_id), "currentBank": str(row.bank_id), "predictions": predictions})
    return machines


def build_report() -> dict:
    rows, tables, provenance = load_data()
    selected, candidates, folds = select_candidate(rows)
    train = rows.loc[rows.gaming_date <= pd.Timestamp(TRAIN_END)]
    model = RateModel(selected).fit(train)
    baseline = RateModel("baseline").fit(train)
    raw_cal = rows.loc[rows.gaming_date.between(CALIBRATION_START, CALIBRATION_END)]
    calibration_rows, cal_excluded = frozen_metadata(rows, raw_cal, TRAIN_END)
    calibration = calibrate(calibration_rows, model.predict(calibration_rows))
    raw_test = rows.loc[rows.gaming_date.between(TEST_START, TEST_END)]
    test, excluded = frozen_metadata(rows, raw_test, CALIBRATION_END)
    pred, baseline_pred = model.predict(test), baseline.predict(test)
    widths = interval_widths(test, calibration)
    score, base_score = metrics(test, pred, widths), metrics(test, baseline_pred)
    per_zone = []
    zone_names = rows.drop_duplicates("zone_id").set_index("zone_id").zone_name.to_dict()
    for zone in sorted(test.zone_id.unique()):
        mask = (test.zone_id == zone).to_numpy()
        per_zone.append({"zone": zone, "name": zone_names[zone], **metrics(test.loc[mask], pred[mask], widths[mask])})
    moved = (test.zone_id != test.actual_zone_id).to_numpy()
    # Hold out complete machine IDs in addition to time. These are model features
    # only through known category metadata; machine identity is never an input.
    held_ids = {m for m in train.machine_id.unique() if int(hashlib.sha256(m.encode()).hexdigest()[:8], 16) % 5 == 0}
    group_train = train.loc[~train.machine_id.isin(held_ids)]
    group_test = test.loc[test.machine_id.isin(held_ids)]
    group_model = RateModel(selected).fit(group_train)
    grouped = {"method": "Stable SHA-256 20% machine-ID holdout; remaining machines train through April 15; score held-out machines in May–June.",
               "trainMachines": int(group_train.machine_id.nunique()), **metrics(group_test, group_model.predict(group_test))}
    # Model specification was frozen before the historical test. This deployment
    # refit may use all now-observed Jan–June outcomes, but never changes selection.
    final_model = RateModel(selected).fit(rows.loc[rows.gaming_date <= pd.Timestamp(AS_OF)])
    zones, locations, current = inventory(tables, rows)
    support = support_table(rows.loc[rows.gaming_date <= pd.Timestamp(AS_OF)])
    action = tables["action_catalog"].set_index("action_type_id").loc["A-MOVE-MACHINE"]
    prediction_start = (pd.Timestamp("2025-07-01") + pd.Timedelta(days=int(action.lead_days))).strftime("%Y-%m-%d")
    machines = scenario_predictions(final_model, current, zones, support, calibration, prediction_start)
    placements = tables["placements"].sort_values(["machine_id", "effective_from_utc"])
    prior = placements.groupby("machine_id").location_id.shift(1)
    moves = placements.loc[prior.notna() & (placements.location_id != prior)].copy()
    loc_zones = tables["floor_locations"].set_index("location_id").zone_id.to_dict()
    cross_zone = int(sum(loc_zones[a] != loc_zones[b] for a, b in zip(prior.loc[moves.index], moves.location_id)))
    limitations = [
        "Predictive associations, not causal relocation effects. Only four observed moves, three across zones, support the entire six-month history.",
        "May–June has already been examined during dashboard development. This is a retrospective time holdout, not an untouched prospective test.",
        "Evaluation freezes machine metadata at each prediction origin. Machines first installed after that origin are excluded and counted; later moves do not feed future location metadata into predictions.",
        "Expected-win rates predict wager demand at configured hold, not realized payout luck or guaranteed profit. Actual future availability, occupancy, coin-in, traffic and repairs are not features.",
        "July points refit the selected specification on January–June. April calibration residual widths are reused only as empirical sensitivity ranges; they are not calibrated July-mean intervals or confidence intervals for relocation uplift.",
        "Repeated machine-days and common daily shocks are dependent; nominal residual-band coverage has no formal exchangeability guarantee. Extrapolation to unsupported configuration-zone cells is blocked.",
        "The model distinguishes zones, not individual slots within a zone. Seat inventory constrains feasibility; it does not establish slot-specific causal advantages.",
        "Net floor benefit also depends on displaced play, both legs of swaps, costs, lead time and downtime. A prospective controlled pilot is required to test incremental benefit.",
    ]
    improvement = 100*(1-score["weightedMae"]/base_score["weightedMae"])
    return {
        "meta": {"schemaVersion": 1, "asOf": AS_OF, "horizonStart": "2025-07-01", "horizonEnd": "2025-07-30",
                 "predictionStart": prediction_start, "predictionEnd": "2025-07-30",
                 "modelId": selected, "modelName": MODEL_NAMES[selected], "target": "Expected house win per available machine-hour",
                 "units": "USD per available machine-hour", "trainedThrough": TRAIN_END, "calibrationCutoff": CALIBRATION_END,
                 "deploymentRefitThrough": AS_OF, "retrospectiveTest": True, "seed": SEED,
                 "features": FEATURES, "threadLimit": 2, "sourceHashes": provenance,
                 "libraryVersions": {name: importlib.metadata.version(name) for name in ["numpy", "pandas", "duckdb", "scikit-learn", "scipy"]},
                 "observedMoves": len(moves), "observedCrossZoneMoves": cross_zone,
                 "activeMachineDays": len(rows), "minSupportMachines": MIN_MACHINES, "minSupportDays": MIN_MACHINE_DAYS,
                 "rangeMeaning": "Empirical daily-rate residual sensitivity around a July weekday-average point estimate; not causal lift uncertainty."},
        "zones": zones, "locations": locations, "machines": machines,
        "catalog": {"actionType": "A-MOVE-MACHINE", "unitCost": float(action.unit_cost_cents)/100,
                    "leadDays": int(action.lead_days), "downtimeHours": float(action.downtime_minutes)/60,
                    "quantityLimit": int(action.quantity_limit), "notes": str(action.notes)},
        "validation": {"selectedModel": selected, "selectionMetric": "Available-hour-weighted MAE of expected-win rates",
                       "candidates": candidates, "folds": folds,
                       "calibration": {"start": CALIBRATION_START, "end": CALIBRATION_END,
                                       "nominalCoverage": NOMINAL_COVERAGE, "method": "Per-zone 90th-percentile absolute residual order statistic; pooled fallback below 100 rows.",
                                       "excludedUnknownMachineRows": cal_excluded, **calibration},
                       "holdout": {"start": TEST_START, "end": TEST_END, **score,
                                   "baselineWeightedMae": base_score["weightedMae"], "improvementPct": improvement,
                                   "excludedUnknownMachineRows": excluded, "perZone": per_zone,
                                   "changedPlacementRows": int(moved.sum()),
                                   "changedPlacementMetrics": metrics(test.loc[moved], pred[moved]) if moved.any() else None},
                       "groupedCheck": grouped},
        "limitations": limitations,
        "evidence": [{"id": "placement-model", "title": "Time-validated placement demand scenarios",
                      "source": "prepared_daily_view + dated placements + floor_locations + action_catalog; src/placement_model.py",
                      "method": "Three expanding-origin inner folds select among config-weekday baseline, ridge and histogram boosting; separate April calibration; retrospective May–June score with frozen-origin metadata.",
                      "result": f"Selected {MODEL_NAMES[selected]}; May–June weighted rate MAE ${score['weightedMae']:.3f} versus ${base_score['weightedMae']:.3f} baseline ({improvement:.1f}% difference); nominal 90% daily-rate band coverage {score['coverage90']:.1%}.",
                      "alternative": "Location associations may reflect game allocation, guest mix, access and displaced play; machine-day prediction does not identify intervention uplift.",
                      "limitation": limitations[0] + " " + limitations[1] + " " + limitations[4]}],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="outputs/placement_model.json")
    args = parser.parse_args()
    with threadpool_limits(limits=2):
        report = build_report()
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(json.dumps({"output": str(output.resolve()), "bytes": output.stat().st_size,
                      "selectedModel": report["meta"]["modelName"], "holdout": report["validation"]["holdout"]}))


if __name__ == "__main__":
    main()
