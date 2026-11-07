"""Fixed-origin daily coin-in forecast; no holdout outcomes enter predictions.

Run ``python -m src.forecast`` from a challenge checkout. All dollars are USD.
Only calendar weekday is a feature. Jan-Feb -> Mar-Apr selects between a
constant and weekday mean; the chosen form is refit on Jan-Apr and frozen.
"""
from __future__ import annotations

import argparse
import json
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
    return {"summary":summary, "daily":daily, "weekday":weekday_rows, "evidence":evidence,
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
