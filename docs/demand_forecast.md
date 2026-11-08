# Demand and forecasting evidence

Reproduce from the challenge checkout, using the shared Python environment:

```powershell
& 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe' -m src.q2_demand
& 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe' -m src.forecast
& 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe' -m pytest tests/test_demand_forecast.py -q
```

The scripts read `DR_DATA`, checkout-local data, or the main checkout fallback provided by `src/metrics.py`. They write `outputs/q2_demand.json` and `outputs/forecast.json`. Outputs are regenerated, not manually edited. Their `evidence` lists contain stable claim IDs, source/query pointers, measured results, competing explanations and limitations for the public appendix.

## Q2: demand

Monthly wager throughput is divided by gaming days and summed available machine-hours. Availability and occupancy use ratios of sums. March has one 23-hour gaming day. Traffic timestamps are shifted by six local hours to assign the gaming date; observed crossings are divided by covered sensor-hours. Offline sensors remain missing, not zero, and coverage is shown. This adjustment does not prove offline hours are representative. Crossings are not unique guests; wagers include recycled winnings.

Each event's observed coin-in is compared with same-month, same-weekday non-event means. The second comparison scales the calendar-matched hourly rate by actual event-day available hours. Small samples, weather and other property changes confound these associations; they are not incremental promotion ROI.

The location contrast uses the supplied walkway's March 3-April 7 interval, not outcome-selected dates. The Back Forty/other-zones coin-in-per-available-hour ratio is compared before (January 1-March 2), during (March 3-April 6), and after reopening (April 7-June 30). A paired moving seven-day bootstrap resamples dates jointly across affected and comparison zones within periods, with 1,500 draws and seed 2025. The descriptive 95% interval does not remove bias from nonparallel trends, guest/game mix, movement or displaced play. A relative decline during closure is evidence consistent with access pressure, not an experimental estimate of moving a machine.

As a preclosure placebo check, the same relative rate changes only **-0.10%** from January to February, compared with **-30.77%** during closure versus before and **-3.82%** after reopening versus before. One stable preperiod does not establish parallel trends. Floor-wide January-to-June daily coin-in changes **-1.49%**, while coin-in per available hour changes **-4.15%**; active capacity grows from **300 to 308 machines**. This distinction prevents extra capacity from masking softer demand per machine-hour.

