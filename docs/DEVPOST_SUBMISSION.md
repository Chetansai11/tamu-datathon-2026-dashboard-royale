# Devpost submission text (Dashboard Royale)

Paste the sections below into the Devpost form. Check every link in a private browser window first.

## Links

- **Interactive dashboard:** https://gilded-ace-dashboard.vercel.app/
- **Offline fallback (attach the file):** `web/dist/offline.html`, a single self-contained page that opens in any modern browser with no install.
- **Code:** https://github.com/Chetansai11/tamu-datathon-2026-dashboard-royale (the repository must be public before submitting).
- **Write-up (under 400 words):** `web/public/docs/WRITEUP.md`
- **Claims & Evidence appendix:** `web/public/docs/CLAIMS_EVIDENCE.md`
- **Methods and assumptions:** `web/public/docs/METHODOLOGY.md`
- **Video (2 minutes or less):** record from `web/public/docs/VIDEO_SCRIPT.md`.

## Priced actions (July 1–30, 2025, $100,000 budget)

1. **A-INSPECT** on M-1158, $1,200, 1 lead day. It is the only payout signal surviving the floor-wide Bonferroni screen; inspection tests it, and no defect is presumed.
2. **A-WAYFINDING** for Back Forty, $7,500, 10 lead days. Breaks even at +0.72 occupancy points with no displaced play, or +1.44 points at 50% displacement.

Total $8,700; $91,300 retained. A third action type was considered and not funded (see the appendix's tradeoff table).

## AI-use disclosure

Two AI coding assistants contributed. **OpenAI Codex** (GPT-based lead and parallel agents) did the data exploration, screening rank, demand forecast, downtime, guest and comp analyses, Placement Lab model training and validation, the dashboard interface, most tests and first drafts of documents. **Anthropic Claude** wrote the shared money-math module, the five-component shortfall decomposition, the Back Forty footfall analysis and wayfinding action, and decomposition views, and later revised the write-up and appendix after a rubric review. Every reported number is computed by code from the supplied synthetic data; AI was not used to invent observations, treatment effects or returns. External LVCVA and NOAA data are cited, retrospective context only, and are excluded from forecast features. The opening animation uses original SVG/CSS cards and WebGL particles. The team reviewed the findings and is responsible for the submission. Full detail: `docs/AI_DISCLOSURE.md`.

## Human checklist before 11:30 AM

- [ ] Make the GitHub repository public and confirm `main` shows the latest commit.
- [ ] Open the dashboard link in a private window on cellular data. Venue Wi-Fi blocks `*.vercel.app` (Cisco Umbrella), so judges on that network may need the offline file.
- [ ] Record and upload a video of 2 minutes or less.
- [ ] Attach `web/dist/offline.html`, the write-up and the appendix.
