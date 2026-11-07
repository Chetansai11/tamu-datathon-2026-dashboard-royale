import pytest

from src.q6_actions import catalog, price, validate_plan, build_report


def test_guide_lease_example_and_fixed_packages():
    cat = catalog()
    assert price(cat["A-REPLACE-LEASE"]) == 3380
    assert price(cat["A-TECH-SHIFT"]) == 11520
    assert price(cat["A-REPLACE-BUY"], 10) == 220000


def test_catalog_quantity_and_horizon():
    cat = catalog()
    with pytest.raises(ValueError, match="Quantity"):
        price(cat["A-INSPECT"], 16)
    assert price(cat["A-REPLACE-LEASE"], horizon=5) == 2500


def test_policy_incompatibility_and_same_target_conflict():
    with pytest.raises(ValueError, match="incompatible"):
        validate_plan([{"action_type_id": k, "quantity": 1, "targets": []} for k in ["A-COMP-PILOT", "A-COMP-CHANGE"]])
    with pytest.raises(ValueError, match="Conflicting"):
        validate_plan([{"action_type_id": k, "quantity": 1, "targets": ["M-1158"]} for k in ["A-MOVE-MACHINE", "A-REPLACE-LEASE"]])


def test_budget_and_inspection_plan():
    with pytest.raises(ValueError, match="budget"):
        validate_plan([{"action_type_id": "A-REPLACE-BUY", "quantity": 10, "targets": [f"M-{n}" for n in range(10)]}])
    assert validate_plan([{"action_type_id": "A-INSPECT", "quantity": 1, "targets": ["M-1158"]}]) == 1200


def test_sensitivity_is_payout_gap_recovery_not_new_theo():
    report = build_report(
        q1={"ranking": [{"machine_id": "M-1158", "theo_per_avail_hour": 10., "luck_residual": -18100., "machine_days": 181}]},
        q3={"summary": {"technician_comparison": {"waiting_theo_by_shift": [{"shift": "swing", "waiting_lost_theo": 18100.}]}}},
        q5={"summary": {"post_cost_above_pre_reinvestment": 6100.}})
    assert report["summary"]["expected_direct_revenue_uplift"] == 0
    worst, best = report["scenario_rows"][0], report["scenario_rows"][-1]
    assert worst["gross_conditional_house_win"] == 0
    assert worst["net_after_inspection_and_modeled_downtime"] == -1220
    assert best["gross_conditional_house_win"] == 2900  # $100 historical gap/day × 29 days
    assert best["net_after_inspection_and_modeled_downtime"] == 1680
