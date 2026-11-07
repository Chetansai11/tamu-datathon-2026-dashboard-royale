# Open and reproduce the dashboard

Open `dashboard/index.html` in a current browser. Keep `index.html`, `styles.css`, `app.js`, `data.js` and `reports.json` together. No server, login, package install or external network is required. The data bundle contains synthetic, aggregated analysis; it does not expose player identities.

For an HTTP preview from this repository:

```powershell
& 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe' -m http.server 8602 --bind 127.0.0.1 --directory dashboard
```

Then open `http://127.0.0.1:8602`.

## Rebuild

Run each analysis module first, then:

```powershell
& 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe' -m src.build_dashboard
& 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe' -m pytest tests/test_dashboard.py
```

The exporter reads `outputs/q1_machines.json`, `q2_demand.json`, `q3_downtime.json`, `q4_guests.json`, `q5_comps.json`, `forecast.json`, `actions.json` and `validation.json` when present. It reports the included keys; a submission build must include every report. Report JSON remains downloadable inside the bundle. Data paths resolve through `src.metrics.data_dir()` (`DR_DATA` can override).

## Four judge checks

1. Change From/Through month. Floor totals and charts recompute from dated machine rows, using ratios of sums.
2. Select a bank from the always-visible filter, or open Guests & comps and select a group. Guest outcomes cover complete selected months; floor bank/zone filters do not apply to guest cohorts.
3. Open Validation in one click. See the Jan–Apr/May–Jun split, baseline, errors and empirical interval coverage.
4. Open July action plan, then View evidence. Each evidence card states source, result, alternative explanation and limitation.

Full-period machine rankings, causal investigations and July plans stay fixed and are labeled explicitly. Their descriptive exploration panels respond to filters. The guest panel combines player-months before counting distinct players or computing concentration. The public dashboard contains no player IDs.

## Hosting handoff

The chosen route is a human-uploaded static directory on Cloudflare Pages (or another static host). This build does not create an account, upload, publish, push or change repository visibility. Upload the contents of `dashboard/` after human review. Open the public URL in a private window and repeat the four checks above. The guide also permits a file submission with these opening instructions.

Human work still includes publishing if a hosted link is used, recording the video, approving source pushes, and submitting on Devpost. Local preview and accounting tests do not verify public access.

## Verification scope

The automated dashboard tests compare every exported day against independent `property_day` monetary totals; verify the DST schedule and exclusion of off-floor rows; and run JavaScript aggregation against SQL expectations for full-floor, zone and bank scopes. Additional cases verify weighted ratios, empty scopes and dated moves. Browser appearance, keyboard interactions and private-window public access need a separate UI check.