External data is retrospective context only. The [LVCVA publisher page](https://www.lvcva.com/research/reports/post/lvcva-executive-summary-of-southern-nevada-tourism-indicators/) was verified live. Numeric derived comparisons use the bundled source-provenanced 2026-08-20 workbook revision; direct workbook retrieval was unavailable in the browsing tool. NOAA values use bundled daily summaries for station USW00023169, with maximum-temperature quality flags excluded when present. Calendar weather dates do not align exactly with gaming dates. `reference/SOURCES.md` states that LVCVA/Missouri table redistribution is uncleared, so the report contains derived observations and links rather than copies of those tables. None of these later-published data enter the forecast.

## Forecast: a frozen calendar decision

1. Candidate forms are a constant arithmetic mean and seven weekday arithmetic means. There is no feature search or event tuning.
2. Fit January-February (59 days); compare March-April MAE (61 days). Choose the form with lower MAE using only this training-period split.
3. Refit the chosen form on January-April (120 days), then freeze all May-June predictions. A separate constant training-mean baseline is also frozen.
4. Evaluate on the same 61 May-June days. Report MAE in dollars, bias, and a paired moving seven-day bootstrap 95% interval for the MAE difference (2,000 draws, seed 2025). This interval is descriptive test uncertainty and does not guide model selection.
5. Set an empirical 90% prediction-band radius from the higher 90th percentile of absolute March-April errors before looking at May-June. Refit mean forecasts, retain the frozen radius, and report actual holdout coverage. This is not a distribution-free or guaranteed conformal interval because errors can be dependent and the mean fit changes.

The measured test MAE is **$68,698.55** for weekday means versus **$218,258.10** for a constant mean, a **68.52% reduction**. Mean prediction bias is **+$39,285.62**. The approximate 90% band is **±$110,036.98**, but test coverage is **85.25%**; the interval misses more often than its nominal target. The 95% block interval for MAE improvement is **$132,519.69-$175,986.34** per day. These results describe this synthetic holdout, not expected performance at real casinos.

The operational decision is to place discretionary maintenance on Tuesday rather than Saturday while preserving peak-day technician coverage: training means are **$1,112,942** and **$1,820,595** daily coin-in, respectively. The model cannot estimate required headcount or a causal staffing benefit, and event-specific demand may override the normal pattern. It is not used to target heavy losers or encourage additional gambling.

## Separate retrospective rolling validation

The original frozen benchmark, decision and summary remain unchanged. `forecast.json` now also exposes `frozen_monthly` diagnostics and `retrospective_validation`. This extension was developed after May–June had already been examined, so it is **retrospective**, not a new untouched holdout. Its seven-day horizon and April–June evaluation period differ from the original 61-day forecast; compare models within the new table rather than interpreting a cross-table MAE change as an improvement.

Thirteen weekly origins from April 1 through June 24 each predict the following seven days, covering 91 unique dates through June 30. All candidates use the same origins, horizon and observed targets:

- Expanding constant mean.
- Expanding weekday mean, retaining the simple incumbent approach.
- Weekday means from the preceding 28 days.
- Seasonal naïve: the last observed value for each weekday, frozen across the whole horizon.
- A past-only selection policy that chooses among those four candidates using two earlier seven-day validation blocks.

At each origin, model selection ends before a separate 21-day calibration window. Each candidate's calibration errors come from three seven-day forecasts within that window, each fitted only on dates before its own origin. The 20th ordered absolute error among those 21 observations supplies the empirical interval radius. Candidates are then refitted through the day before the evaluation origin, and the entire seven-day forecast is frozen. No future daily meter value is used to refresh a lag within that block. Model choice cannot use calibration or evaluation outcomes.

For example, the April 1 origin selects on February 25–March 10, calibrates on March 11–31, then predicts April 1–7. Its first tuning fit ends February 24. The same relative temporal boundaries move forward seven days for each subsequent origin. Intervals are empirical: serial dependence, few calibration observations, changing demand and refitting mean nominal 90% coverage is not guaranteed.

Measured on the same 91 dates:

| Model | Daily MAE | Mean bias | 90% band coverage | Mean band width |
| --- | ---: | ---: | ---: | ---: |
| Expanding constant mean | $213,104.85 | +$22,711.28 | 92.31% | $798,370.98 |
| Expanding weekday mean | **$57,951.33** | +$20,539.70 | 93.41% | $317,713.59 |
| Recent 28-day weekday mean | $58,786.82 | +$17,968.52 | 93.41% | $340,825.76 |
| Last observed weekday | $71,157.81 | +$5,437.03 | 90.11% | $478,204.90 |
| Past-only rolling selection | $63,045.45 | +$18,224.24 | 91.21% | $327,861.22 |

The adaptive policy chose expanding weekday means nine times, recent weekday means three times, and seasonal naïve once. Its MAE is **8.79% higher** than the expanding weekday incumbent; the added selection complexity did not earn promotion. Preserve the weekday approach for maintenance timing. Lower bias alone does not make seasonal naïve better: its absolute errors and intervals are larger. Neither this comparison nor a forecasted demand difference establishes causal staffing or relocation uplift.

The frozen benchmark's May and June diagnostics are respectively MAE $61,360.66 / $76,281.04, bias +$19,869.11 / +$59,349.35, and coverage 80.65% / 90.00%. These describe changing errors and motivate monitoring; they do not prove a specific cause of drift.

`retrospective_validation` contains `models`, `incumbent`, `folds`, `daily`, `monthly`, `summary`, the exact interval method and limitations. `monthly` describes the adaptive selection policy; `incumbent` is the expanding weekday row. Every fold records tuning/calibration boundaries, selected model, candidate errors and interval radii for audit. Tests mutate all future outcomes and separately mutate calibration outcomes, verifying that future values cannot affect any earlier forecast/band and calibration cannot select the candidate. They also verify matching horizons, complete nonoverlapping evaluation dates, fixed seasonal lags, and monthly reconciliation.
