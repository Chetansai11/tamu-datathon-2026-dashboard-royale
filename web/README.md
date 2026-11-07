# The Gilded Ace · Floor Intelligence

A seven-view decision dashboard for Dashboard Royale. The enhanced interface preserves the team's verified analytics and original offline dashboard. All casino and guest data is synthetic.

## Open

The packaged `dist/offline.html` is a self-contained interactive dashboard: open it in Chrome, Edge, or Firefox. Keep the accompanying `data/` and `docs/` folders for evidence downloads. No server, account, or network is required for the dashboard itself.

For a hosted deployment, serve the contents of `dist/`. For development, use Node.js 22.12+ (24 recommended), then:

```sh
npm ci
npm run dev
```

## Build and check

```sh
npm run build
npm test
```

The build compiles TypeScript, emits a static site, and packages an offline HTML copy. Tests cover budget constraints, date/location aggregation and dated moves, all seven views, guest cohort filtering, machine drilldown, evidence navigation, and downloads. DOM tests do not establish pixel layout or public anonymous access.

## Reproduce the data

Install `pandas`, `numpy`, and `pyarrow` in a separate Python environment. From this folder:

```sh
python scripts/build_data.py --reports public/data/reports.json --output public/data
```

The exporter downloads the pinned organizer release, verifies source hashes, and checks accounting, DST, forecast predictions and decomposition factors against the retained team reports. Source files cache in `data/source/` and are not part of the public site. To regenerate the underlying reports, use the parent repository's Python analysis commands first; the source path can be set with `--source-dir`.

## Judge's route

1. **The verdict:** examine the earnings-gap decomposition and change dates, zone, and bank.
2. **Floor explorer:** click a bank or machine, inspect payout uncertainty and dated placement, and export a case.
3. **Demand & downtime:** distinguish unavailable capacity from demand; inspect the Back Forty closure comparison.
4. **Guests & comps:** select whole-month windows and a guest group. Guest net is payouts minus wagers; cards cover only tracked play.
5. **Model lab:** inspect the frozen January–April / May–June test, baseline, and honest interval coverage.
6. **Action studio:** follow the $8,700 recommendation, change displacement assumptions, or build a constrained catalog portfolio.
7. **Evidence:** trace a claim to its source, transformation, competing explanation, and limitation.

Date and location filters apply to the explorer. Fixed investigations, model validation, and the July action plan are labeled separately. Expected house win is not profit; action scenarios are conditional, not measured intervention returns.

The main write-up, claims appendix, methodology/AI disclosure, and a two-minute walkthrough script are in `public/docs/`. The script is not a recorded video. No competition submission is made by building this dashboard.
