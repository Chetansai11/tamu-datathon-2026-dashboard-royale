"""Checks for the exposure / game / location / machine / luck decomposition."""
import numpy as np
import pytest

from src import metrics as m
from src import q1_decomposition as q

COMPONENTS = q.COMPONENTS


@pytest.fixture(scope="module")
def per():
    return q.decompose(draws=200)


def test_components_add_up_exactly(per):
    assert np.allclose(per[COMPONENTS].sum(axis=1), per.gap, atol=1e-6)


def test_totals_match_metrics(per):
    s = m.summarize("machine_id").set_index("machine_id")
    p = per.set_index("machine_id")
    assert np.allclose(p.theo, s.loc[p.index, "theo"], atol=0.01)
    assert np.allclose(p.win, s.loc[p.index, "house_win"], atol=0.01)
    assert len(p) == 310


def test_floor_wide_components_are_small(per):
    # Leave-one-out benchmarks: across all machines, game, location and machine effects are
    # deviations from floor and zone averages, so their floor totals stay small relative to theo.
    total_theo = per.theo.sum()
    for c in ["game", "location", "machine"]:
        assert abs(per[c].sum()) < 0.02 * total_theo, c


def test_exposure_tracks_days_on_floor(per):
    full = per[per.days == per.days.max()]
    short = per[per.days < 0.5 * per.days.max()]
    assert full.exposure.abs().median() < 0.05 * per.benchmark.iloc[0]
    assert (short.exposure < 0).all()


def test_luck_matches_metrics_z(per):
    s = m.summarize("machine_id").set_index("machine_id")
    p = per.set_index("machine_id")
    assert np.allclose(p.luck_z, s.loc[p.index, "luck_z"], atol=1e-9)


def test_machine_ci_brackets_point_estimate(per):
    inside = (per.machine_ci_low <= per.machine_factor + 1e-9) & (per.machine_factor <= per.machine_ci_high + 1e-9)
    assert inside.mean() > 0.97


def test_report_headline_for_gm_ten():
    rep = q.build_report()
    t = rep["gm_bottom10_totals"]
    assert sum(t[c] for c in COMPONENTS) == pytest.approx(t["gap"], abs=0.1)
    assert rep["meta"]["identity_max_error"] < 1e-6
    # Back Forty is the weakest zone against its own game mix.
    assert rep["zones"][0]["zone_name"] == "Back Forty"
