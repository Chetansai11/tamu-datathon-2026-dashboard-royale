"""Checks for the exposure / game / location / machine / luck decomposition."""
import numpy as np
import pandas as pd
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


@pytest.fixture
def peer_example():
    """Mixed games and dated moves make target contamination observable."""
    rows = []
    for date in pd.to_datetime(["2025-01-01", "2025-01-08", "2025-02-01", "2025-02-08"]):
        for mid, config, zone, theo in [
            ("target", "A", "west" if date.month == 1 else "east", 100.),
            ("peer-a", "A", "west", 50.),
            ("peer-b", "B", "west", 200.),
            ("peer-c", "A", "east", 300.),
            ("peer-d", "B", "east", 50.),
        ]:
            rows.append(dict(machine_id=mid, gaming_date=date, month=date.strftime("%Y-%m"),
                             zone_id=zone, zone_name=zone, bank_id=zone, config_id=config,
                             theme=config, h=10., occ=5., theo=theo, win=theo + 1., var=25.,
                             week=(date - pd.Timestamp("2024-12-30")).days // 7))
    return pd.DataFrame(rows, index=range(100, 100 + len(rows)))


def test_zone_factor_matches_direct_peer_only_recomputation(peer_example):
    """Independent small-data oracle drops each target before every aggregation."""
    actual = q._zone_factor_loo(peer_example)
    for mid in peer_example.machine_id.unique():
        peers = peer_example[peer_example.machine_id != mid].copy()
        game = peers.groupby(["gaming_date", "config_id"])[["theo", "h"]].transform("sum")
        peers["mix"] = peers.h * game.theo / game.h
        zones = peers.groupby(["zone_id", "month"])[["theo", "mix"]].sum()
        for index, row in peer_example[peer_example.machine_id == mid].iterrows():
            z = zones.loc[(row.zone_id, row.month)]
            assert actual.loc[index] == pytest.approx(z.theo / z["mix"], abs=1e-12)


@pytest.mark.parametrize("target", ["target", "peer-a"])
def test_target_outcomes_cannot_change_own_peer_benchmarks(peer_example, monkeypatch, target):
    monkeypatch.setattr(q, "_rows", lambda *_: peer_example.copy())
    before = q.decompose(draws=100).set_index("machine_id").loc[target]
    changed = peer_example.copy()
    changed.loc[changed.machine_id == target, "theo"] *= 9
    monkeypatch.setattr(q, "_rows", lambda *_: changed.copy())
    after = q.decompose(draws=100).set_index("machine_id").loc[target]
    # Mutation changes the target outcome, but none of its peer references.
    assert after.theo == pytest.approx(before.theo * 9)
    for field in ["e_floor", "e_game", "e_loc", "location_factor"]:
        assert after[field] == pytest.approx(before[field], rel=1e-12, abs=1e-10), field
    # The common whole-floor comparator deliberately includes the target.
    assert after.benchmark > before.benchmark
    for result in [before, after]:
        assert result[COMPONENTS].sum() == pytest.approx(result.gap, abs=1e-9)


def test_missing_zone_peers_use_neutral_location_factor(peer_example):
    example = peer_example.copy()
    example.loc[example.machine_id == "target", "zone_id"] = "only-target"
    factors = q._zone_factor_loo(example)
    assert (factors[example.machine_id == "target"] == 1).all()
