# AI use disclosure

Two AI coding assistants contributed to this entry. The predictive models described below are trained statistical models; their scores and scenario outputs are computed from the supplied data, not generated as narrative guesses.

- **OpenAI Codex**, with a GPT-based lead agent and parallel GPT agents, did the
  data exploration, the machine screening rank, the demand and forecast, downtime,
  guest and comp analyses, the static dashboard, most tests, browser checks and
  first drafts of the submission documents. The exact deployment identifier was
  not exposed and is not asserted here.
- **Anthropic Claude**, as credited in the earlier repository documentation, wrote the shared money-math module
  (`src/metrics.py`, with game-math payout z-scores), the shortfall
  decomposition (`src/q1_decomposition.py`), the Back Forty footfall analysis
  and the wayfinding action in `src/q6_actions.py`, and the dashboard's
  decomposition views. It also fixed a layout bug, and rewrote this write-up and
  the video script around the decomposition finding.

The decomposition also corrected an interpretation in the earlier screening
rank. Where a zone had fewer than three same-game peers, that rank compared a
machine against the whole floor. That could conflate a zone's observed demand
environment with individual machine performance; it did not identify a causal
zone effect. The dashboard labels the earlier rank accordingly.

The current Codex-assisted analytical revision makes the decomposition fully
target-excluded, including game rates used to value zone peers. It adds mutation
tests and an independent small-data recomputation check. The manager's ten now
have a combined descriptive machine component of $3,764.90, while their total
gap remains −$541,425.30. Bootstrap intervals are explicitly conditional on fixed
estimated peer benchmarks, not simultaneous or causal. Source reports and
submission wording were revised to avoid treating observational explanations
as proven causes.

Codex also implemented a retrospective rolling-origin forecast comparison,
with earlier tuning separated from interval calibration. Its adaptive selector
did not beat the simpler weekday incumbent; that result is retained. Placement
Lab trains a configuration/weekday baseline, ridge regression and histogram
gradient boosting, selects on earlier time folds, and evaluates later dates
with metadata frozen at the prediction origin. Source hashes, features, library
versions, scores, calibration and support counts accompany the exported report.
July predictions are refit through June and feed a transparent scenario engine
that prices moves, swaps, downtime and displacement. The data contains only four
historical moves, so these predictions do not validate causal relocation gains.
The browser consumes static model outputs; it does not call an LLM to recommend
or execute an action. No paid AI inference or new generation service was added.

The human supplied the challenge objectives, repository and task priorities, and
reviews the findings.

All reported numbers were computed from the supplied challenge data. AI was not
used to invent observations, treatment effects or measured returns. Action
sensitivities are labeled assumptions. The fictional casino and guest records
are synthetic. The separate tourism and weather inputs are retrospective
public-source context, excluded from forecast features.

Reproducibility includes source code, explicit formulas, seeded bootstrap
procedures, tests, dataset checksums and dated source provenance. Automated
checks do not replace human review of interpretation. The team member who
submits this entry should review the findings, record the video and confirm
public access before attesting to the submission.

The original analytical agents did not create hosting accounts, publish the dashboard,
change repository visibility, record the submission video or submit to Devpost.
Subsequent interface work with Codex was authorized by the user to update their
GitHub branch and existing hosted dashboard, preserving its private audience.
An earlier cinematic opening used a fictional performer generated with Higgsfield
Soul Cinema and Wan 2.2 Fast using included Free Plan credits, without purchase
or upgrade. The current opening replaces that film with original native SVG/CSS
king, joker and ace cards and a silver-white/gold WebGL particle transition.
Historical asset provenance remains documented in `CINEMATIC_OPENING.md`.
No player-level identities or raw LVCVA/Missouri tables are included in the
dashboard bundle. Devpost submission and a recorded walkthrough are not claimed.

The AXON-inspired visual revision adapts a user-supplied motion brief into original WebGL spade geometry, analytic pointer vortices and CSS floating cards. The shader is not a reproduction of the brief’s full GPU fluid simulation. Typography and palette references are documented in `AXON_DESIGN_REFERENCES.md`; IBM Plex fonts use the bundled OFL. Metric traces come from the supplied synthetic case data. No paid generation or new services were used for this revision.

Codex implemented the signed earnings waterfall, manual guided presentation and readability revision. Following user feedback, the floor transition was simplified into a three-step story with ten stable machine cards, historical location highlights and a separate payout-inspection signal. The current cinematic opening lasts 4.8 seconds and uses only native card artwork and particles, without external media, additional generation or paid services. Presentation components reuse published analytical outputs and active machine-day records. The two-cent difference between the corrected rounded components and the published gap is disclosed. Placement scenarios are labeled model-based assumptions, not observed or proven intervention benefits.
