"""July exports and operational alert behavior, independent of future outcomes."""
import copy

import numpy as np
import pandas as pd
import pytest

from src.forecast import build_report, build_july_monitoring, evaluate_july_alerts


def calendar():
    dates = pd.date_range("2025-01-01", "2025-06-30")
    return pd.DataFrame({"gaming_date": dates,
                         "coin_in_usd": 1000. + dates.day_of_week.to_numpy() * 100. + np.arange(len(dates)) % 11})


@pytest.fixture(scope="module")
def report():
    return build_report(calendar())


@pytest.fixture
def plan(report):
    return copy.deepcopy(report["july_monitoring"])


def test_july_is_a_complete_unobserved_extension_of_the_original_reference(report):
    plan = report["july_monitoring"]
    assert plan["status"] == "prospective_plan"
    assert plan["prepared_retrospectively"] is True
    assert plan["model_frozen_at"] == report["summary"]["train_end"] == "2025-04-30"
    assert plan["days"] == 30
    assert [r["date"] for r in plan["daily"]] == pd.date_range("2025-07-01", "2025-07-30").strftime("%Y-%m-%d").tolist()
    assert plan["daily"][0]["weekday"] == "Tuesday"
    assert plan["daily"][1]["weekday"] == "Wednesday"
    assert plan["calibration"]["radius_usd"] == report["summary"]["interval_radius_usd"]
    assert plan["calibration"]["end"] == "2025-04-30"
    means = {r["weekday"]: r["mean_coin_in"] for r in report["weekday"]}
    for row in plan["daily"]:
        assert row["actual"] is None
        assert row["prediction"] == round(means[row["weekday"]], 2)
        assert 0 <= row["watch_below"] == row["lower"] <= row["prediction"]
        assert row["watch_above"] == row["upper"] >= row["prediction"]
    assert report["daily"][0]["date"] == "2025-05-01"
    assert report["daily"][-1]["date"] == "2025-06-30"
    assert [r["id"] for r in report["evidence"]] == ["forecast-holdout", "forecast-interval", "forecast-decision", "forecast-july-monitoring"]


def test_holdout_and_later_actuals_cannot_change_july_predictions_or_rules(report):
    changed = calendar()
    changed.loc[changed.gaming_date >= "2025-05-01", "coin_in_usd"] *= 100
    july = pd.DataFrame({"gaming_date": pd.date_range("2025-07-01", "2025-07-31"), "coin_in_usd": 99999999.})
    result = build_report(pd.concat([changed, july], ignore_index=True))
    assert result["july_monitoring"] == report["july_monitoring"]
    assert result["summary"]["model_mae"] != report["summary"]["model_mae"]


def test_constant_model_is_respected_instead_of_silently_forcing_weekdays():
    train = calendar().query("gaming_date <= '2025-04-30'")
    plan = build_july_monitoring(train, "constant_mean", 10000.)
    assert {r["prediction"] for r in plan["daily"]} == {round(float(train.coin_in_usd.mean()), 2)}
    assert all(r["lower"] == 0 for r in plan["daily"])


@pytest.mark.parametrize("mutation", ["missing", "duplicate", "negative", "nan", "inf"])
def test_july_plan_rejects_incomplete_or_invalid_training(mutation):
    train = calendar().query("gaming_date <= '2025-04-30'").copy()
    if mutation == "missing":
        train = train.iloc[1:]
    elif mutation == "duplicate":
        train = pd.concat([train, train.iloc[[0]]])
    else:
        train.loc[0, "coin_in_usd"] = {"negative": -1, "nan": np.nan, "inf": np.inf}[mutation]
    with pytest.raises(ValueError):
        build_july_monitoring(train, "weekday_mean", 50.)


def test_exact_threshold_is_within_band_and_zero_is_a_real_observation(plan):
    first, second, third = plan["daily"][:3]
    result = evaluate_july_alerts(plan, {first["date"]: first["watch_below"], second["date"]: second["watch_above"], third["date"]: 0.})
    assert [r["status"] for r in result[:3]] == ["within_band", "within_band", "watch"]
    assert result[2]["direction"] == "below"
    assert result[2]["actual"] == 0.
    assert result[3]["status"] == "awaiting_data"


@pytest.mark.parametrize("direction", ["below", "above"])
def test_two_consecutive_same_direction_breaches_trigger_review(plan, direction):
    observations = {r["date"]: r["watch_below"] - .01 if direction == "below" else r["watch_above"] + .01 for r in plan["daily"][:3]}
    result = evaluate_july_alerts(plan, observations)
    assert [r["status"] for r in result[:4]] == ["watch", "review", "review", "awaiting_data"]
    assert [r["consecutive_breaches"] for r in result[:4]] == [1, 2, 3, 0]
    assert all(r["direction"] == direction for r in result[:3])


@pytest.mark.parametrize("middle", ["missing", "null", "inside", "opposite"])
def test_missing_inside_and_opposite_days_break_a_direction_streak(plan, middle):
    first, second, third = plan["daily"][:3]
    observations = {first["date"]: first["watch_below"] - .01, third["date"]: third["watch_below"] - .01}
    if middle != "missing":
        observations[second["date"]] = {"null": None, "inside": second["prediction"], "opposite": second["watch_above"] + .01}[middle]
    result = evaluate_july_alerts(plan, observations)
    assert result[2]["status"] == "watch"
    assert result[2]["consecutive_breaches"] == 1
    assert result[1]["status"] == {"missing": "awaiting_data", "null": "awaiting_data", "inside": "within_band", "opposite": "watch"}[middle]


@pytest.mark.parametrize("invalid", [-1, float("nan"), float("inf"), float("-inf"), True, "100", complex(1, 2), 10 ** 1000])
def test_invalid_observations_cannot_silently_trigger_alerts(plan, invalid):
    with pytest.raises(ValueError):
        evaluate_july_alerts(plan, {"2025-07-01": invalid})


def test_outside_calendar_rejected_and_missing_month_has_no_alerts(plan):
    with pytest.raises(ValueError):
        evaluate_july_alerts(plan, {"2025-06-30": 0.})
    with pytest.raises(ValueError):
        evaluate_july_alerts(plan, {"2025-07-31": 0.})
    rows = evaluate_july_alerts(plan, {})
    assert len(rows) == 30
    assert all(r["status"] == "awaiting_data" and r["actual"] is None and r["consecutive_breaches"] == 0 for r in rows)
