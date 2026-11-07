"""Money math for Dashboard Royale, shared by every question and the dashboard.

Every rate is a ratio of sums over the chosen rows, never a mean of daily ratios.
Off-floor rows (machine not yet installed or already retired) are always excluded.

Luck: a day's house win has variance sum_bet_squared * payout_multiplier_variance
(cents^2), from machine_day and game_math. So for any group of machine-days,
luck_z = (house_win - theo) / sqrt(sum of those variances). Under the configured
payout math, luck_z is roughly standard normal; a large |luck_z| over many spins
means the machine is not paying at its configured RTP (a lead to inspect).

    from src import metrics as m
    m.summarize(["machine_id"], start="2025-01-01", end="2025-06-30")
    m.summarize(["bank_id"], where="zone_id = 'Z-01'")
    m.floor_daily()
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import duckdb
import pandas as pd

MAIN_DATA = Path(r"C:\Users\asus\Desktop\MS\Datathon\challenges\challenge-2\data\dashboard-royale\data")


def data_dir() -> Path:
    """DR_DATA env var, else this checkout's data/, else the main checkout's (worktrees have no data/)."""
    if os.environ.get("DR_DATA"):
        return Path(os.environ["DR_DATA"])
    local = Path(__file__).resolve().parents[1] / "data" / "dashboard-royale" / "data"
    return local if local.exists() else MAIN_DATA


def table(name: str) -> str:
    """SQL reference to a parquet table by its bare name, e.g. table('machines')."""
    hits = list(data_dir().rglob(f"{name}.parquet"))
    if len(hits) != 1:
        raise FileNotFoundError(f"{name}.parquet: found {len(hits)} under {data_dir()}")
    return f"read_parquet('{hits[0].as_posix()}')"


@lru_cache(maxsize=1)
def con() -> duckdb.DuckDBPyConnection:
    """Connection with the `floor` view: one row per machine per on-floor gaming day."""
    c = duckdb.connect()
    c.execute(f"""
        CREATE VIEW floor AS
        SELECT d.*,
               cal.scheduled_seconds / 3600.0                          AS scheduled_hours,
               md.paid_spins                                           AS spins,
               md.payout_positive_spins,
               md.sum_bet_squared * g.payout_multiplier_variance / 1e4 AS house_win_var_usd2,
               g.payout_multiplier_variance
        FROM {table('prepared_daily_view')} d
        JOIN {table('calendar_day')} cal USING (gaming_date)
        JOIN {table('machine_day')} md USING (machine_id, gaming_date)
        JOIN {table('game_math')} g ON g.config_id = d.config_id
        WHERE d.active AND d.location_id IS NOT NULL
    """)
    return c


def sql(query: str, params: list | None = None) -> pd.DataFrame:
    return con().execute(query, params or []).df()


def _where(start: str | None, end: str | None, where: str | None) -> tuple[str, list]:
    parts, params = ["TRUE"], []
    if start:
        parts.append("gaming_date >= ?::DATE")
        params.append(start)
    if end:
        parts.append("gaming_date <= ?::DATE")
        params.append(end)
    if where:
        parts.append(f"({where})")
    return " AND ".join(parts), params


# Ratio-of-sums metrics, one SQL expression each. Columns are dollars unless named otherwise.
METRICS = """
    COUNT(*)                                                    AS machine_days,
    COUNT(DISTINCT machine_id)                                  AS machines,
    SUM(scheduled_hours)                                        AS scheduled_hours,
    SUM(available_hours)                                        AS available_hours,
    SUM(occupied_hours)                                         AS occupied_hours,
    SUM(available_hours) / NULLIF(SUM(scheduled_hours), 0)      AS availability,
    SUM(occupied_hours) / NULLIF(SUM(available_hours), 0)       AS occupancy,
    SUM(spins)                                                  AS spins,
    SUM(coin_in_usd)::DOUBLE                                    AS coin_in,
    SUM(payout_usd)::DOUBLE                                     AS payout,
    SUM(house_win_usd)::DOUBLE                                  AS house_win,
    SUM(theo_usd)::DOUBLE                                       AS theo,
    SUM(luck_residual_usd)::DOUBLE                              AS luck_residual,
    SQRT(SUM(house_win_var_usd2))                               AS luck_sd,
    SUM(luck_residual_usd)::DOUBLE / NULLIF(SQRT(SUM(house_win_var_usd2)), 0) AS luck_z,
    SUM(house_win_usd)::DOUBLE / NULLIF(SUM(coin_in_usd), 0)    AS observed_hold,
    SUM(theo_usd)::DOUBLE / NULLIF(SUM(coin_in_usd), 0)         AS theo_hold,
    SUM(luck_residual_usd)::DOUBLE / NULLIF(SUM(coin_in_usd), 0) AS hold_gap,
    SUM(coin_in_usd)::DOUBLE / NULLIF(SUM(spins), 0)            AS avg_bet,
    SUM(payout_positive_spins)::DOUBLE / NULLIF(SUM(spins), 0)  AS hit_rate,
    SUM(coin_in_usd)::DOUBLE / NULLIF(SUM(available_hours), 0)  AS coin_in_per_avail_hour,
    SUM(theo_usd)::DOUBLE / NULLIF(SUM(available_hours), 0)     AS theo_per_avail_hour,
    SUM(theo_usd)::DOUBLE / NULLIF(SUM(occupied_hours), 0)      AS theo_per_occupied_hour,
    SUM(theo_usd)::DOUBLE / COUNT(*)                            AS theo_per_floor_day,
    SUM(house_win_usd)::DOUBLE / COUNT(*)                       AS house_win_per_floor_day,
    SUM(lease_cost_usd + service_cost_usd + power_cost_usd + repair_cost_usd)::DOUBLE AS supplied_costs,
    SUM(contribution_after_supplied_costs_usd)::DOUBLE          AS contribution,
    SUM(theo_usd - lease_cost_usd - service_cost_usd - power_cost_usd - repair_cost_usd)::DOUBLE AS theo_contribution,
    SUM(faults_opened)                                          AS faults,
    SUM(scheduled_hours - available_hours)                      AS down_hours
