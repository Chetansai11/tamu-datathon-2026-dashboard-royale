# Combined AI-use disclosure

This is the single submission disclosure for the Gilded Ace dashboard. OpenAI Codex and Anthropic Claude assisted with development; the team remains responsible for reviewing and presenting the entry.

## Code, analysis and writing

- **OpenAI Codex**, including parallel GPT agents, assisted with data exploration, screening, demand and forecast analysis, downtime, guests and comps, dashboard design and implementation, tests, browser checks, and document drafts. Later work added fully target-excluded peer benchmarks, retrospective rolling forecast validation, the trained Placement Lab, scenario economics, and clearer analytical explanations. Exact unexposed model deployment identifiers are not asserted.
- **Anthropic Claude**, as credited in earlier repository documentation, contributed the shared money-math module (`src/metrics.py`), payout z-scores, shortfall decomposition (`src/q1_decomposition.py`), Back Forty footfall analysis, action-plan costing and measurement logic, reviews, and documentation. Subsequent Codex edits do not remove that credit.
- The user supplied the challenge materials, repository, priorities and visual feedback. Automated checks are not a substitute for human review; no independent human verification is claimed merely because a test passed.

## Trained models and evidence

Forecast and placement scores are calculated from the supplied data. They are not LLM-generated estimates. Placement candidates include a configuration/weekday baseline, ridge regression and histogram gradient boosting, selected with chronological validation. Evaluation freezes prediction-origin metadata, separates calibration, and excludes held-out machine IDs from grouped model selection and fitting. May–June evaluation is retrospective; July ranges are sensitivity guides, not calibrated causal-uplift intervals.

The browser reads static model outputs and does not call an LLM to recommend or execute interventions. Proposed effects, displacement and recovery are labeled assumptions. Source hashes, seeds, features, library versions, formulas and tests accompany the implementation. The fictional casino and guest records are synthetic. Tourism and weather series provide retrospective external context and are excluded from forecast inputs. Raw LVCVA/Missouri tables and player-level identities are not bundled.

## Visual and asset assistance

An earlier opening used a fictional performer image and animation from Higgsfield Soul Cinema and Wan 2.2 Fast, using included Free Plan credits without purchase or upgrade. That film is no longer used. The current 4.8-second opening consists of native SVG/CSS cards and a gold/silver-white WebGL particle ace. The user supplied an AXON motion brief; the adaptation uses original spade geometry, analytic pointer motion and floating metric cards, not the brief’s full fluid simulation. IBM Plex fonts are bundled under the OFL. Decorative artwork is not analytical evidence.

No paid model inference or new generation service was added for the analytical revision. No recording, public-access check, repository-visibility change or Devpost submission is claimed by this disclosure. Historical development records remain in the source repository; this file is the canonical submission disclosure.

Codex also implemented and tested the July reference export, explicit operational alert rules, illustrative checker, session-level intro memory and split web/offline packaging. The July rules were designed retrospectively; no July actuals, prospective accuracy or intervention success is invented. Source publication does not establish a deployed update or completed submission.
