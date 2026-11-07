"""Q3: retrospective missing-play scenarios, reconciled to machine meters.

Run: python -m src.q3_downtime. No claim here identifies causal recapture.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from src import metrics as m


def records(frame: pd.DataFrame) -> list[dict]:
    return json.loads(frame.to_json(orient="records", date_format="iso"))


def build_hourly() -> None:
    """Observed full-hour rate pools exclude partial/down hours from estimation.

    Same-machine/location month/weekday/local-hour is primary (at least two full
    hours), then same-machine/location weekday/hour, then bank/month/hour.
    A separate bank/month/weekday/hour estimate is a sensitivity comparison.
    These are retrospective pools, never forecast features.
    """
    c = m.con()
    c.execute(f"""
        CREATE OR REPLACE TEMP TABLE q3_hour AS
        SELECT h.*, d.zone_id, d.bank_id, d.manufacturer, d.config_id,
            CAST(d.configured_rtp AS DOUBLE) AS rtp,
            strftime(h.gaming_date, '%Y-%m') AS period_month,
            dayofweek(h.gaming_date) AS weekday,
            CASE WHEN h.local_hour >= 6 AND h.local_hour < 14 THEN 'day'
                 WHEN h.local_hour >= 14 AND h.local_hour < 22 THEN 'swing'
                 ELSE 'grave' END AS shift,
            (3600-h.available_seconds)/3600.0 AS down_hours,
            h.coin_in_cents/100.0 AS coin_in
        FROM {m.table('machine_hour')} h
        JOIN {m.table('prepared_daily_view')} d USING(machine_id,gaming_date)
        WHERE h.active AND d.active AND d.location_id IS NOT NULL
    """)
    pools = {
        "q3_local": "machine_id, location_id, period_month, weekday, local_hour",
        "q3_history": "machine_id, location_id, weekday, local_hour",
        "q3_peer": "bank_id, period_month, weekday, local_hour",
        "q3_fallback": "bank_id, period_month, local_hour",
    }
    for name, keys in pools.items():
        c.execute(f"""CREATE OR REPLACE TEMP TABLE {name} AS
            SELECT {keys}, COUNT(*) AS n_full, SUM(coin_in)/COUNT(*) AS rate
            FROM q3_hour WHERE available_seconds=3600 GROUP BY {keys}""")
    c.execute("""
        CREATE OR REPLACE TEMP TABLE q3_estimates AS
        WITH rated AS (
            SELECT h.*,
                COALESCE(CASE WHEN l.n_full>=2 THEN l.rate END,
                         CASE WHEN p.n_full>=2 THEN p.rate END, f.rate, 0) AS primary_rate,
                COALESCE(b.rate,f.rate,0) AS peer_rate,
                CASE WHEN l.n_full>=2 THEN 'machine_month_weekday_hour'
                     WHEN p.n_full>=2 THEN 'machine_weekday_hour'
                     ELSE 'bank_month_hour' END AS rate_source
            FROM q3_hour h
            LEFT JOIN q3_local l USING(machine_id,location_id,period_month,weekday,local_hour)
            LEFT JOIN q3_history p USING(machine_id,location_id,weekday,local_hour)
            LEFT JOIN q3_peer b USING(bank_id,period_month,weekday,local_hour)
            LEFT JOIN q3_fallback f USING(bank_id,period_month,local_hour)
        )
        SELECT *, down_hours*primary_rate AS lost_coin_in,
            down_hours*primary_rate*(1-rtp) AS lost_theo,
            down_hours*peer_rate AS peer_lost_coin_in,
            down_hours*(SELECT SUM(coin_in)/(SUM(available_seconds)/3600.0)
                        FROM q3_hour) AS baseline_lost_coin_in
        FROM rated
    """)


AGG = """
    SUM(down_hours) AS down_hours, SUM(coin_in) AS observed_coin_in,
    SUM(available_seconds)/3600.0 AS available_hours,
    SUM(lost_coin_in) AS lost_coin_in, SUM(lost_theo) AS lost_theo,
    SUM(peer_lost_coin_in) AS peer_lost_coin_in,
    SUM(baseline_lost_coin_in) AS baseline_lost_coin_in
