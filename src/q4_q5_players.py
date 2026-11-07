"""Tracked player windows and comp accounting. Run python -m src.q4_q5_players.

All player statistics are carded only. Window net and concentration aggregate
each player across months before determining who is ahead or ranking amounts.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from src import metrics as m


MEASURES = {
    "tracked_coin_in_usd":"coin_in", "tracked_payout_usd":"payout",
    "tracked_net_usd":"net", "theo_usd":"theo", "comp_cost_usd":"comp_cost",
    "comp_face_value_usd":"comp_face_value", "tracked_contribution_usd":"contribution",
    "linked_pos_cash_usd":"pos_cash", "linked_pos_cogs_usd":"pos_cogs",
    "points_earned":"points_earned", "points_redeemed":"points_redeemed",
    "comps_redeemed":"comps_redeemed", "observed_visits":"visits",
}
GROUPS = ["home_region","age_band","opening_tier"]


def records(frame: pd.DataFrame) -> list[dict]:
    return json.loads(frame.to_json(orient="records", date_format="iso"))


def concentration(values: pd.Series, population: int, fraction: float) -> dict:
    """Top ceil(fraction * population) share of a nonnegative measure."""
    n = min(len(values), max(1, math.ceil(population*fraction))) if population else 0
    total = float(values.sum())
    return {"count":n, "share":float(values.nlargest(n).sum())/total if total else None,
            "denominator_usd":total}


def summarize_players(players: pd.DataFrame) -> dict:
    sums = {short:float(players[col].sum()) for col,short in MEASURES.items()}
    active = players[players.tracked_coin_in_usd>0]
    losses = (-active.tracked_net_usd).clip(lower=0)
    positive_losses = losses[losses>0]
    ahead = int((active.tracked_net_usd>0).sum())
    sums.update({
        "players":int(len(players)), "active_players":int(len(active)),
        "ahead_players":ahead, "ahead_share":ahead/len(active) if len(active) else None,
        "losing_players":int((active.tracked_net_usd<0).sum()),
        "breakeven_players":int((active.tracked_net_usd==0).sum()),
        "comp_reinvestment":sums["comp_cost"]/sums["theo"] if sums["theo"] else None,
        "observed_hold":-sums["net"]/sums["coin_in"] if sums["coin_in"] else None,
        "median_player_net":float(active.tracked_net_usd.median()) if len(active) else None,
        "gross_player_losses":float(losses.sum()),
        "gross_player_winnings":float(active.tracked_net_usd.clip(lower=0).sum()),
    })
    for fraction,label in [(0.01,"top1"),(0.05,"top5"),(0.10,"top10")]:
        ci = concentration(active.tracked_coin_in_usd,len(active),fraction)
        lo = concentration(positive_losses,len(positive_losses),fraction)
        sums[f"{label}_coin_share"] = ci["share"]
        sums[f"{label}_coin_players"] = ci["count"]
        sums[f"{label}_loss_share"] = lo["share"]
        sums[f"{label}_loss_players"] = lo["count"]
    return sums


def guest_windows() -> dict:
    frame = m.sql(f"SELECT * FROM {m.table('player_period')}")
    for col in GROUPS:
        frame[col] = frame[col].fillna("Unknown")
    months = sorted(frame.period_month.unique())
    windows = []
    for first,start in enumerate(months):
        for end in months[first:]:
            sub = frame[(frame.period_month>=start)&(frame.period_month<=end)]
            aggs = {c:"sum" for c in MEASURES}
            aggs.update({c:"first" for c in GROUPS})
            people = sub.groupby("player_id",sort=False,observed=True).agg(aggs)
            sets = [("all",people)]
            for col in GROUPS:
                sets.extend((f"{col}:{name}",chunk) for name,chunk in people.groupby(col,sort=True,observed=True))
            for key,chunk in sets:
                windows.append({"start_month":start,"end_month":end,"group_key":key,
                                **summarize_players(chunk)})
    summary = next(x for x in windows if x["group_key"]=="all" and x["start_month"]==months[0] and x["end_month"]==months[-1])
    meter = m.sql(f"""SELECT SUM(carded_coin_in_cents)/100.0 AS coin_in,
        SUM(carded_payout_cents)/100.0 AS payout, SUM(coin_in_cents)/100.0 AS all_coin_in
        FROM {m.table('machine_day')} WHERE active""").iloc[0].to_dict()
    # Repeated rows carry stable starting demographics. End tiers deliberately
    # excluded from windows to avoid labeling past play by a future attained tier.
    stable = m.sql(f"""SELECT COUNT(*) AS unstable FROM (
        SELECT player_id FROM {m.table('player_period')} GROUP BY player_id
        HAVING COUNT(DISTINCT home_region)>1 OR COUNT(DISTINCT age_band)>1
            OR COUNT(DISTINCT opening_tier)>1)""").iloc[0,0]
    summary["carded_share_of_all_coin_in"] = summary["coin_in"]/meter["all_coin_in"]
    result = {
        "question":"Q4", "summary":summary, "windows":windows,
        "groups":[{"group_key":"all","label":"All tracked guests"}] + [
            {"group_key":f"{col}:{value}","label":f"{col.replace('_',' ')}: {value}"}
            for col in GROUPS for value in sorted(frame[col].unique())],
        "monthly":[x for x in windows if x["group_key"]=="all" and x["start_month"]==x["end_month"]],
        "validation":{
            "player_minus_carded_meter_coin_in":summary["coin_in"]-meter["coin_in"],
            "player_minus_carded_meter_payout":summary["payout"]-meter["payout"],
            "contribution_accounting_residual":summary["contribution"]-(-summary["net"]+summary["pos_cash"]-summary["pos_cogs"]),
            "unstable_demographic_players":int(stable), "month_windows":21,
        },
        "method":"For each of 21 contiguous month windows, sum each player's monthly records first. Compute net, ahead status and concentration on these window totals. Group by stable opening tier, region or age; groups are separate overlapping views, never added across dimensions.",
        "limitations":[
            "Loyalty-card activity only, not all guests or a person's full gambling history. A tracked guest may also play uncarded.",
            "Ahead rate denominator is players with positive tracked coin-in in the selected window; players includes cards with only non-gaming activity.",
            "Top coin shares rank active players by total coin-in. Top loss shares rank losing players by positive net gaming loss; denominator is gross losses among losing players, not net property win.",
            "Coin-in includes replayed winnings and is not cash deposited. Concentration is a financial exposure measure, not a basis for targeting losses or diagnosing gambling harm.",
        ],
        "claims":[
            {"id":"Q4-outcomes","title":"Tracked outcomes reconcile to carded meters", "source":"player_period; machine_day carded_*", "query":"src/q4_q5_players.py: guest_windows", "result":f"Tracked wagers ${summary['coin_in']:,.2f}; payouts ${summary['payout']:,.2f}; player net ${summary['net']:,.2f}. {summary['ahead_share']:.2%} of {summary['active_players']:,} active tracked players ahead.", "alternative":"All-player meters differ because uncarded play is outside the player tables.", "limitation":"Carded-only results and complete-month filters."},
            {"id":"Q4-concentration","title":"Aggregate people before measuring concentration", "source":"player_period", "query":"src/q4_q5_players.py: summarize_players", "result":f"Top 1% of active tracked players account for {summary['top1_coin_share']:.2%} of tracked coin-in; top 10% account for {summary['top10_coin_share']:.2%}.", "alternative":"Monthly top-player shares double-count repeat players and can rank a different population.", "limitation":"Descriptive concentration only; never target high-loss guests with incentives."},
        ],
    }
    return result


def comps_report(guests: dict) -> dict:
    # Direct ledger/POS join is one redemption to its unique receipt, not a join
    # of sessions to transactions. Aggregate facts before comparing totals.
    c=m.con()
    c.execute(f"""CREATE OR REPLACE TEMP VIEW q5_redemptions AS
        SELECT *, CAST((event_at_utc AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            - INTERVAL 6 HOURS AS DATE) AS gaming_date
        FROM {m.table('loyalty_ledger')} WHERE event_type='redeem'""")
    monthly = m.sql(f"""SELECT period_month,
        SUM(comp_cost_usd) AS comp_cost, SUM(comp_face_value_usd) AS face_value,
        SUM(comps_redeemed) AS redemptions, SUM(theo_usd) AS tracked_theo,
        SUM(tracked_coin_in_usd) AS tracked_coin_in, SUM(points_earned) AS points_earned,
        SUM(points_redeemed) AS points_redeemed,
        SUM(comp_cost_usd)/SUM(theo_usd) AS comp_reinvestment,
        SUM(points_earned)/SUM(tracked_coin_in_usd) AS points_per_coin_dollar,
        SUM(comp_cost_usd)/SUM(points_redeemed) AS cost_per_redeemed_point,
        SUM(points_redeemed)/SUM(comps_redeemed) AS points_per_redemption
        FROM {m.table('player_period')} GROUP BY period_month ORDER BY period_month""")
    schedule = m.sql("""SELECT strftime(gaming_date,'%Y-%m') AS period_month,
        benefit_id,tier_before,COUNT(*) AS redemptions,
        MIN(-points_delta) AS min_points,MAX(-points_delta) AS max_points,
        AVG(-points_delta) AS points_per_redemption,
        AVG(economic_cost_cents)/100.0 AS cost_per_redemption,
        MIN(gaming_date) AS first_gaming_date,MAX(gaming_date) AS last_gaming_date
        FROM q5_redemptions GROUP BY period_month,benefit_id,tier_before
        ORDER BY benefit_id,tier_before,period_month""")
    # Match a fixed item and tier before/after: changes cannot be explained by
    # product prices, benefit mix, or guests shifting into higher tiers.
    paired = m.sql("""WITH phase AS (
        SELECT benefit_id,tier_before,
            CASE WHEN gaming_date<'2025-05-01' THEN 'before' ELSE 'after' END AS phase,
            COUNT(*) AS n,MIN(-points_delta) AS min_points,MAX(-points_delta) AS max_points,
            AVG(-points_delta) AS points,AVG(economic_cost_cents)/100.0 AS cost
        FROM q5_redemptions GROUP BY benefit_id,tier_before,phase
    ) SELECT a.benefit_id,a.tier_before,a.n AS before_n,b.n AS after_n,
        a.points AS before_points,b.points AS after_points,
        b.points/a.points-1 AS point_price_change,
        a.cost AS before_cost,b.cost AS after_cost,
        a.min_points=a.max_points AND b.min_points=b.max_points AS constant_within_phase
        FROM phase a JOIN phase b USING(benefit_id,tier_before)
        WHERE a.phase='before' AND b.phase='after' ORDER BY a.benefit_id,a.tier_before""")
    before=monthly[monthly.period_month<'2025-05']; after=monthly[monthly.period_month>='2025-05']
    def phase_summary(x,days):
        return {"days":days,"comp_cost":float(x.comp_cost.sum()),
                "cost_per_day":float(x.comp_cost.sum()/days),
                "tracked_theo":float(x.tracked_theo.sum()),
                "comp_reinvestment":float(x.comp_cost.sum()/x.tracked_theo.sum()),
                "points_per_coin_dollar":float(x.points_earned.sum()/x.tracked_coin_in.sum()),
                "points_per_redemption":float(x.points_redeemed.sum()/x.redemptions.sum()),
                "redemptions":int(x.redemptions.sum()),
                "cost_per_redeemed_point":float(x.comp_cost.sum()/x.points_redeemed.sum())}
    pre,post=phase_summary(before,120),phase_summary(after,61)
    compare=m.sql(f"""SELECT
        (SELECT SUM(economic_cost_cents)/100.0 FROM q5_redemptions) AS ledger_cost,
        (SELECT SUM(comp_cost_usd) FROM {m.table('property_day')}) AS property_cost,
        (SELECT SUM(comp_cost_usd) FROM {m.table('player_period')}) AS player_cost,
        (SELECT SUM(cogs_cents)/100.0 FROM {m.table('fnb_transactions')} WHERE comp_id IS NOT NULL) AS pos_comp_cogs,
        (SELECT COUNT(*) FROM q5_redemptions r LEFT JOIN {m.table('fnb_transactions')} f
         ON r.redeemed_pos_id=f.transaction_id
         WHERE f.transaction_id IS NULL OR r.economic_cost_cents<>f.cogs_cents) AS bad_redemption_links
    """).iloc[0].to_dict()
    summary={
        "comp_cost":float(monthly.comp_cost.sum()),"comp_face_value":float(monthly.face_value.sum()),
        "redemptions":int(monthly.redemptions.sum()),
        "comp_reinvestment":float(monthly.comp_cost.sum()/monthly.tracked_theo.sum()),
        "before_may":pre,"may_june":post,
        "reinvestment_relative_change":post["comp_reinvestment"]/pre["comp_reinvestment"]-1,
        "matched_benefit_tier_cells":int(len(paired)),
        "point_price_change_min":float(paired.point_price_change.min()),
        "point_price_change_max":float(paired.point_price_change.max()),
        "benefit_cost_max_change":float((paired.after_cost-paired.before_cost).abs().max()),
        "post_cost_at_pre_reinvestment":float(post["tracked_theo"]*pre["comp_reinvestment"]),
        "post_cost_above_pre_reinvestment":float(post["comp_cost"]-post["tracked_theo"]*pre["comp_reinvestment"]),
    }
    summary["hypothetical_july_30d_excess_at_post_rate"]=summary["post_cost_above_pre_reinvestment"]*30/61
    result={
        "question":"Q5","summary":summary,"monthly":records(monthly),
        "benefit_tier_schedule":records(schedule),"matched_schedule_changes":records(paired),
        "validation":compare,
        "method":"Sum actual redeemed economic cost. Compare identical benefit x tier point prices Jan-Apr versus May-Jun. Ratio-of-sums cost/tracked theo uses carded exposure. Points earned per wager dollar tests whether earning rather than redemption changed.",
        "limitations":[
            "Economic comp cost is already included in POS cogs. Do not subtract it again from contribution; face value is not cash revenue.",
            "Observed point prices change in May; this establishes an accounting rule change, not a causal effect on guest demand or redemption frequency.",
            "Cost/theo before-after changes can reflect guest mix, accumulated point balances and timing. The hypothetical excess is a benchmark, not recoverable savings.",
            "A new pilot must preserve earned benefits, randomly assign eligible volunteers, avoid targeting heavy losers, and budget additional comps explicitly.",
        ],
        "claims":[
            {"id":"Q5-cost","title":"Count comp economic cost once", "source":"player_period; property_day; loyalty_ledger; fnb_transactions", "query":"src/q4_q5_players.py: comps_report", "result":f"${summary['comp_cost']:,.2f} economic cost across {summary['redemptions']:,} redemptions; face value ${summary['comp_face_value']:,.2f}; cost/theo {summary['comp_reinvestment']:.3%}.", "alternative":"Menu face value overstates economic cost and adding comps to POS cogs double-counts expense.", "limitation":"Supplied costs are partial; no claim of net profit."},
            {"id":"Q5-schedule","title":"May changed redemption prices, not earning rate", "source":"loyalty_ledger grouped by benefit_id and tier_before; player_period", "query":"src/q4_q5_players.py: matched_schedule_changes", "result":f"All {len(paired)} matched benefit/tier cells show point prices falling {abs(summary['point_price_change_max']):.1%} to {abs(summary['point_price_change_min']):.1%}; item economic costs unchanged. Cost/tracked theo {pre['comp_reinvestment']:.3%} Jan-Apr versus {post['comp_reinvestment']:.3%} May-Jun.", "alternative":"Tier and benefit mix cannot explain a change within every fixed benefit/tier cell; timing and balances can still explain aggregate redemption behavior.", "limitation":"No control group establishes demand uplift or causal savings."},
        ],
    }
    return result


def run(output_dir: Path | str="outputs") -> tuple[dict,dict]:
    output=Path(output_dir);output.mkdir(parents=True,exist_ok=True)
    guests=guest_windows(); comps=comps_report(guests)
    for name,result in [("q4_guests",guests),("q5_comps",comps)]:
        (output/f"{name}.json").write_text(json.dumps(result,indent=2,allow_nan=False),encoding="utf-8")
    return guests,comps


if __name__=="__main__":
    a,b=run()
    print(json.dumps({"guests":a["summary"],"comps":b["summary"]},indent=2))
