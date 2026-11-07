# Enhanced decision dashboard

The new `web/` interface preserves the original `dashboard/` and all analytical modules. Its story is: pause blanket replacement, inspect one payout signal, test access to Back Forty, and retain $91,300. The recommendation is descriptive and hypothesis-driven; it does not claim proven machine defects or guaranteed intervention returns.

## Deliverables

- Seven responsive views with dated zone/bank filtering, clickable floor layout, machine cases, guest cohorts, frozen model validation, sensitivity controls, budget constraints, and searchable evidence.
- `web/dist/offline.html`: self-contained dashboard; companion data/docs folders supply downloads.
- Root `dist/`: the same build prepared for static hosting.
- `web/public/docs/`: revised write-up, Claims & Evidence, methodology and AI disclosure, and a walkthrough script. A recorded video and Devpost submission are not claimed.
- `web/scripts/build_data.py`: reproducible compact exporter, pinned source checksums, and independent verification of retained team analytics.

## Rebuild

Requires Node 22.12 or newer. From the repository root:

```sh
npm --prefix web ci
npm run build
npm test
```

Use the root Python reproduction commands to regenerate original reports. Then run the exporter with `--reports dashboard/reports.json --output web/public/data` (Python dependencies: pandas, numpy, pyarrow). Data caching remains ignored; do not redistribute raw third-party context tables.

## Verification

The original 45 Python/Node tests passed against pinned official source data. The new aggregation regression passed 13,616 assertions covering all property days, date/zone/bank windows, four dated moves, weighted ratios, DST and empty scopes. Budget tests check lead times, capital and package costs, target conflicts, comp allowances, and catalog limits. DOM interaction checks exercise the seven views, filters, machine drill-down, guest groups, model metrics, sensitivity, downloads and evidence navigation.

The environment stopped browser automation because it could not verify the active browser URL. Browser visual QA and anonymous public access were therefore not established by those tests; inspect the preview at presentation size and on mobile before submitting. DOM checks do not substitute for visual inspection.

## Provenance

Original team repository: Chetansai11/tamu-datathon-2026-dashboard-royale. Original reports, decomposition, forecast, hourly downtime model, guest windows and comp analysis are retained. The redesign and compact exporter were developed with Codex assistance. See the separate AI disclosure. The standalone file includes locally hosted Google Fonts under the bundled OFL licenses.
