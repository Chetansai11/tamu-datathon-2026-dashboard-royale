# The Gilded Ace · Floor Intelligence

TAMU Datathon 2026 Dashboard Royale. An interactive investigation of a fictional
300-machine casino: should its ten lowest-earning slot machines be replaced, or
does their performance reflect luck, location, exposure or downtime?

## Open the enhanced dashboard

The enhanced application lives in **[web/](web/)**. For the standalone edition,
open **[web/dist/offline.html](web/dist/offline.html)** in a modern browser after
building or extracting the release. That single file includes the data, scripts,
styles and fonts; it needs no account, server or network connection.

For development, install **Node.js 22.12 or newer**, then run from the repository:

```powershell
cd web
npm ci
npm test
npm run build
npm run dev
```

Open the local URL printed by Vite. `npm run preview` serves the production
build; `npm run build` also generates `dist/offline.html`. A static host can serve
the contents of `web/dist/`. The raw challenge files are not required to open or
build the dashboard because its verified data export is included.

The team's original buildless dashboard is preserved at
**[dashboard/index.html](dashboard/index.html)**, with its original analytics in
**[src/](src/)** and research notes in **[docs/](docs/)**. Keep the original
dashboard directory together when opening that edition offline. The enhancement
retains the team's reports and methods, adds interactive investigation and action
planning, and documents its independent review in
[REVIEW_2026_11_07.md](docs/REVIEW_2026_11_07.md).

## Judge walkthrough

1. Start with the executive brief and the five-part decomposition of the GM's ten.
2. Change the period, zone or bank, then inspect a machine on the floor map or
   table. Full January–June findings are labeled separately from filtered views.
3. Explore demand, the chronological model holdout and the downtime estimate.
4. Open Guests & comps and select a guest cohort and whole-month window. Player
   outcomes are computed from each person's total across that exact window.
5. Build a July scenario in the Action Studio, vary displacement assumptions, and
   trace the recommendation to its source, alternative explanation and limitation.

**Recommendation: pause blanket replacement, inspect one payout signal, and test
access to Back Forty.** The GM's ten earned $541,425 less than ten average machines.
The descriptive decomposition attributes $209,724 to game math, $143,519 to
location, $128,590 to exposure and $63,357 to payout residuals, offset by a positive
$3,765 machine-specific component. Nine of the ten spent time in Back Forty.
These associations challenge a ranking based only on earnings; they do not prove
that every machine is healthy or that access caused the entire location gap.

The proposed plan spends **$8,700**: **$1,200** to inspect M-1158, the only payout
signal surviving the family-wide screen, and **$7,500** for a measured Back Forty
wayfinding trial. It preserves **$91,300**. No revenue uplift is guaranteed.
The frozen weekday forecast has **$68,698.55 MAE**, versus **$218,258.10** for the
constant-training-mean baseline. Its nominal 90% band covers **85.25%** of test days.

## Submission artifacts and credits

- [Enhanced main write-up](web/public/docs/WRITEUP.md), under 400 words
- [Claims & Evidence appendix](web/public/docs/CLAIMS_EVIDENCE.md)
- [Methods, assumptions and enhancement AI disclosure](web/public/docs/METHODOLOGY.md)
- [Walkthrough script](web/public/docs/VIDEO_SCRIPT.md), designed for under two minutes
- [Original team AI-use disclosure and credits](docs/AI_DISCLOSURE.md)
- [Original write-up](docs/WRITEUP.md), [appendix](docs/CLAIMS_EVIDENCE.md),
  [video script](docs/VIDEO_SCRIPT.md) and [human handoff](docs/HANDOFF.md)

The original `outputs/dashboard-royale-submission.zip` packaging command below
produces the preserved dashboard release; it does not package `web/`. For the
enhanced interactive-file submission, use `web/dist/offline.html` with the enhanced
documents and source. The script is preparation for a recording, not a recorded
video. A final Devpost submission and any published URL must be checked separately.

## Reproduce the data and analysis

