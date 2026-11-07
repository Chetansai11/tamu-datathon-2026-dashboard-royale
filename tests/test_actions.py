import pytest

from src.q6_actions import catalog, price, validate_plan


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
