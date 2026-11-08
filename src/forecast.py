"""Frozen daily coin-in benchmark and separate retrospective rolling validation.

Run ``python -m src.forecast`` from a challenge checkout. All dollars are USD.
The original benchmark uses only weekday: Jan-Feb -> Mar-Apr selects between
constant and weekday means, then Jan-Apr refitting freezes May-Jun predictions.
The separate retrospective extension updates only between seven-day origins;
outcomes inside a forecast block never enter that block's predictions.
"""
from __future__ import annotations

import argparse
from collections.abc import Mapping
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from src import metrics as m


def _predict(train: pd.DataFrame, dates: pd.Series, model: str) -> np.ndarray:
    baseline = float(train.coin_in_usd.mean())
    if model == "constant_mean":
        return np.full(len(dates), baseline)
    means = train.groupby(train.gaming_date.dt.day_of_week).coin_in_usd.mean()
    return dates.dt.day_of_week.map(means).fillna(baseline).to_numpy(float)


def block_mae_improvement(actual, baseline, prediction, seed=2025, draws=2000):
    """Paired moving 7-day bootstrap; descriptive holdout sampling uncertainty."""
    delta = np.abs(np.asarray(actual) - baseline) - np.abs(np.asarray(actual) - prediction)
    rng = np.random.default_rng(seed)
    n, length = len(delta), min(7, len(delta))
    starts = rng.integers(0, n - length + 1, (draws, int(np.ceil(n / length))))
    indices = (starts[..., None] + np.arange(length)).reshape(draws, -1)[:, :n]
    return np.quantile(delta[indices].mean(axis=1), [.025, .975]).tolist()


ROLLING_MODELS = {
    "constant_mean": "Expanding constant mean",
    "weekday_mean": "Expanding weekday mean",
    "recent_weekday_mean": "Recent 28-day weekday mean",
    "seasonal_naive": "Last observed weekday",
}


def _rolling_predict(train: pd.DataFrame, dates: pd.Series, model: str) -> np.ndarray:
    """Freeze a complete horizon using observations strictly before its origin.

    Last-week predictions repeat the last observed weekday even for a horizon
    longer than seven days: test outcomes never become lag features mid-block.
    """
    train = train.sort_values("gaming_date")
    if model in ("constant_mean", "weekday_mean"):
        return _predict(train, dates, model)
    if model == "recent_weekday_mean":
        recent = train[train.gaming_date > train.gaming_date.max() - pd.Timedelta(days=28)]
        return _predict(recent, dates, "weekday_mean")
    if model == "seasonal_naive":
        latest = train.groupby(train.gaming_date.dt.day_of_week).coin_in_usd.last()
        return dates.dt.day_of_week.map(latest).fillna(float(train.coin_in_usd.mean())).to_numpy(float)
    raise ValueError(f"Unknown rolling forecast candidate: {model}")


def _error_metrics(actual, prediction, lower=None, upper=None) -> dict:
    actual, prediction = np.asarray(actual, dtype=float), np.asarray(prediction, dtype=float)
    error = prediction - actual
    result = {"days": len(actual), "mae_usd": float(np.abs(error).mean()),
              "bias_usd": float(error.mean())}
    if lower is not None and upper is not None:
        lower, upper = np.asarray(lower, dtype=float), np.asarray(upper, dtype=float)
        result.update(coverage_90=float(np.mean((actual >= lower) & (actual <= upper))),
                      mean_interval_width_usd=float(np.mean(upper - lower)))
    return result


def _monthly_metrics(daily: list[dict]) -> list[dict]:
    rows = pd.DataFrame(daily)
    return [{"month": str(month), **_error_metrics(group.actual, group.prediction, group.lower, group.upper)}
            for month, group in rows.groupby(rows.date.str[:7], sort=True)]


def _prior_weekly_errors(frame: pd.DataFrame, model: str, start: pd.Timestamp, end: pd.Timestamp) -> list[float]:
    errors = []
    for origin in pd.date_range(start, end - pd.Timedelta(days=7), freq="7D"):
        fit = frame[frame.gaming_date < origin]
        target = frame[frame.gaming_date.between(origin, origin + pd.Timedelta(days=7), inclusive="left")]
        errors.extend(np.abs(target.coin_in_usd.to_numpy() - _rolling_predict(fit, target.gaming_date, model)).tolist())
    return errors