"""


def summarize(group_by: list[str] | str | None = None, start: str | None = None, end: str | None = None,
              where: str | None = None, order_by: str | None = None) -> pd.DataFrame:
    """Ratio-of-sums metrics per group over on-floor machine-days in [start, end].

    group_by: columns of prepared_daily_view (machine_id, bank_id, zone_id, theme, manufacturer,
    volatility_class, month, local_weekday, ...). Location columns are the location on each day,
    so a machine that moved counts toward each bank only for its days there.
    """
    keys = [group_by] if isinstance(group_by, str) else list(group_by or [])
    w, params = _where(start, end, where)
    select = ", ".join(keys + [METRICS])
    group = f"GROUP BY {', '.join(keys)}" if keys else ""
    order = f"ORDER BY {order_by}" if order_by else (f"ORDER BY {', '.join(keys)}" if keys else "")
    return sql(f"SELECT {select} FROM floor WHERE {w} {group} {order}", params)


def floor_daily(start: str | None = None, end: str | None = None, where: str | None = None) -> pd.DataFrame:
    """Whole-floor (or filtered) metrics per gaming date."""
    return summarize(["gaming_date", "local_weekday", "is_weekend"], start, end, where)


def machine_days(start: str | None = None, end: str | None = None, where: str | None = None) -> pd.DataFrame:
    """The raw on-floor rows behind every summary, for drill-down and audit."""
    w, params = _where(start, end, where)
    return sql(f"SELECT * FROM floor WHERE {w} ORDER BY machine_id, gaming_date", params)


def manager_bottom10(start: str = "2025-01-01", end: str = "2025-06-30") -> pd.DataFrame:
    """The GM's naive list: lowest total house win. This is what Q1 must test, not the answer."""
    return summarize(["machine_id"], start, end, order_by="house_win").head(10)
