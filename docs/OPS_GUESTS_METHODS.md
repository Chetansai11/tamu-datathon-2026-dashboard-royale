# Q3-Q5 methods and interpretation

Reproduce with the shared Python environment, from the repository root:

```powershell
python -m src.q3_downtime
python -m src.q4_q5_players
python -m pytest tests/test_ops_guests.py
```

The modules use `src/metrics.py` to locate the main checkout's Parquet data or `DR_DATA`. They write `outputs/q3_downtime.json`, `q4_guests.json`, and `q5_comps.json`; the dashboard exporter embeds these locally. All results describe the fictional Gilded Ace. Data release remains the supplied draft until the organizer changes it.

## Q3: availability and missing play

`machine_hour` contains one record per actual UTC hour while installed. Sum `(3600 - available_seconds) / 3600` and reconcile to the daily meters' `scheduled_seconds - available_seconds`. March 8's 23-hour gaming day is represented by its actual hours, not a forced 24-hour assumption. Hourly records join dated prepared rows so moved machines have the correct location and configuration.

For each unavailable hour, estimate gross missing coin-in with the ratio-of-sums rate in fully available hours for the same machine, month, gaming weekday and local clock hour. Require at least two such full hours. Fall back to the same machine/weekday/hour across the six months, then bank/month/hour if necessary. Multiply missing coin-in by that day's configured house edge for missing theo. This is a retrospective counterfactual, not a forecasting feature set. Compare with bank/month/weekday/hour peers and a uniform floor-wide coin-in per available hour baseline. Report 0%, 25%, 50% and 100% recapture scenarios; these are assumption sensitivities, not confidence intervals. Guests may move to another machine, leaving no lost property-level play to recover.

Tickets are clipped to the observation horizon; UTC intervals avoid DST ambiguity. Each fault is matched to the roster shift in which it opened. Ticket waits and repairs are separated. Staffing associations are descriptive: queue load, repair severity and demand remain confounders. For the staffing decision, separately intersect each waiting interval with clock-hour intervals to assign waiting opportunity to the shift during which it was actually experienced. Compare an optimistic full-wait-elimination/full-recapture scenario with the catalog technician package, scaling only by the 30-day horizon less its lead days. Do not confuse all downtime with technician-addressable waiting.

## Q4: tracked outcomes and concentration

For every contiguous complete-month interval (21 windows), aggregate `player_period` to one row per player first. Then calculate player net (`payout - coin-in`), ahead status, and concentration. The ahead denominator is cards with positive tracked wagers; cards with only F&B/loyalty activity remain in the broader `players` count. Top 1%, 5% and 10% shares use `ceil(fraction * population)` people. Wager concentration ranks active players. Loss concentration ranks losing players and divides by gross positive losses among those players, not net house win. Opposite-sign winnings are disclosed separately.

Filters use stable opening tier, region and age. A missing age is “Unknown.” Dimensions are independent views and must not be added together. Full-window unique counts must not be computed by summing monthly counts. Tracked coin-in and payout are checked against carded machine meters. Contribution subtracts linked POS cogs once; comp cost is already contained there. All results are carded only, and coin-in includes replayed winnings. No individual targeting or diagnosis follows from concentration.

## Q5: comps and a competing explanation

Economic cost comes from actual redemption, not menu face value, and reconciles among `player_period`, `property_day`, the redemption ledger and linked POS receipts. Link redemptions to their unique POS receipt; never join raw session and POS facts then sum.

The redemption ledger's UTC timestamp converts to America/Los_Angeles, subtracts six clock hours and takes the gaming date. Match the same benefit and pre-redemption tier before and after May 1. Every fixed benefit/tier cell has one point price within each phase, with lower prices after May and identical economic item costs. This rules out tier mix and benefit mix as explanations for the schedule change. Earned points per wager dollar are essentially unchanged. Aggregate cost/theo can still vary because of mix, accumulated balances and redemption timing; it does not identify a causal policy effect.

A post-period cost benchmark applies Jan-Apr's ratio-of-sums cost/tracked theo to May-Jun tracked theo. The difference is hypothetical excess relative to that benchmark, not proven savings. A control-group pilot would be a learning expenditure, with lead time, additional comp cost, preserved earned benefits, customer-protection measures and uncertainty budgeted explicitly.
