# Methods and interpretation

The Gilded Ace is a fictional casino. Casino activity is synthetic challenge data, release `0.9.0-draft`, covering January 1–June 30, 2025. It must not be interpreted as evidence about a real casino or person.

## Reproduction

The analytical modules under `src/` generate the reports; `web/scripts/build_data.py` reconciles them to the organizer's pinned Parquet release and produces `web/public/data/dashboard.json`. `src/placement_model.py` separately trains and exports the Placement Lab report, including source hashes, feature definitions, validation results, library versions and a June 30 inventory. See the repository README for ordered reproduction commands. The browser reads static reports and predictions, without a live database or a generative-AI service. The official `data/manifest.json` records source file SHA-256 checksums and row counts. Dataset meanings are in the organizer's [data dictionary](https://github.com/tamu-datathon-org/dashboard-royale/blob/main/reference/DATA_DICTIONARY.md) and [dataset guide](https://github.com/tamu-datathon-org/dashboard-royale/blob/main/reference/DATASET.md).

## Comparison rules

- Machine comparisons use installed, active, on-floor machine-days. Pre-installation and post-retirement rows are excluded from exposure.
- Gaming dates run from 06:00 to 06:00 in America/Los_Angeles. Scheduled exposure uses the supplied calendar. March 8 has 23 hours.
- All ratios use sums: hold = total house win / total wagers; availability = total available hours / total scheduled hours; theo productivity = total theo / total available hours. An undefined denominator is not treated as zero performance.
- Coin-in means wagers, including recycled winnings; it is neither new deposits nor revenue. Payout means game returns. House win is coin-in minus payout. Player gaming net has the opposite sign.
- Theo is expected house win at the configured return-to-player rate for the actual observed wagers. It removes the realized payout outcome from the productivity comparison; it does not establish that demand or placement is intrinsically fair.
- A machine can change location and configuration. Daily comparisons use that day's placement. A location shown for a selected machine must be understood in the displayed date scope.
- Supplied machine and property costs are incomplete. Any resulting margin is contribution after supplied costs, not net profit. Comp economic cost is already inside POS cost of goods and is subtracted once.

## Payout uncertainty

The configured game mathematics supplies payout multiplier variance. For each machine-day, variance in dollars squared is `sum_bet_squared × payout_multiplier_variance / 10000`; `sum_bet_squared` is in cents squared. Across days, variances are added. The standardized house residual is `(house_win − theo) / sqrt(total_variance)`.

This is a model-based normal approximation conditional on observed bets and configured math, assuming independent spins. Very high volatility, rare jackpots, dependence or incorrect configurations can weaken calibration. An individual 95% interval is not a simultaneous guarantee across hundreds of machines. Screening thresholds and multiplicity handling must be stated beside any flags. A flag supports inspection; it is not proof of a defect, cheating or a recoverable loss.

The explorer's ±3σ colors are unadjusted, exploratory residuals for the chosen dates and machines; repeated filtering is not multiplicity-corrected. The separate fixed January–June investigation applies Bonferroni adjustment across 310 machines and flags only M-1158. A changing exploratory residual is not a new confirmed inspection signal.

## Earnings decomposition

The five components are exposure, game math, location, a descriptive machine component and the payout residual. Their unrounded sum equals the gap to a common full-floor average-machine comparator. Every target's peer floor/game rates and monthly zone factor exclude all of its observations, including when computing the game rates used to value zone peers. The common average-machine comparator itself includes the whole floor; it is distinct from these peer expectations. The explorer recalculates selected-period totals using full-release reference rates, so the index remains retrospective rather than an as-of-date forecast.

For the manager's ten, the revised component totals are −$128,590.11 exposure, −$209,724.19 game math, −$143,519.01 location, +$3,764.90 machine and −$63,356.91 payout residual. Their rounded sum is −$541,425.32, versus the independently rounded gap of −$541,425.30: a two-cent rounding difference. The positive combined machine component does not establish that all ten machines are healthy. Nine candidates spent time in Back Forty during the investigation; that is a historical membership count, not a count of current placements.

Machine-factor intervals resample each target's weeks while holding estimated peer benchmarks fixed. They omit benchmark-estimation uncertainty and do not provide simultaneous or causal coverage. The decomposition is an ordered accounting attribution; it does not identify how much a move or replacement would recover. Aggregate zone summaries use full-floor game rates and are separate descriptive comparisons.

## Location and downtime

The entrance–Back Forty walkway has a recorded closure from March 3 to April 7, 2025. Comparing Back Forty with the rest of the floor before, during and after closure tests a plausible location explanation. It is observational: zone composition, promotions, seasonality and counter failures may also change. A difference in trends is not a causal estimate without further assumptions.

Traffic sensors count crossings, not people. Offline or missing counters are not zeros. Coverage must accompany traffic comparisons, and zone-day traffic repeated on machine rows must be deduplicated before aggregation.

Downtime opportunity is a counterfactual estimate: unavailable hours multiplied by an explicitly stated comparable play or theo rate. It is not observed lost cash. It can overstate recoverable demand if players substitute to nearby machines or if downtime occurs in quiet hours. Repairs may have waiting and hands-on components; overlapping tickets must not be summed as independent machine downtime. Scheduled-minus-available meter time is the primary exposure measure.

## Guests and comps

Guest tables include only loyalty-card activity. They cannot describe untracked people or complete Las Vegas trips. Segment-month totals can be filtered at their recorded monthly grain; partial-month results must not be implied when daily guest data is absent.

Period-level concentration and ahead rates require aggregating each player's months first. A player appearing in several months is one person, not several. Top-share calculations state their ranking variable and denominator. Net player outcomes can have mixed signs; ranking concentration is more interpretable for nonnegative wagers or gross losses than signed net totals.

Comp face value is the menu value granted; economic comp cost is the supplied cost consumed. Reinvestment is economic cost / theo. Changes in this ratio can reflect policy, guest mix, redemption timing or changing theo. An observational change does not establish incremental loyalty-program return.

## Forecast validation

The original study chooses between constant and weekday means using January–February fits evaluated on March–April. It refits the selected weekday model on January–April and freezes all 61 May–June predictions. The constant baseline and weekday model are scored on the same dates: daily MAE $218,258.10 and $68,698.55, respectively. The nominal 90% interval, calibrated using chronological pretest errors, covers 85.25% of those test days. This supports the timing of discretionary maintenance; it does not estimate additional staffing needs or promotion return.

Holdout results are descriptive evaluation, not a promise for July. Future actuals, holdout-day lag updates and later-published tourism or survey files are not model inputs. A model that fails to beat the baseline remains a valid result; decisions should then avoid claiming forecasting improvement.

A separate retrospective extension compares expanding constant mean, expanding weekday mean, recent weekday mean and seasonal naive forecasts across thirteen seven-day origins, covering 91 April–June days. At every origin, tuning ends before three weeks of interval-calibration forecasts; models then refit using only prior observations. The adaptive selector's MAE is $63,045.45, versus $57,951.33 for the expanding weekday incumbent: 8.79% worse. We retain the simpler weekday approach. Its recalibrated nominal 90% band covers 93.41% of these rolling evaluation days. This extension does not replace the original frozen study; its horizon differs and May–June had already been examined during dashboard development.

## Placement Lab: prediction, support and feasibility

The target is expected house win per available machine-hour, not actual payout luck or profit. The candidates are a configuration-by-weekday mean baseline, regularized ridge regression and histogram gradient boosting. Features are game configuration, zone, manufacturer, calendar weekday and configuration–zone interaction. Metadata is frozen at each prediction origin. Future observed wagers, availability, occupied hours, traffic, repairs and post-origin placements do not enter the forecasts.

Three expanding-time validation folds choose histogram gradient boosting before final evaluation. The final evaluation fit ends April 15; April 16–30 residuals calibrate zone-specific daily-rate ranges, with a pooled fallback. May–June predictions freeze metadata at April 30: 77 observations after later moves retain the origin-known placement. On this retrospective evaluation, available-hour-weighted MAE is $3.6907/h versus $4.2858/h for the baseline, a 13.884% reduction. Nominal 90% machine-day coverage is 88.55%. The comparison uses the same 18,739 dated test rows for known machines; 49 rows for machines unknown at the origin are excluded and reported. A separate held-out-machine check excludes 51 machines from both model selection and fitting and has weighted MAE $3.6012/h. These checks assess predictive associations; none validates an intervention effect.

July scenarios refit the selected specification through June 30. A configuration–zone combination requires at least three distinct training machines and 120 machine-days; unsupported estimates are withheld. The floor inventory contains 314 slots, 308 occupied and six vacant as of June 30. An occupied destination requires both directions of a two-machine swap to have supported comparisons. The model distinguishes zones, not slots within the same zone. Dated occupancy is only one feasibility check; physical compatibility and operational scheduling still require review.

Only four historical moves, three across zones, exist. Predictive differences may reflect guest preferences, game allocation or access rather than the result of moving a particular machine. Historical residual widths reused around July points are sensitivity inputs, not calibrated July-mean intervals or confidence intervals for relocation gains. Repeated machine-days and shared daily shocks also limit nominal coverage claims.

## Action scenarios

The planning horizon is July 1–30, 2025. Maximum spend is $100,000 and at most three paid action types may be selected. Quantity caps and incompatibilities come directly from `action_catalog`. Retaining cash consumes no action slot.

Cost per unit is `(unit_cost_cents + recurring_cost_cents_per_day × max(0, 30 − lead_days)) / 100`. Fixed packages are paid in full. Benefits begin after lead time and account for intervention downtime. Manufacturer maintenance takes 90 minutes per affected machine, not per manufacturer. Comp-pilot implementation cost excludes any additional comp allowance, which must be budgeted separately.

The catalog prices interventions; it does not estimate effects. Scenario recovery fractions are assumptions and must be visibly adjustable or stated. Show gross theoretical recovery, intervention cost and net scenario effect separately. Inspection primarily purchases information and should not be assigned guaranteed recovery. A comp pilot requires a control group and should measure economic contribution, comp expense and guest safeguards, without targeting people because they lost heavily.

Placement Lab prices each moved machine at $1,800, with two lead days and three hours of move downtime. July 3–30 supplies 28 benefit days. Both sides of a swap are priced and included in the combined expected-win difference. The calculation assumes scheduled availability except the catalog interruption; it reduces a positive combined demand difference by the chosen displacement fraction, retains negative differences in full, then subtracts proposed-location foregone win during interruption and move costs. The displayed range propagates rate endpoints and the zero-change boundary under those assumptions; it is not a calibrated confidence interval for the move. Keeping the current placement has zero assumed gain and cost. The retained inspection/wayfinding plan consumes budget and two action types, without adding an assumed benefit. Exporting a placement scenario does not execute it or alter Action Studio's plan.

The recommended $8,700 plan remains an information-gathering inspection and a wayfinding test. At June rates and no additional operating costs, signage's 0.72-point occupancy break-even requires zero displacement; 50% displacement raises it to 1.44 points. A prospective comparison must track uncertainty and whole-floor outcomes, not just a gain at the destination. No model prediction guarantees payback.

## Submission disclosure and visual interpretation

See the [combined Codex + Claude AI-use disclosure](AI_DISCLOSURE.md), the canonical disclosure for this entry. Historical asset provenance is included there.

The native 4.8-second card opening and particle ace are decorative; animations do not change analytical values. The earnings waterfall discloses its two-cent source-rounding difference. Filtered explorer views are distinct from fixed January–June investigations.

## Explicit Q1 and Q3 answers

The adjusted-factor list orders candidates by theoretical win divided by the exposure-, game- and location-adjusted benchmark, among rows whose conditional upper interval is below one. M-1184, M-1532 and M-1154 are first, second and third. M-1244 is ninth, not fourth. All four are outside the GM’s raw bottom ten, but four other GM candidates also have below-one conditional intervals. A positive combined machine component does not clear every machine. Sparse cells (including sole Classic Sevens machine M-1532 in High-Limit) and new Aurora Link titles confined to Center Pit limit separation of game and location effects.

The shift table uses `reports.q3.by_shift`, aggregating actual unavailable local clock hours, not the shift when a fault ticket opened. Day is 06:00–14:00, swing 14:00–22:00, graveyard 22:00–06:00. Unavailable fraction is down hours / (available + down hours), preserving DST exposure. Swing has the largest estimated missed theo; graveyard has the most down hours. The panel remains fixed to the full January–June floor when filters change.

The LVCVA comparison is the organizer-bundled revised series’ January-to-June change in visitors per calendar day. It is compared with clearly labeled casino rates, not treated as a causal explanation, year-over-year decline, or forecast feature.

## Forecast and funded execution

The existing $1,200 inspection remains on Wednesday, July 2, following its one-day catalog lead. The frozen weekday model predicts about $1.150m of floor wagers for Wednesday versus $1.821m Saturday. Wednesday is its second-lowest weekday; waiting until the lowest weekday, Tuesday July 8, would delay diagnosis and shorten the horizon. This is a scheduling rationale, not measured intervention savings. Wayfinding still begins July 11, and all costs, benefit days and sensitivity calculations are unchanged.

### July reference and alert rules

`reports.forecast.july_monitoring` exports every date from July 1–30, with predicted whole-floor wagers, lower/upper thresholds and null actuals. It extends the original model frozen on April 30 without fitting on May–June or July. The original March–April absolute-error radius is $110,036.98125; dated dollar thresholds are rounded to cents. The original historical evaluation is preserved. This plan was prepared retrospectively against the synthetic calendar; it is not a claim of historical preregistration, a new holdout, or observed July accuracy.

A completed gaming-day total strictly below its lower threshold or above its upper threshold triggers a **watch**. Two consecutive completed gaming dates breaching the same side trigger **review**. Equality is within the band. A within-band, missing or invalid observation resets the streak; the opposite direction restarts it at one. Missing is never interpreted as zero. Gaming dates run 06:00–06:00 in America/Los_Angeles. Reconcile meter completeness and availability first, then examine events, outages, guest mix and displaced play before altering the plan.

The two-day rule is an operational choice, without a validated false-alarm rate. Correlated residuals, repeated checks, drift, July 4 and other unmodeled events limit its interpretation. Forecast deviations do not prove a defect or signage effect; the matched-zone pilot and whole-floor outcomes remain necessary. The Model lab contains a 30-day export and an illustrative input checker. Checker entries are local to that view, do not alter source data and are not submitted observations. The Python `evaluate_july_alerts` helper accepts supplied complete-day totals for reproducible evaluation.

### Loading and opening behavior

The 4.8-second native opening retains its animation and manual replay. Completion, skipping or leaving an active opening is remembered in the current tab's session storage; returning within that session enters the dashboard directly. Reduced-motion preferences remain authoritative. Storage-denied environments fall back to in-memory state for that document.

Secondary analytical sections load as separate JavaScript chunks. React and chart libraries have reusable vendor chunks; the hero and native opening remain immediately available. The offline edition separately bundles the same sources into one script with embedded data and fonts, so secondary routes still work without a network. This packaging difference does not change analytical values or visual design.
