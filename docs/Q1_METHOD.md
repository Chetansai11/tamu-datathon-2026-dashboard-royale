# Q1: a decision screen, not a replacement order

Run `python -m src.q1_machines` from the challenge checkout. The module uses
`src/metrics.py` and writes `outputs/q1_machines.json` and `outputs/q1_ranking.csv`.
Set `DR_DATA` to an extracted official dataset when using another machine.

The GM baseline sorts total house win. We retain that exact bottom ten and test
each for exposure, availability, payout variation and location association.
Only active, placed machine-days enter; dates retain that day's zone/bank.
Calendar scheduled hours include the 23-hour spring daylight-saving day.

Our demand index is a ratio of sums: total theo divided by total expected theo.
Expected theo on each day equals the machine's available hours multiplied by
other machines' total theo / total available hours with the same game configuration,
zone and date. We exclude the target from both sums and require three peers;
otherwise we fall back to same-config, same-day floor peers. This prevents a
large machine from setting its own benchmark. Absolute theo/hour remains visible
because a fair within-game comparison need not be a profitable investment.

The location index divides zone-peer expected theo by same-config floor-peer
expected theo, using the target's actual daily exposure weights. It is an
association, not a causal estimate of moving a machine. Same-config bank-day
results are also supplied where three peers exist. Differences within a zone,
unmeasured player preference and bank position can still explain a weak index.

For uncertainty we jointly resample seven-day calendar blocks of observed and
expected theo 2,000 times (seed 2026), reporting percentile 95% intervals. They
describe stability across the observed weeks, not future returns; peers are held
fixed and intervals do not adjust for selecting the weakest of 310 machines.
They therefore flag candidates for a controlled demand test, not proven failures.

Payout screening uses the supplied sum of bet squared times per-spin payout
variance, converted from cents squared to dollars squared. Two-sided normal
approximation p-values are multiplied by all 310 machines, capped at one, to
control family-wise error under that approximation. This screen is separate
from the demand bootstrap. A significant signal warrants meter/configuration
verification, never an accusation. The displayed null hold band is a 95% range
under configured game math, not a confidence interval for guaranteed profit.

Down-hour opportunity equals peer theo/hour times unavailable hours and is
explicitly gross foregone opportunity, not incremental recoverable revenue.
Q3 supplies the more granular hourly counterfactual and substitution sensitivity.
