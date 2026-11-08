# Methods and interpretation

The Gilded Ace is a fictional casino. Casino activity is synthetic challenge data, release `0.9.0-draft`, covering January 1–June 30, 2025. It must not be interpreted as evidence about a real casino or person.

## Reproduction

The transformation is `scripts/build_data.py`. Its input is the organizer's Parquet release; its output is `public/data/dashboard.json`. The interactive app reads that output without a live database. The official `data/manifest.json` records source file SHA-256 checksums and row counts. Dataset meanings are in the organizer's [data dictionary](https://github.com/tamu-datathon-org/dashboard-royale/blob/main/reference/DATA_DICTIONARY.md) and [dataset guide](https://github.com/tamu-datathon-org/dashboard-royale/blob/main/reference/DATASET.md).

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

## Location and downtime

The entrance–Back Forty walkway has a recorded closure from March 3 to April 7, 2025. Comparing Back Forty with the rest of the floor before, during and after closure tests a plausible location explanation. It is observational: zone composition, promotions, seasonality and counter failures may also change. A difference in trends is not a causal estimate without further assumptions.

Traffic sensors count crossings, not people. Offline or missing counters are not zeros. Coverage must accompany traffic comparisons, and zone-day traffic repeated on machine rows must be deduplicated before aggregation.

Downtime opportunity is a counterfactual estimate: unavailable hours multiplied by an explicitly stated comparable play or theo rate. It is not observed lost cash. It can overstate recoverable demand if players substitute to nearby machines or if downtime occurs in quiet hours. Repairs may have waiting and hands-on components; overlapping tickets must not be summed as independent machine downtime. Scheduled-minus-available meter time is the primary exposure measure.

## Guests and comps

Guest tables include only loyalty-card activity. They cannot describe untracked people or complete Las Vegas trips. Segment-month totals can be filtered at their recorded monthly grain; partial-month results must not be implied when daily guest data is absent.

Period-level concentration and ahead rates require aggregating each player's months first. A player appearing in several months is one person, not several. Top-share calculations state their ranking variable and denominator. Net player outcomes can have mixed signs; ranking concentration is more interpretable for nonnegative wagers or gross losses than signed net totals.

Comp face value is the menu value granted; economic comp cost is the supplied cost consumed. Reinvestment is economic cost / theo. Changes in this ratio can reflect policy, guest mix, redemption timing or changing theo. An observational change does not establish incremental loyalty-program return.

## Forecast validation

Model parameters are fitted on January–April and frozen before the May–June holdout. The benchmark is the constant mean daily floor coin-in from the training period. The weekday model uses only weekday-specific training means. Both are scored on exactly the same held-out gaming dates with mean absolute error in dollars.

Holdout results are descriptive evaluation, not a promise for July. Future actuals, holdout-day lag updates and later-published tourism or survey files are not model inputs. A model that fails to beat the baseline remains a valid result; decisions should then avoid claiming forecasting improvement.

## Action scenarios

The planning horizon is July 1–30, 2025. Maximum spend is $100,000 and at most three paid action types may be selected. Quantity caps and incompatibilities come directly from `action_catalog`. Retaining cash consumes no action slot.

Cost per unit is `(unit_cost_cents + recurring_cost_cents_per_day × max(0, 30 − lead_days)) / 100`. Fixed packages are paid in full. Benefits begin after lead time and account for intervention downtime. Manufacturer maintenance takes 90 minutes per affected machine, not per manufacturer. Comp-pilot implementation cost excludes any additional comp allowance, which must be budgeted separately.

The catalog prices interventions; it does not estimate effects. Scenario recovery fractions are assumptions and must be visibly adjustable or stated. Show gross theoretical recovery, intervention cost and net scenario effect separately. Inspection primarily purchases information and should not be assigned guaranteed recovery. A comp pilot requires a control group and should measure economic contribution, comp expense and guest safeguards, without targeting people because they lost heavily.

## AI-use disclosure

The cinematic opening uses a fictional performer image generated with Higgsfield Soul Cinema and a 5.37-second Wan 2.2 Fast animation, created using the account's included Free Plan credits. The final card and emerging gold spade are SVG/CSS animation. These decorative assets are not analytical evidence or recordings of a real casino. Generation provenance is recorded in `docs/CINEMATIC_OPENING.md` in the source repository.

The enhanced dashboard retains the team's earlier analytical code, report bundle and source provenance. The original repository's `docs/AI_DISCLOSURE.md` credits both OpenAI Codex and Anthropic Claude for that prior work; those contributions remain preserved.

For this enhancement, OpenAI Codex assisted with reviewing the challenge materials and team repository, verifying and transforming supplied data, interface design, implementation, independent numerical checks, and drafting this submission package. AI assistance is not independent human verification. Team members must review the conclusions, final application and submission materials before presenting them. The dashboard does not use AI to infer private characteristics of real guests; the guest data is fictional challenge data.
