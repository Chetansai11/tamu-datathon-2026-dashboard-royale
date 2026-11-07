"""Checks src/metrics.py against the organizers' own totals. Run: python -m pytest tests -q"""
import numpy as np
import pytest

from src import metrics as m


@pytest.fixture(scope="module")
def floor():
    return m.floor_daily()


def test_off_floor_rows_excluded():
    # 56,110 machine-days minus the 1,018 not-installed or retired rows (GUIDE.md section 5).
    assert m.summarize().machine_days.item() == 56110 - 1018


def test_floor_matches_property_day(floor):
    prop = m.sql(f"SELECT * FROM {m.table('property_day')} ORDER BY gaming_date")
    assert len(floor) == len(prop) == 181
    for ours, theirs in [("coin_in", "coin_in_usd"), ("house_win", "house_win_usd"), ("theo", "theo_usd"),
                         ("available_hours", "available_machine_hours"), ("occupied_hours", "occupied_machine_hours")]:
        np.testing.assert_allclose(floor[ours].to_numpy(), prop[theirs].astype(float).to_numpy(), rtol=1e-6, atol=0.01,
                                   err_msg=ours)
    assert (floor.machines.to_numpy() == prop.active_machines.to_numpy()).all()


def test_ratio_of_sums_not_mean_of_ratios(floor):
    total = m.summarize()
    assert total.observed_hold.item() == pytest.approx(floor.house_win.sum() / floor.coin_in.sum())
    assert total.observed_hold.item() != pytest.approx((floor.house_win / floor.coin_in).mean(), rel=1e-9)


def test_groups_add_up_to_total():
    total = m.summarize()
    banks = m.summarize("bank_id")
    for col in ["coin_in", "house_win", "theo", "machine_days", "available_hours"]:
        assert banks[col].sum() == pytest.approx(total[col].item(), rel=1e-9), col


def test_luck_residual_and_hold_gap():
    s = m.summarize("machine_id")
    np.testing.assert_allclose(s.luck_residual, s.house_win - s.theo, atol=0.01)
    np.testing.assert_allclose(s.hold_gap, s.observed_hold - s.theo_hold, atol=1e-9)


def test_period_filter_and_where():
    jan = m.summarize(start="2025-01-01", end="2025-01-31")
    assert jan.machine_days.item() == m.summarize(where="month = '2025-01'").machine_days.item()
    assert m.floor_daily("2025-03-08", "2025-03-08").scheduled_hours.item() == pytest.approx(
        23 * m.floor_daily("2025-03-08", "2025-03-08").machines.item())  # DST day has 23 hours


def test_luck_z_is_calibrated_on_daily_rows():
    # Under the configured payout math, a machine-day's luck z is about N(0, 1).
    # Payouts are right-skewed (rare jackpots), so test the mean and SD, not the median.
    z = m.sql("SELECT luck_residual_usd / SQRT(house_win_var_usd2) AS z FROM floor WHERE house_win_var_usd2 > 0").z
    assert abs(z.mean()) < 0.05
    assert 0.9 < z.std() < 1.15
    # Per machine over six months: nearly all within 3 SD, so an outlier is worth inspecting.
    s = m.summarize("machine_id")
    assert (s.luck_z.abs() > 3).sum() <= 3
