# Enhanced decision dashboard

The new `web/` interface preserves the original `dashboard/` and all analytical modules. Its story is: pause blanket replacement, inspect one payout signal, test access to Back Forty, and retain $91,300. The recommendation is descriptive and hypothesis-driven; it does not claim proven machine defects or guaranteed intervention returns.

## Deliverables

- Seven responsive views with dated zone/bank filtering, clickable floor layout, machine cases, guest cohorts, frozen model validation, sensitivity controls, budget constraints, and searchable evidence.
- Midnight Royale theme: navy surfaces, cyan/violet charts, gold accents, animated orbit artwork and chart reveals. A persistent motion control honors system reduced-motion settings.
- Historical January–June playback now shows a spacious daily performance chart, monthly average line, explicit totals, and day-normalized month comparisons. Its zero-based vertical scale stays fixed across months. Playback pauses on chart inspection, measure/month selection, hidden tabs, or motion disabled; its independent scope is explicit.
- Location matters compares seven zones with ranked, zero-based hourly yield bars, exact values, a weighted scope average, and clickable zone drilldowns. These raw yields reflect game mix and location; the comparison does not claim causality. The detailed physical floor map remains in Floor explorer.
- The gold ace turns on its own vertical axis every 20 seconds, separately from the orbit rings. A compact version appears beside the mobile heading.
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

The Midnight Royale revision was visually inspected in the in-app browser at 1440×1000 and 390×844. All seven desktop routes and the machine evidence dialog were reviewed; mobile navigation, overview, action layout and filters were checked. The mobile bank selector was widened after inspection. Historical playback reached June, the motion toggle stopped effects, and June filtering rendered $39.73m. DOM regression checks additionally verify persisted motion preference, system preference changes, playback progression, monthly measure selection and zone drilldowns. Negative bar charts explicitly include zero. Anonymous public access is not claimed; the hosted dashboard retains its existing private audience.

## Provenance

Original team repository: Chetansai11/tamu-datathon-2026-dashboard-royale. Original reports, decomposition, forecast, hourly downtime model, guest windows and comp analysis are retained. The redesign and compact exporter were developed with Codex assistance. See the separate AI disclosure. The standalone file includes locally hosted Google Fonts under the bundled OFL licenses.

The follow-up visualization revision was checked at the same desktop/mobile sizes: the ace uses a verified 20-second self-rotation, the monthly plot has a consistent cross-month scale, and zone rankings navigate to the correct filter. Monthly charts and zone rows remain readable without page overflow at 390px.
