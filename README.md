# Dashboard Royale

TAMU Datathon 2026. Interactive dashboard for The Gilded Ace (fictional 300-machine casino): are the 10 lowest-earning slot machines truly underperforming, or unlucky, badly placed or often broken? Luck, location or a leak?

Open **[dashboard/index.html](dashboard/index.html)** in a modern browser. It works
offline with no account, Python, server or external libraries. Keep the four
dashboard files together. The analysis uses the January–June 2025 synthetic
dataset, refreshed to official commit `5f9274bdc3efa6614e6c081becaeadda34c57a32`.

## Judge walkthrough

1. Change the month range, then choose a zone or bank from the persistent filters.
2. Open **Machine review**: each GM candidate's gap is split into time on floor,
   game math, location, the machine and luck. Click one for its evidence. The full-window investigation is labeled
   separately from the filtered explorer.
3. Open **Guests & comps** and choose a guest group. Player concentration is
   recomputed from person totals for the exact selected whole-month window.
4. Open **Validation** for the frozen Jan–Apr model and May–Jun holdout.
5. Open **July action plan** and click its evidence links.

**Answer: the machines aren't the problem; Back Forty is.** The GM's ten earned
$541,425 less than ten average machines: game math 39%, location 26%, short
exposure 24%, luck 12%, and the machines themselves +$3,662 (`src/q1_decomposition.py`).
Nine of the ten stand in Back Forty, a zone short of footfall.

The plan spends **$8,700**: **$1,200** to inspect M-1158, the one payout signal,
and **$7,500** for Back Forty wayfinding with a sensor-based measurement plan. It
preserves **$91,300** and replaces no machines. No revenue uplift is guaranteed.
The weekday forecast has **$68,698.55 MAE**, versus **$218,258.10** for the
constant-training-mean baseline. The nominal 90% band covers **85.25%** of test days.

## Submission artifacts

- [Main write-up](docs/WRITEUP.md), under 400 words
- [Claims and Evidence appendix](docs/CLAIMS_EVIDENCE.md)
- [AI-use disclosure](docs/AI_DISCLOSURE.md)
- [Video script](docs/VIDEO_SCRIPT.md), designed for under two minutes
- [Human handoff and submission checklist](docs/HANDOFF.md)
- `outputs/dashboard-royale-submission.zip`: offline dashboard, source, tests,
  reports and documents; raw external data is excluded

Publication, recording and Devpost submission are human steps. No public URL or
recorded video is claimed by this repository. A human can upload `dashboard/`
using [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
and test the resulting link in a private browser window. The guide also allows
an interactive file submission with opening instructions.

## Reproduce the analysis

Use the shared environment in this workspace. Do not alter it without the
coordination decision required by `AGENTS.md`. For a separate clean environment,
use `requirements-dashboard.txt`; the broad original `requirements.txt` is not
needed for this dashboard. Node.js is needed only for the JavaScript checks.

```powershell
$drPython = 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe'
$env:DR_DATA = 'C:\Users\asus\Desktop\MS\Datathon\challenges\challenge-2\data\dashboard-royale\data'
& $drPython -m src.validate_release
& $drPython -m src.q1_machines
& $drPython -m src.q2_demand
& $drPython -m src.q3_downtime
& $drPython -m src.forecast
& $drPython -m src.q4_q5_players
& $drPython -m src.q6_actions
& $drPython -m src.build_dashboard
& $drPython -m pytest tests -q --basetemp outputs/pytest-local
& $drPython -m src.package_release
```

On another machine, set `DR_DATA` to the official extracted `data` directory and
use that environment's `python`. See [official starter provenance](docs/SETUP.md).
The analysis modules do not use network services. The checksum verifier normalizes
Windows path separators, unlike the organizer's original manifest comparator.

## Interpretation

Wagers include replayed winnings. Every rate is a ratio of sums. Off-floor days
are excluded; placements are dated; the March 8 gaming day is 23 hours. Guest
outcomes cover carded play only. Comp economic cost is already in POS cost of
goods and is counted once. Counterfactual recovery, location contrasts and action
scenarios are assumptions or associations, never promised causal returns.

Method details: [machines](docs/Q1_METHOD.md),
[demand and forecast](docs/demand_forecast.md),
[operations and guests](docs/OPS_GUESTS_METHODS.md).
