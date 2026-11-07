import numpy as np
import pandas as pd
import pytest

from src.q1_machines import analyze, peer_rate, weekly_ratio_interval


def test_peer_excludes_target_and_uses_ratio_of_sums():
    frame = pd.DataFrame({"machine_id": ["target", "a", "b", "c"], "group": [1]*4,
                          "available_hours": [10., 1., 2., 7.], "theo_usd": [10000., 10., 100., 210.]})
    rate, counts = peer_rate(frame, ["group"])
    assert rate.iloc[0] == 32
    assert counts.iloc[0] == 3
    assert rate.iloc[0] != pytest.approx(np.mean([10., 50., 30.]))


def test_weekly_paired_bootstrap_preserves_constant_ratio():
    frame = pd.DataFrame({"gaming_date": pd.date_range("2025-01-01", periods=56),
                          "theo_usd": np.arange(1., 57.), "expected_theo": np.arange(1., 57.)*2})
    assert weekly_ratio_interval(frame) == pytest.approx((.5, .5))


@pytest.fixture(scope="module")
def report():
    return analyze()


def test_all_gm_candidates_and_adjusted_conservation(report):
    assert len(report["ranking"]) == 310
    assert len(report["bottom10"]) == 10
    assert report["summary"]["on_floor_rows"] == 55092
    assert report["summary"]["bottom10_already_retired"] == 2
    for row in report["ranking"]:
        assert row["adjusted_index"] == pytest.approx(row["theo"] / row["expected_theo"])
        assert row["adjusted_ci_low"] <= row["adjusted_ci_high"]
        assert 0 <= row["payout_p_bonferroni"] <= 1


def test_inspection_is_screened_floor_wide(report):
    assert report["summary"]["inspection_signals"] == ["M-1158"]
    row = next(x for x in report["ranking"] if x["machine_id"] == "M-1158")
    assert row["payout_p_bonferroni"] == pytest.approx(min(1., row["payout_p_approx"]*310))
    assert row["payout_p_bonferroni"] < .05


def test_moving_machine_keeps_dated_locations(report):
    row = next(x for x in report["ranking"] if x["machine_id"] == "M-1152")
    assert len(row["bank_ids"]) == 2