The export uses the January–June 2025 synthetic data pinned to official commit
`5f9274bdc3efa6614e6c081becaeadda34c57a32`. The enhanced builder downloads its 19
required Parquet tables, verifies their SHA-256 checksums against that release's
manifest, reconciles the existing team reports, and emits browser data plus an
audit report. From the repository root, use a separate Python environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dashboard.txt
$env:DR_DATA = 'C:\path\to\official\data'
.\.venv\Scripts\python.exe -m src.placement_model
.\.venv\Scripts\python.exe web/scripts/build_data.py --reports dashboard/reports.json --source-dir data/source --output web/public/data
cd web
npm test
npm run build
```

To regenerate the original analyses as well, obtain the complete official
extracted `data` directory, including files needed by the release verifier.
The 19-table enhanced cache alone is not the full source release. From the
repository root:

```powershell
$drPython = '.\.venv\Scripts\python.exe'
$env:DR_DATA = 'C:\path\to\official\data'
& $drPython -m src.validate_release
& $drPython -m src.q1_machines
& $drPython -m src.q1_decomposition
& $drPython -m src.q2_demand
& $drPython -m src.q3_downtime
& $drPython -m src.forecast
& $drPython -m src.placement_model
& $drPython -m src.q4_q5_players
& $drPython -m src.q6_actions
& $drPython -m src.build_dashboard
& $drPython -m pytest tests -q --basetemp outputs/pytest-local
& $drPython -m src.package_release
```

`src.package_release --rebuild` also runs these analysis modules in dependency
order, including the decomposition. Then rerun the enhanced data builder and
web build to include updated reports. Node.js is also needed by the original
dashboard's JavaScript checks. The broad starter `requirements.txt` is not needed
for this dashboard. See [official starter provenance](docs/SETUP.md); contributors
should follow [AGENTS.md](AGENTS.md) before changing a shared environment.

## Interpretation

Wagers include replayed winnings; they are not new guest cash or casino profit.
Rates are ratios of sums. Off-floor days are excluded, placements are dated, and
the March 8 gaming day is 23 hours. Guest results cover tracked play only and have
their own whole-month filters. Comp economic cost is already included in POS cost
of goods and is counted once. Location contrasts, missing-play estimates and
action sensitivities are descriptive or assumption-dependent, never promised
causal returns. The interactive replacement screen is exploratory; the fixed
full-period statistical investigation governs the inspection recommendation.

Original method details: [machines](docs/Q1_METHOD.md),
[demand and forecast](docs/demand_forecast.md),
[operations and guests](docs/OPS_GUESTS_METHODS.md).

## Placement Lab and analytical validation

The desktop interface retains its card opening, particle ace and palette. Placement Lab compares staying, a vacant-slot move, or a two-machine swap using dated June 30 inventory. Both swap directions need at least three training machines and 120 machine-days for their game/zone combination. Move cost, two-day lead, three-hour disruption per machine, displacement, retained action budget and a zero-change baseline are explicit. These are predictive association scenarios, not causal relocation returns or a whole-floor optimum.

`python -m src.placement_model` trains three fixed candidates using expanding chronological folds, calibrates ranges separately in April, evaluates May–June retrospectively, and refits the selected model for July 3–30 scenarios. It exports source hashes, library versions, seed, folds, per-zone errors, support counts and inventory to `outputs/placement_model.json`; the web builder copies it to `web/public/data/placement_model.json`. No paid AI service or runtime model server is needed. See [model specification](docs/PLACEMENT_MODEL.md).

The selected gradient boosting model achieves $3.6907 available-hour-weighted MAE versus $4.2858 for the configuration/weekday baseline, a 13.88% reduction. Nominal 90% daily-rate ranges cover 88.55% of observations. July ranges reuse historical residuals as sensitivity bounds, not calibrated relocation-effect intervals. The separate retrospective rolling floor forecast reports its adaptive challenger losing to the weekday reference by 8.79%; the original frozen benchmark is preserved. The decomposition excludes the target throughout its nested peer benchmark, and exploratory filtered residuals are distinguished from fixed, multiplicity-corrected investigation flags.
