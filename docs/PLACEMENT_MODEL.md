# Placement demand model

This model predicts **expected house win per available machine-hour** from game configuration, zone, manufacturer and weekday. It supports comparisons for a Placement Lab, with explicit abstention where the historical game/zone sample is too small. It does not estimate a causal return from moving a machine.

## Reproduction

Install the repository's analytical requirements in an isolated environment. Set `DR_DATA` to the organizer data directory, then run from the repository root:

```powershell
python -m src.placement_model --out outputs/placement_model.json
python -m pytest tests/test_placement_model.py -q
```

The exporter records source-table SHA-256 hashes, dependency versions, fixed seed 2025, hyperparameters in code, and a two-thread native limit. It emits deterministic compact JSON for the browser; no pickle, API key, paid service or model server is required.

## Data and target

Training rows are active, on-floor machine-days with positive available hours. The target is `theo_usd / available_hours`; rows are weighted by available hours. Expected win is configured hold applied to wager demand. It avoids training directly on noisy realized payout wins, but it is still a prediction of demand rather than guaranteed earnings.

Prediction inputs are an explicit allowlist: configuration, zone, manufacturer, deterministic weekday, and a zone/configuration interaction. No machine ID, actual future availability, observed same-day coin-in, occupancy, traffic, repairs or future-computed lag columns enter a model. The encoder is fitted inside each training fold. A held-out date's metadata is frozen to the latest configuration, manufacturer and placement observed by the forecast origin; actual later moves do not leak into forecasts. Machines first installed after that origin are excluded from that evaluation and counted.

## Model selection and validation

Three fixed candidates are compared by available-hour-weighted mean absolute error of rates:

1. Configuration × weekday training means, with configuration and global fallbacks.
2. One-hot regularized linear regression, ridge penalty 50.
3. Histogram gradient boosting, 100 iterations, learning rate 0.07, at most 15 leaves, minimum 80 rows per leaf, L2 penalty 20, no validation-dependent early stopping.

Expanding training windows end January 31, February 28 and March 31. Their validation periods are February, March, and April 1–15. All candidate choice ends April 15, with deterministic ties favoring the simpler model. The selected model then fits January 1–April 15. April 16–30 is separate residual calibration and is not added to training before testing. May 1–June 30 supplies retrospective evaluation with April 30 metadata frozen. The test reports total and zone errors, signed bias, coverage, width, unknown-machine exclusions and errors on later-moved machines. Because this dataset has already been inspected, it is explicitly **not an untouched prospective holdout**.

A second diagnostic holds out approximately 20% of complete machine IDs using a stable SHA-256 rule, trains the selected specification on the other machines through April 15 and scores those held-out machines in May–June. This tests transfer to other machines in known populations; it does not validate relocation effects or wholly new kinds of games.

Residual bands use the finite-sample 90th-percentile absolute-error order statistic, separately by zone when at least 100 calibration rows are available, otherwise pooled. The output reports realized May–June coverage rather than assuming 90% coverage. Repeated machine-days and daily shocks violate simple independent/exchangeable sampling assumptions, so these empirical bands carry no universal coverage guarantee.

## Measured result on the pinned data

| Candidate | Inner-window weighted MAE, USD per available hour |
| --- | ---: |
| Configuration × weekday baseline | 4.6560 |
| Regularized location regression | 3.9029 |
| Histogram gradient boosting | **3.7979** |

Histogram gradient boosting was selected before the May–June evaluation. Its retrospective weighted MAE is **$3.6907 per available hour**, versus **$4.2858** for the baseline, a **13.88% reduction**. There are 18,739 scored rows and 49 excluded rows for a machine first installed after April 30. The empirical 90% band covers **88.55%** of outcomes, with mean width **$14.4048 per available hour**. Coverage is not uniformly 90%: Main Entrance is 84.18%, Garage Entrance 84.74% and High-Limit Room 85.59%. Per-zone scores use the origin's frozen zone assignments, not later realized moves.

The held-out-machine diagnostic trains on 258 machine IDs and scores 3,111 rows from 51 different IDs, with weighted MAE **$3.6012 per available hour**. This is a transfer diagnostic, not evidence of causal relocation accuracy. The exporter contains the full metrics, biases, calibration widths, exclusion counts, source hashes and dependency versions.

## July scenarios and support

After the retrospective score is computed, the **same selected specification** refits January–June. Within the July 1–30 budget horizon, its point prediction averages the known **July 3–30 post-lead calendar** for each active June 30 machine and destination zone. Current and destination rates use this same 28-day window; the move's three hours of downtime are still a separate cost-calculator deduction. The April residual width is reused as an empirical daily-rate sensitivity range around that point. It is not a calibrated interval for the July average and not an interval for causal uplift. Propagating it through a cost calculator must retain those labels.

A configuration/zone combination is displayed only with at least **three distinct machines and 120 machine-days** in January–June. Unsupported scenarios contain null predictions, support counts and an abstention reason. Repeated days from one machine cannot satisfy the distinct-machine rule. Support does not establish causal overlap or remove confounding.

The export includes all 314 physical slot positions, the 308 machines on the June 30 floor, and six vacant slots. A zero-availability machine still occupies its position. Main Entrance and Bar Row have no vacant slots in this snapshot; entering an occupied destination requires an explicit swap. The model distinguishes zones, not precise seats within a zone; coordinates constrain inventory and enable display, not unsupported seat-level performance claims.

The catalog supplies a $1,800 cost per moved machine, two lead days, three hours downtime and a 24-unit limit. A swap needs both machines assessed and costed. Property benefit must account for displaced play, both swap legs, forecast sensitivity, move downtime and costs. Demand uplift must remain a scenario, and a controlled prospective pilot is needed to establish incremental benefit.

The source has 55,092 active machine-days but only four observed moves, three across zones; only one cross-zone move precedes May. A flexible predictive model cannot manufacture causal relocation evidence from repeated observations of stationary machines. High-limit and new-title game configurations also have restricted zone support. This limitation is shown in the exported evidence and must remain visible in the interface.