def retrospective_validation(frame: pd.DataFrame) -> dict:
    """Retrospective seven-day rolling origins, separate from the frozen test.

    Each origin has two seven-day model-selection blocks ending before three
    disjoint seven-day calibration blocks. Every candidate is calibrated on
    those prior forecasts, then refitted through the day before the new origin.
    Calibration outcomes cannot select a candidate. These correlated historical
    residuals provide an empirical band, not a guaranteed conformal interval.
    """
    frame = frame.copy()
    frame["gaming_date"] = pd.to_datetime(frame.gaming_date)
    frame = frame[frame.gaming_date.between("2025-01-01", "2025-06-30")].sort_values("gaming_date")
    folds, daily = [], []
    selection_counts = {name: 0 for name in ROLLING_MODELS}
    for origin in pd.date_range("2025-04-01", "2025-06-24", freq="7D"):
        calibration_start = origin - pd.Timedelta(days=21)
        tuning_start = calibration_start - pd.Timedelta(days=14)
        tuning_mae = {name: float(np.mean(_prior_weekly_errors(frame, name, tuning_start, calibration_start)))
                      for name in ROLLING_MODELS}
        selected = min(tuning_mae, key=tuning_mae.get)
        selection_counts[selected] += 1
        residuals = {name: _prior_weekly_errors(frame, name, calibration_start, origin) for name in ROLLING_MODELS}
        calibration_origins = pd.date_range(calibration_start, origin - pd.Timedelta(days=7), freq="7D").strftime("%Y-%m-%d").tolist()
        # Conservative finite-sample order statistic; no exchangeability claim.
        calibration_days = len(residuals[selected])
        rank = min(calibration_days, math.ceil((calibration_days + 1) * .90))
        radii = {name: float(np.sort(errors)[rank - 1]) for name, errors in residuals.items()}
        radius = radii[selected]
        train = frame[frame.gaming_date < origin]
        test = frame[frame.gaming_date.between(origin, origin + pd.Timedelta(days=7), inclusive="left")]
        predictions = {name: _rolling_predict(train, test.gaming_date, name) for name in ROLLING_MODELS}
        prediction = predictions[selected]
        lower, upper = np.maximum(0, prediction - radius), prediction + radius
        actual = test.coin_in_usd.to_numpy(float)
        folds.append({"origin": origin.strftime("%Y-%m-%d"), "fit_start": "2025-01-01",
                      "tuning_fit_end": (tuning_start - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
                      "tuning_start": tuning_start.strftime("%Y-%m-%d"),
                      "tuning_end": (calibration_start - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
                      "tuning_origins": pd.date_range(tuning_start, calibration_start - pd.Timedelta(days=7), freq="7D").strftime("%Y-%m-%d").tolist(),
                      "calibration_start": calibration_start.strftime("%Y-%m-%d"),
                      "calibration_end": (origin - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
                      "calibration_origins": calibration_origins, "calibration_days": calibration_days,
                      "forecast_end": (origin + pd.Timedelta(days=6)).strftime("%Y-%m-%d"),
                      "selected_model": selected, "tuning_mae_usd": tuning_mae,
                      "interval_radius_usd": radius,
                      "candidate_interval_radius_usd": radii,
                      "candidate_mae_usd": {name: _error_metrics(actual, values)["mae_usd"] for name, values in predictions.items()},
                      **_error_metrics(actual, prediction, lower, upper)})
        for i, date in enumerate(test.gaming_date):
            daily.append({"date": date.strftime("%Y-%m-%d"), "origin": origin.strftime("%Y-%m-%d"),
                          "selected_model": selected, "actual": float(actual[i]), "prediction": float(prediction[i]),
                          "lower": float(lower[i]), "upper": float(upper[i]),
                          **{name: float(values[i]) for name, values in predictions.items()},
                          **{f"{name}_lower": float(max(0, values[i] - radii[name])) for name, values in predictions.items()},
                          **{f"{name}_upper": float(values[i] + radii[name]) for name, values in predictions.items()}})
    rows = pd.DataFrame(daily)
    models = [{"model": name, "label": label, **_error_metrics(rows.actual, rows[name], rows[f"{name}_lower"], rows[f"{name}_upper"])}
              for name, label in ROLLING_MODELS.items()]
    selected_metrics = _error_metrics(rows.actual, rows.prediction, rows.lower, rows.upper)
    models.append({"model": "rolling_selection", "label": "Past-only rolling selection", **selected_metrics})
    weekday_mae = next(row["mae_usd"] for row in models if row["model"] == "weekday_mean")
    incumbent = next(row for row in models if row["model"] == "weekday_mean")
    return {"label": "Retrospective 7-day rolling-origin evaluation", "status": "retrospective",
            "horizon_days": 7, "origin_step_days": 7, "evaluation_start": "2025-04-01", "evaluation_end": "2025-06-30",
            "summary": {"origins": len(folds), **selected_metrics, "selection_counts": selection_counts,
                        "weekday_mae_usd": weekday_mae,
                        "improvement_vs_weekday_pct": (1 - selected_metrics["mae_usd"] / weekday_mae) * 100 if weekday_mae else 0.,
                        "nominal_coverage": .90},
            "models": models, "incumbent": incumbent, "folds": folds, "daily": daily, "monthly": _monthly_metrics(daily),
            "interval_method": "Each model: 20th of 21 absolute errors from three prior 7-day forecasts; then refit using all prior observations. Selection ends before calibration begins.",
            "limitations": ["Retrospective extension: May-June was already examined. This is not a new untouched holdout.",
                            "Seven-day rolling forecasts use a different horizon and evaluation period from the original frozen 61-day benchmark; compare candidates within this table.",
                            "Empirical bands use 21 temporally dependent residuals and a refitted model; nominal 90% coverage is not guaranteed.",
                            "Only outcomes before each origin enter its predictions; last-week values repeat across the full horizon, never using future actuals as lags.",
                            "Six months from one synthetic property do not establish external validity or a causal staffing or relocation benefit."]}


def build_july_monitoring(train: pd.DataFrame, model: str, radius: float) -> dict:
    """Extend the original frozen reference without using May-July outcomes.

    This is an unobserved operational plan, prepared retrospectively with respect
    to the synthetic calendar. It is not another validation sample. Retaining
    the Apr-30 model and earlier error radius also preserves the action plan's
    original weekday timing rationale rather than silently refitting it.
    """
    if model not in ("constant_mean", "weekday_mean"):
        raise ValueError("July monitoring requires the original selected model")
    if not math.isfinite(radius) or radius < 0:
        raise ValueError("July monitoring radius must be finite and nonnegative")
    fit = train.copy()
    fit["gaming_date"] = pd.to_datetime(fit.gaming_date)
    fit = fit[fit.gaming_date.between("2025-01-01", "2025-04-30")].sort_values("gaming_date")
    expected_dates = pd.date_range("2025-01-01", "2025-04-30")
    values = fit.coin_in_usd.to_numpy(float)
    if (fit.gaming_date.tolist() != expected_dates.tolist() or
            not np.isfinite(values).all() or np.any(values < 0)):
        raise ValueError("July monitoring requires complete finite nonnegative Jan-Apr daily wagers")
    dates = pd.Series(pd.date_range("2025-07-01", "2025-07-30"))
    predictions = _predict(fit, dates, model)
    daily = []
    for date, prediction in zip(dates, predictions):
        lower, upper = round(max(0., float(prediction) - radius), 2), round(float(prediction) + radius, 2)
        daily.append({"date": date.strftime("%Y-%m-%d"), "weekday": date.day_name(),
                      "weekday_index": int(date.day_of_week), "prediction": round(float(prediction), 2),
                      "lower": lower, "upper": upper, "watch_below": lower, "watch_above": upper,
                      "actual": None})
    return {
        "label": "July 1-30 frozen reference and monitoring plan", "status": "prospective_plan",
        "prepared_retrospectively": True, "model": model, "model_frozen_at": "2025-04-30",
        "start": "2025-07-01", "end": "2025-07-30", "days": len(daily),
        "target": "Whole-floor daily coin-in USD; includes replayed wagers, not profit",
        "gaming_day": "06:00 to 06:00 next day, America/Los_Angeles; date labels the starting day",
        "training": {"start": "2025-01-01", "end": "2025-04-30", "days": len(fit)},
        "calibration": {"fit_end": "2025-02-28", "start": "2025-03-01", "end": "2025-04-30",
                        "nominal_coverage": .90, "radius_usd": radius,
                        "method": "Original higher 90th percentile of March-April absolute errors from Jan-Feb fits; unchanged for July"},
        "policy": {
            "version": "july-monitoring-v1", "watch_below": "daily.watch_below", "watch_above": "daily.watch_above",
            "comparison": "strict", "consecutive_review_days": 2, "missing_day": "reset streak",
            "opposite_direction": "restart streak at one", "dollar_precision": 2,
            "watch": "One completed gaming day below its lower threshold or above its upper threshold triggers a watch.",
            "review": "Two consecutive completed gaming dates outside their thresholds in the same direction trigger operational review.",
            "response": "First reconcile the meter feed and available machine-hours; then inspect events, outages, guest mix and displacement before changing the funded plan.",
            "within_band": "A reading at either threshold is within the band. Within-band days reset the streak; they do not prove normal operation.",
            "missing": "An absent or incomplete gaming day is not zero wagers and cannot trigger an alert; it resets the consecutive-day streak.",
            "limit": "These are explicit operational screening rules, not calibrated false-alarm probabilities, statistical significance tests, or evidence that signage caused a change."
        },
        "daily": daily,
        "limitations": [
            "July actuals are not supplied. No July accuracy, alert rate or intervention effect has been measured.",
            "This plan is prepared after examining the synthetic January-June data, not a claim of historical preregistration. The frozen reference itself still uses January-April only.",
            "Keeping the April-30 reference makes comparisons auditable but can miss later drift. Weekday-only predictions do not model July 4, promotions, unusual events or changed capacity.",
            "The empirical band is not guaranteed 90% coverage, and repeated daily checks increase the opportunity for alerts. The two-day review rule has no validated false-alarm rate.",
            "Aggregate wagers cannot establish incremental profit or identify zone-level displacement. Review alerts alongside the pilot's matched controls, availability and whole-floor outcomes."
        ],
        "evidence": [{"id": "forecast-july-monitoring", "claim": "Every July decision date has an auditable reference and alert rule",
                      "source": "property_day Jan-Apr; src/forecast.py:build_july_monitoring and evaluate_july_alerts",
                      "method": "Extend the unchanged Apr-30 frozen model and pre-May error radius to July 1-30. Round thresholds to cents. Watch strict daily band breaches; review two consecutive same-direction breaches; missing dates reset.",
                      "result": "30 daily references, explicit lower/upper thresholds and no invented July observations. Funded July-2 inspection timing remains tied to the original weekday means.",
                      "alternative": "Events, availability, demand drift or a meter-feed error can move whole-floor wagers without a pilot effect.",
                      "limitation": "Unobserved July plan, designed retrospectively. Empirical bands and operational alert rules do not guarantee coverage or false-alarm control and are not a causal evaluation."}]
    }


def evaluate_july_alerts(plan: dict, observations: Mapping[str, float | None]) -> list[dict]:
    """Evaluate supplied complete-day totals; never fill absent days with zero.

    Keys are gaming-date strings. Null means missing/incomplete, zero is a real
    supplied observation. Invalid dates, booleans, strings, negative values and
    nonfinite readings are rejected rather than silently changing an alert.
    """
    if not isinstance(observations, Mapping):
        raise ValueError("July observations must map gaming dates to completed daily wager totals")
    dates = {row["date"] for row in plan["daily"]}
    if any(date not in dates for date in observations):
        raise ValueError("Observed date is outside the July monitoring calendar")
    for actual in observations.values():
        if actual is None:
            continue
        try:
            valid = (not isinstance(actual, bool) and
                     isinstance(actual, (int, float, np.integer, np.floating)) and
                     math.isfinite(float(actual)) and actual >= 0)
        except (ValueError, TypeError, OverflowError):
            valid = False
        if not valid:
            raise ValueError("Completed daily wagers must be finite nonnegative numbers or null")
    results, previous_direction, streak, previous_date = [], None, 0, None
    for row in sorted(plan["daily"], key=lambda r: r["date"]):
        actual, date = observations.get(row["date"]), pd.Timestamp(row["date"])
        direction = None
        if actual is None:
            status, streak = "awaiting_data", 0
        else:
            direction = "below" if actual < row["watch_below"] else "above" if actual > row["watch_above"] else None
            consecutive = previous_date is not None and (date - previous_date).days == 1
            streak = (streak + 1 if consecutive and direction == previous_direction else 1) if direction else 0
            status = "review" if streak >= plan["policy"]["consecutive_review_days"] else "watch" if direction else "within_band"
        results.append({"date": row["date"], "actual": None if actual is None else float(actual),
                        "direction": direction, "consecutive_breaches": streak, "status": status})
        previous_direction, previous_date = direction, date
    return results


def build_report(frame: pd.DataFrame | None = None) -> dict:
    if frame is None:
        frame = m.sql(f"SELECT gaming_date, coin_in_usd::DOUBLE AS coin_in_usd FROM {m.table('property_day')} ORDER BY gaming_date")
    frame = frame.copy()
    frame["gaming_date"] = pd.to_datetime(frame.gaming_date)
    frame = frame.sort_values("gaming_date")
    if frame.gaming_date.duplicated().any() or frame.coin_in_usd.isna().any():
        raise ValueError("Forecast requires one observed non-null coin-in value per gaming date")
    train = frame[frame.gaming_date.between("2025-01-01", "2025-04-30")]
    test = frame[frame.gaming_date.between("2025-05-01", "2025-06-30")]
    fit = train[train.gaming_date <= "2025-02-28"]
    calibration = train[train.gaming_date >= "2025-03-01"]
    if (len(train), len(test), len(fit), len(calibration)) != (120, 61, 59, 61):
        raise ValueError("Expected complete 120-day Jan-Apr training and 61-day May-Jun test")
    validation = {name: float(np.abs(calibration.coin_in_usd.to_numpy() - _predict(fit, calibration.gaming_date, name)).mean())
                  for name in ("constant_mean", "weekday_mean")}
    selected = min(validation, key=validation.get)
    calibration_errors = np.abs(calibration.coin_in_usd.to_numpy() - _predict(fit, calibration.gaming_date, selected))
    # Higher empirical quantile, using earlier chronological errors only.
    radius = float(np.quantile(calibration_errors, .90, method="higher"))
    baseline = _predict(train, test.gaming_date, "constant_mean")
    prediction = _predict(train, test.gaming_date, selected)
    actual = test.coin_in_usd.to_numpy(float)
    lower, upper = np.maximum(0, prediction - radius), prediction + radius
    baseline_mae, model_mae = float(np.abs(actual-baseline).mean()), float(np.abs(actual-prediction).mean())
    improvement = (1-model_mae/baseline_mae)*100 if baseline_mae else 0.
    difference_ci = block_mae_improvement(actual, baseline, prediction)
    weekdays = train.groupby(train.gaming_date.dt.day_of_week).coin_in_usd.agg(["mean", "count"])
    weekday_rows = [{"weekday": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][int(i)],
                     "weekday_index": int(i), "mean_coin_in": float(r["mean"]), "days": int(r["count"])} for i, r in weekdays.iterrows()]
    low, high = min(weekday_rows, key=lambda x:x["mean_coin_in"]), max(weekday_rows, key=lambda x:x["mean_coin_in"])
    decision = (f"Schedule discretionary maintenance on {low['weekday']} rather than {high['weekday']}; the training weekday means are "
                f"${low['mean_coin_in']:,.0f} versus ${high['mean_coin_in']:,.0f} daily coin-in. Keep technician coverage for peak days. "
                "This identifies timing, not the number of staff or a causal staffing return.")
    daily = [{"date": d.strftime("%Y-%m-%d"), "actual": float(a), "baseline": float(b), "prediction": float(p),
              "lower": float(lo), "upper": float(hi)} for d,a,b,p,lo,hi in zip(test.gaming_date,actual,baseline,prediction,lower,upper)]
    summary = {"headline": f"Calendar model cuts holdout error by {improvement:.1f}%" if improvement > 0 else "Calendar model does not beat the baseline",
               "decision": decision, "model": selected, "train_start": "2025-01-01", "train_end": "2025-04-30", "test_start": "2025-05-01", "test_end": "2025-06-30",
               "train_days": len(train), "test_days": len(test), "baseline_mae": baseline_mae, "model_mae": model_mae,
               "improvement_pct": improvement, "mae_improvement_usd": baseline_mae-model_mae,
               "mae_improvement_ci95": difference_ci, "coverage_90": float(np.mean((actual>=lower)&(actual<=upper))),
               "interval_radius_usd": radius, "constant_prediction_usd": float(baseline[0]),
               "model_bias_usd": float(np.mean(prediction-actual)), "validation_mae": validation,
               "validation_fit_end": "2025-02-28", "validation_start": "2025-03-01", "validation_end": "2025-04-30"}
    evidence = [{"id": "forecast-holdout", "claim": summary["headline"], "source": "property_day; src/forecast.py:build_report",
                 "method": "Select constant vs weekday means on Jan-Feb -> Mar-Apr MAE. Refit chosen form on Jan-Apr; freeze all 61 May-Jun forecasts at Apr 30. Evaluate both once on the same days.",
                 "result": f"MAE: ${model_mae:,.2f} model vs ${baseline_mae:,.2f} constant mean ({improvement:.2f}% reduction). Paired 7-day bootstrap 95% interval for dollar MAE improvement: ${difference_ci[0]:,.0f} to ${difference_ci[1]:,.0f}.",
                 "alternative": "Daily demand can shift with promotions, location changes or seasonality even on the same weekday.",
                 "limitation": "One 61-day holdout in a synthetic property. No causal staffing effect or external validity; bootstrap interval is descriptive and not a new selection criterion."},
                {"id": "forecast-interval", "claim": "Forecast uncertainty is calibrated before the test period", "source": "property_day; src/forecast.py:build_report",
                 "method": "90th percentile (higher) absolute March-April prediction errors from Jan-Feb fits sets a symmetric interval radius before refitting Jan-Apr. Report actual test coverage.",
                 "result": f"Empirical 90% band +/- ${radius:,.0f}; holdout coverage {summary['coverage_90']:.1%}.",
                 "alternative": "A changing demand distribution can make the earlier error band too wide or too narrow.",
                 "limitation": "Empirical forecasting band, not a guaranteed conformal interval: residuals can be serially correlated and the mean model is refit."},
                {"id": "forecast-decision", "claim": decision, "source": "property_day Jan-Apr; src/forecast.py weekday aggregation",
                 "method": "Training-only weekday arithmetic mean; equal-length daily targets. No future meters, weather, tourism or repairs used.",
                 "result": f"Lowest weekday {low['weekday']}: ${low['mean_coin_in']:,.0f}; highest {high['weekday']}: ${high['mean_coin_in']:,.0f}.",
                 "alternative": "Event-specific demand and breakdown risk could override the normal calendar pattern.",
                 "limitation": "Coin-in is wager throughput including replayed winnings, not revenue or unique guests."}]
    july = build_july_monitoring(train, selected, radius)
    return {"summary":summary, "daily":daily, "weekday":weekday_rows, "evidence":evidence + july["evidence"],
            "july_monitoring": july,
            "frozen_monthly": _monthly_metrics(daily), "retrospective_validation": retrospective_validation(frame),
            "features":["gaming_date weekday"], "excluded_features":["holdout meter lags", "future repairs", "realized weather", "later-revised tourism", "holdout staffing"],
            "interval_method":"Training-only chronological error quantile; descriptive 7-day paired holdout bootstrap for MAE difference"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="outputs/forecast.json")
    args = parser.parse_args()
    report = build_report()
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
