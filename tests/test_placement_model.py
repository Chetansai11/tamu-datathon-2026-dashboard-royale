"""Leakage, abstention and physical inventory checks for placement scenarios."""
import numpy as np
import pandas as pd
import pytest
from threadpoolctl import threadpool_limits

from src.placement_model import (
    FEATURES, RateModel, features, frozen_metadata, inventory, residual_quantile,
    scenario_predictions, select_candidate, support_for, support_table,
)


def small_history():
    rows = []
    for day in pd.date_range("2025-01-01", "2025-06-30"):
        for machine in range(4):
            rows.append({"machine_id": f"M-{machine}", "gaming_date": day,
                         "config_id": "G-A" if machine < 2 else "G-B",
                         "zone_id": "Z-A" if machine % 2 else "Z-B", "manufacturer": "Test",
                         "available_hours": 24., "rate": 5. + machine + day.dayofweek*.2})
    return pd.DataFrame(rows)


def test_prediction_feature_allowlist_ignores_outcomes_and_ids():
    rows = small_history().iloc[:10].copy()
    before = features(rows)
    rows["coin_in_usd"] = 9e12
    rows["zone_entries_observed"] = 9e12
    rows["occupied_hours"] = 24
    rows["lag_coin_in_7d_mean_usd"] = 9e12
    rows["rate"] = 9e12
    rows["machine_id"] = "M-REPLACED"
    pd.testing.assert_frame_equal(features(rows), before)
    assert list(before.columns) == FEATURES
    assert not {"rate", "machine_id", "bank_id", "location_id", "occupied_hours"} & set(FEATURES)


def test_frozen_origin_metadata_does_not_see_future_moves_or_new_machines():
    rows = small_history()
    future = rows.loc[rows.gaming_date >= "2025-05-01"].copy()
    future.loc[future.machine_id == "M-0", "zone_id"] = "FUTURE-DESTINATION"
    future.loc[future.machine_id == "M-0", "config_id"] = "FUTURE-GAME"
    unknown = future.iloc[:1].copy(); unknown["machine_id"] = "M-NEW"
    forecast, excluded = frozen_metadata(rows, pd.concat([future, unknown]), "2025-04-30")
    assert excluded == 1
    assert "FUTURE-DESTINATION" not in set(forecast.zone_id)
    assert "FUTURE-GAME" not in set(forecast.config_id)
    assert forecast.loc[forecast.machine_id == "M-0", "actual_zone_id"].eq("FUTURE-DESTINATION").all()
    # Future data may remain only as scoring outcomes, not model inputs.
    assert features(forecast).weekday.astype(int).to_numpy().tolist() == forecast.gaming_date.dt.dayofweek.tolist()


def test_model_selection_is_invariant_to_calibration_and_test_outcomes():
    rows = small_history()
    altered = rows.copy()
    future = altered.gaming_date > "2025-04-15"
    altered.loc[future, "rate"] = 1e10
    altered.loc[future, "zone_id"] = "IMPOSSIBLE-FUTURE-ZONE"
    altered.loc[future, "manufacturer"] = "FUTURE"
    with threadpool_limits(limits=2):
        before = select_candidate(rows)
        after = select_candidate(altered)
    assert before == after


def test_support_requires_independent_machines_and_exposure():
    repeated = pd.DataFrame({"machine_id": ["M-1"]*1000, "zone_id": ["Z-A"]*1000, "config_id": ["G-A"]*1000})
    info = support_for(support_table(repeated), "Z-A", "G-A")
    assert info["supportMachines"] == 1 and not info["supported"]
    assert not support_for({}, "Z-UNKNOWN", "G-A")["supported"]
    diverse = pd.DataFrame({"machine_id": [f"M-{i%3}" for i in range(120)], "zone_id": ["Z-A"]*120, "config_id": ["G-A"]*120})
    assert support_for(support_table(diverse), "Z-A", "G-A")["supported"]
    assert not support_for(support_table(diverse.iloc[:119]), "Z-A", "G-A")["supported"]


def test_inventory_keeps_zero_availability_machine_and_only_slot_nodes():
    rows = pd.DataFrame([{"machine_id": "M-1", "gaming_date": pd.Timestamp("2025-06-30"), "active": True,
                          "location_id": "L-1", "zone_id": "Z-A", "zone_name": "Zone A", "available_hours": 0.}])
    locations = pd.DataFrame([
        {"location_id": "L-1", "node_type": "slot", "zone_id": "Z-A", "bank_id": "B-1", "x_m": 1., "y_m": 1.},
        {"location_id": "L-2", "node_type": "slot", "zone_id": "Z-A", "bank_id": "B-1", "x_m": 2., "y_m": 1.},
        {"location_id": "B-1", "node_type": "bank", "zone_id": "Z-A", "bank_id": "B-1", "x_m": 1., "y_m": 1.},
    ])
    zones, slots, current = inventory({"prepared_daily_view": rows, "floor_locations": locations}, rows)
    assert len(current) == 1 and len(slots) == 2 and len(zones) == 1
    assert slots[0]["occupant"] == "M-1" and slots[1]["occupant"] is None


def test_fitted_candidates_accept_unseen_categories_without_id_memorization():
    rows = small_history()
    future = rows.iloc[:4].copy()
    future["zone_id"] = "UNSEEN"
    future["manufacturer"] = "UNSEEN"
    with threadpool_limits(limits=2):
        for name in ["baseline", "ridge", "histogram"]:
            pred = RateModel(name).fit(rows).predict(future)
            assert np.isfinite(pred).all() and (pred >= 0).all()


def test_residual_order_statistic_and_invalid_calibration():
    assert residual_quantile(np.arange(1., 11.)) == 10.
    assert residual_quantile(np.arange(1., 101.)) == 91.
    with pytest.raises(ValueError):
        residual_quantile(np.array([]))
    with pytest.raises(ValueError):
        residual_quantile(np.array([np.nan]))


def test_scenarios_use_post_lead_calendar_for_current_and_destination():
    class WeekdayModel:
        def predict(self, rows):
            return rows.gaming_date.dt.dayofweek.to_numpy(float) + 10
    current = pd.DataFrame([{"machine_id": "M-1", "config_id": "G-A", "manufacturer": "Test", "theme": "Test",
                             "zone_id": "Z-A", "location_id": "L-1", "bank_id": "B-1"}])
    support = {("Z-A", "G-A"): {"supportMachines": 3, "supportDays": 120}}
    result = scenario_predictions(WeekdayModel(), current, [{"id": "Z-A"}, {"id": "Z-B"}], support,
                                  {"byZone": {}, "pooled": 2.})
    assert result[0]["predictions"]["Z-A"]["mean"] == 13.  # July3–30 has four of every weekday.
    assert result[0]["predictions"]["Z-A"]["lower"] == 11.
    assert result[0]["predictions"]["Z-A"]["upper"] == 15.
    assert result[0]["predictions"]["Z-B"]["mean"] is None  # Never expose an unsupported dollar estimate.