"""


def operation_analysis() -> dict:
    c = m.con()
    c.execute(f"""
        CREATE OR REPLACE TEMP TABLE q3_tickets AS
        SELECT o.*, cal.gaming_date, r.shift,
            r.planned_headcount, r.actual_headcount,
            r.actual_headcount < r.planned_headcount AS understaffed,
            epoch(LEAST(o.available_at_utc, TIMESTAMP '2025-07-01 13:00:00')
                  - GREATEST(o.opened_at_utc,TIMESTAMP '2025-01-01 14:00:00'))/3600 AS down_hours,
            epoch(LEAST(o.work_started_at_utc,TIMESTAMP '2025-07-01 13:00:00')
                  - GREATEST(o.opened_at_utc,TIMESTAMP '2025-01-01 14:00:00'))/3600 AS wait_hours,
            epoch(LEAST(o.available_at_utc,TIMESTAMP '2025-07-01 13:00:00')
                  - GREATEST(o.work_started_at_utc,TIMESTAMP '2025-01-01 14:00:00'))/3600 AS repair_hours
        FROM {m.table('operations')} o
        JOIN {m.table('calendar_day')} cal
          ON o.opened_at_utc>=cal.gaming_day_start_utc
         AND o.opened_at_utc<cal.gaming_day_end_utc
        LEFT JOIN {m.table('shift_roster')} r
          ON r.role='slot_tech' AND o.opened_at_utc>=r.start_utc AND o.opened_at_utc<r.end_utc
    """)
    ticket_agg = """COUNT(*) AS tickets, SUM(down_hours) AS down_hours,
        SUM(wait_hours) AS wait_hours, SUM(repair_hours) AS repair_hours,
        AVG(wait_hours) AS mean_wait_hours, MEDIAN(wait_hours) AS median_wait_hours,
        SUM(direct_cost_cents)/100.0 AS direct_cost"""
    shifts = m.sql(f"""SELECT shift,{ticket_agg} FROM q3_tickets
        WHERE event_type='fault_repair' GROUP BY shift ORDER BY shift""")
    staff = m.sql(f"""SELECT shift, SUM(planned_headcount) AS planned_head_shifts,
        SUM(actual_headcount) AS actual_head_shifts,
        COUNT(*) FILTER (WHERE actual_headcount<planned_headcount) AS short_shifts,
        COUNT(*) AS shifts FROM {m.table('shift_roster')}
        WHERE role='slot_tech' GROUP BY shift ORDER BY shift""")
    by_staff = m.sql(f"""SELECT shift,understaffed,{ticket_agg} FROM q3_tickets
        WHERE event_type='fault_repair' GROUP BY shift,understaffed ORDER BY shift,understaffed""")
    by_type = m.sql(f"SELECT event_type,{ticket_agg} FROM q3_tickets GROUP BY event_type ORDER BY event_type")
    # Exact interval overlap assigns a queue crossing a shift boundary to each
    # affected clock hour, rather than attributing its entirety to opening shift.
    waiting = m.sql("""WITH wait_spans AS (
        SELECT h.shift,h.manufacturer,h.period_month,
            epoch(LEAST(t.work_started_at_utc,h.hour_start_utc+INTERVAL 1 HOUR)
                 - GREATEST(t.opened_at_utc,h.hour_start_utc))/3600.0 AS wait_hours,
            h.primary_rate,h.rtp
        FROM q3_estimates h JOIN q3_tickets t
          ON h.machine_id=t.machine_id AND t.event_type='fault_repair'
         AND t.opened_at_utc<h.hour_start_utc+INTERVAL 1 HOUR
         AND t.work_started_at_utc>h.hour_start_utc
    ) SELECT shift,SUM(wait_hours) AS wait_hours,
        SUM(wait_hours*primary_rate) AS waiting_lost_coin_in,
        SUM(wait_hours*primary_rate*(1-rtp)) AS waiting_lost_theo
        FROM wait_spans GROUP BY shift ORDER BY shift""")
    # Ticket overlap must not inflate summed duration; observed meters are authoritative.
    validation = m.sql("""SELECT COUNT(*) AS tickets, COUNT(DISTINCT operation_id) AS distinct_tickets,
        SUM(down_hours) AS ticket_down_hours, SUM(wait_hours) AS waiting_hours,
        COUNT(*) FILTER (WHERE shift IS NULL) AS unmatched_roster
        FROM q3_tickets""").iloc[0].to_dict()
    return {"by_type": records(by_type), "faults_by_shift": records(shifts),
            "waiting_opportunity_by_clock_shift": records(waiting),
            "roster_by_shift": records(staff), "faults_by_staffing": records(by_staff),
            "validation": validation}


def run(output: Path | str = "outputs/q3_downtime.json") -> dict:
    build_hourly()
    summary = m.sql(f"SELECT {AGG} FROM q3_estimates").iloc[0].to_dict()
    summary["scheduled_hours"] = summary["available_hours"] + summary["down_hours"]
    summary["availability"] = summary["available_hours"] / summary["scheduled_hours"]
    summary["estimated_lost_coin_in"] = summary["lost_coin_in"]
    summary["estimated_lost_theo"] = summary["lost_theo"]
    summary["baseline_lost_coin_in"] = summary["baseline_lost_coin_in"]
    summary["peer_alternative_lost_coin_in"] = summary["peer_lost_coin_in"]
    summary["recapture_scenarios"] = [
        {"recapture_share": s, "incremental_coin_in": s*summary["lost_coin_in"],
         "incremental_theo": s*summary["lost_theo"]} for s in [0,0.25,0.5,1]
    ]
    grouped = {}
    for name, keys in {
        "daily_bank": "gaming_date,zone_id,bank_id",
        "by_shift": "shift", "by_month": "period_month",
        "by_manufacturer": "manufacturer", "by_machine": "machine_id",
        "by_hour": "local_hour", "by_rate_source": "rate_source",
    }.items():
        grouped[name] = records(m.sql(f"SELECT {keys},{AGG} FROM q3_estimates GROUP BY {keys} ORDER BY {keys}"))
    ops = operation_analysis()
    technician = m.sql(f"SELECT * FROM {m.table('action_catalog')} WHERE name ILIKE '%technician%'").iloc[0]
    benefit_days = max(0,30-int(technician.lead_days))
    summary["technician_comparison"] = {
        "lead_days":int(technician.lead_days),"benefit_days":benefit_days,
        "package_cost":float(technician.unit_cost_cents/100),
        "waiting_theo_by_shift":ops["waiting_opportunity_by_clock_shift"],
        "best_shift_july_perfect_recovery_ceiling":max(x["waiting_lost_theo"] for x in ops["waiting_opportunity_by_clock_shift"])*benefit_days/181,
        "assumption":"Scale six-month waiting exposure by benefit_days/181, eliminate every queued hour, recapture all missing play at property level. This optimistic scenario still does not pay for the package; actual effect may be zero.",
    }
    meter = m.sql(f"""SELECT SUM(scheduled_seconds-available_seconds)/3600.0 AS down_hours,
        SUM(scheduled_seconds)/3600.0 AS scheduled_hours
        FROM {m.table('machine_day')} WHERE active""").iloc[0].to_dict()
    validation = {
        "hourly_minus_daily_down_hours": summary["down_hours"]-meter["down_hours"],
        "hourly_minus_daily_scheduled_hours": summary["scheduled_hours"]-meter["scheduled_hours"],
        "tickets_minus_meter_down_hours": ops["validation"]["ticket_down_hours"]-meter["down_hours"],
    }
    result = {
        "question": "Q3", "period": {"start":"2025-01-01","end":"2025-06-30"},
        "summary": summary, **grouped, "operations": ops, "validation": validation,
        "method": "Retrospective missing play: down hours times ratio-of-sums fully-available-hour coin-in rate for the same machine/location/month/gaming weekday/local hour (>=2 full hours); fallback same machine/location/weekday/hour, then bank/month/hour. Bank/month/weekday/hour and constant floor rate are comparison scenarios.",
        "limitations": [
            "Missing play is a modeled gross opportunity, not observed lost revenue or causal recovery. Players may transfer to another available machine.",
            "Same-machine full-hour pools assume comparable demand; broken periods may have systematically different demand. Small pools and within-hour timing add error.",
            "Recapture 0-100% is an assumption sensitivity range, not a statistical confidence interval. Bank-peer and constant-rate estimates are model sensitivity checks.",
            "Staffing groups use the shift when a fault opened. Queue severity and demand confound associations; this does not prove adding a technician causes the observed difference.",
        ],
        "claims": [
            {"id":"Q3-hours", "title":"Downtime reconciles across three independent grains", "source":"machine_day; machine_hour; operations", "query":"src/q3_downtime.py: run / operation_analysis", "result":f"{summary['down_hours']:.2f} unavailable machine-hours; availability {summary['availability']:.4%}.", "alternative":"Summing ticket durations can double-count overlaps; here ticket, hourly and daily totals reconcile.", "limitation":"Duration alone does not measure demand during the outage."},
            {"id":"Q3-opportunity", "title":"Missing play depends on when machines are down", "source":"machine_hour + prepared_daily_view", "query":"src/q3_downtime.py: build_hourly", "result":f"Modeled gross missing coin-in ${summary['lost_coin_in']:,.0f}; uniform-rate baseline ${summary['baseline_lost_coin_in']:,.0f}; bank-peer alternative ${summary['peer_lost_coin_in']:,.0f}.", "alternative":"Guests may switch machines, so property-level recapture can be zero.", "limitation":"Retrospective rate assumption and sensitivity scenarios, not causal benefit."},
        ],
    }
    path = Path(output); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(run()["summary"], indent=2))
