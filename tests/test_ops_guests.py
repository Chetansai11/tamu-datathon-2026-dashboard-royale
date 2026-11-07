"""Accounting, temporal and population invariants for Q3-Q5."""
import json

import pandas as pd
import pytest

from src import metrics as m
from src.q3_downtime import run as downtime
from src.q4_q5_players import MEASURES, concentration, run as guests


@pytest.fixture(scope="module")
def q3(tmp_path_factory):
    return downtime(tmp_path_factory.mktemp("q3")/"q3.json")


@pytest.fixture(scope="module")
def q45(tmp_path_factory):
    return guests(tmp_path_factory.mktemp("q45"))


def test_hourly_daily_and_ticket_downtime_reconcile(q3):
    for residual in q3["validation"].values():
        assert abs(residual)<1e-6
    assert q3["operations"]["validation"]["unmatched_roster"]==0
    assert q3["operations"]["validation"]["tickets"]==q3["operations"]["validation"]["distinct_tickets"]


def test_downtime_rollups_reconcile(q3):
    for grain in ["daily_bank","by_shift","by_month","by_manufacturer","by_machine"]:
        for measure in ["down_hours","lost_coin_in","lost_theo"]:
            assert sum(x[measure] for x in q3[grain])==pytest.approx(q3["summary"][measure],abs=1e-5)
    assert all(x["lost_coin_in"]>=0 for x in q3["daily_bank"])


def test_waiting_interval_overlap_reconciles(q3):
    exact=sum(x["wait_hours"] for x in q3["operations"]["waiting_opportunity_by_clock_shift"])
    assert exact==pytest.approx(q3["operations"]["validation"]["waiting_hours"],abs=1e-6)
    ceiling=q3["summary"]["technician_comparison"]
    assert ceiling["benefit_days"]==30-ceiling["lead_days"]
    assert ceiling["best_shift_july_perfect_recovery_ceiling"]<ceiling["package_cost"]


def test_player_totals_match_carded_meters_and_single_cost_accounting(q45):
    q4,_=q45
    for field in ["player_minus_carded_meter_coin_in","player_minus_carded_meter_payout","contribution_accounting_residual"]:
        assert abs(q4["validation"][field])<0.01
    s=q4["summary"]
    assert s["net"]==pytest.approx(s["payout"]-s["coin_in"],abs=0.01)
    assert s["ahead_players"]+s["losing_players"]+s["breakeven_players"]==s["active_players"]
    assert s["active_players"]<=s["players"]
    assert s["net"]==pytest.approx(s["gross_player_winnings"]-s["gross_player_losses"],abs=0.01)


def test_window_unique_players_not_monthly_sum(q45):
    q4,_=q45
    expected=m.sql(f"SELECT COUNT(DISTINCT player_id) n FROM {m.table('player_period')}").iloc[0,0]
    assert q4["summary"]["players"]==expected
    assert sum(x["players"] for x in q4["monthly"])>expected
    assert len({(x["start_month"],x["end_month"]) for x in q4["windows"]})==21
    for window in q4["windows"]:
        assert 0<=window["top1_coin_share"]<=window["top10_coin_share"]<=1


def test_group_partition_preserves_money_for_each_window(q45):
    q4,_=q45
    rows=pd.DataFrame(q4["windows"])
    for (start,end),part in rows.groupby(["start_month","end_month"]):
        total=part[part.group_key=="all"].iloc[0]
        for dimension in ["home_region:","age_band:","opening_tier:"]:
            chunk=part[part.group_key.str.startswith(dimension)]
            assert chunk.coin_in.sum()==pytest.approx(total.coin_in,abs=0.01)
            assert chunk.players.sum()==total.players


def test_concentration_uses_named_nonnegative_population():
    assert concentration(pd.Series([70.,20.,10.]),3,0.1)["share"]==0.7
    assert concentration(pd.Series([],dtype=float),0,0.1)["share"] is None


def test_comp_cost_reconciles_across_independent_facts(q45):
    _,q5=q45
    v=q5["validation"]
    assert v["bad_redemption_links"]==0
    assert v["ledger_cost"]==pytest.approx(v["property_cost"],abs=0.01)
    assert v["ledger_cost"]==pytest.approx(v["player_cost"],abs=0.01)
    assert v["ledger_cost"]==pytest.approx(v["pos_comp_cogs"],abs=0.01)


def test_matched_comp_schedule_controls_tier_and_benefit(q45):
    _,q5=q45
    matched=q5["matched_schedule_changes"]
    assert len(matched)==30
    assert all(x["constant_within_phase"] for x in matched)
    assert all(x["after_points"]<x["before_points"] for x in matched)
    assert all(x["after_cost"]==x["before_cost"] for x in matched)
    assert q5["summary"]["before_may"]["points_per_coin_dollar"]==pytest.approx(q5["summary"]["may_june"]["points_per_coin_dollar"],abs=1e-6)
