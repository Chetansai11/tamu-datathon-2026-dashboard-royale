# Human submission handoff

The local dashboard, source, reproducible reports and written submission are ready
for review. Public publication, video recording and Devpost submission remain
human steps. No external push, publication, account creation or visibility change
was performed by the agents.

## Open and review

Extract `outputs/dashboard-royale-submission.zip`, then open
`dashboard/index.html` in Chrome, Edge or Firefox. Keep the dashboard folder
together. It uses local scripts and embedded data, so no installation or server
is required. `dashboard/reports.json` contains the analytical reports.

Check the four judge interactions: change the month range; choose a bank or guest
group; open Validation; open an action's evidence. The full-period investigations
are explicitly fixed while the exploratory totals respond to filters.

## Publish or submit the file

The guide permits a public interactive link or file. For a link, use a human-owned
hosting account. The recorded hosting choice is Cloudflare Pages Direct Upload:
upload the **contents of `dashboard/`**, with `index.html` at the site root, using
the [official drag-and-drop workflow](https://developers.cloudflare.com/pages/get-started/direct-upload/).
The dashboard needs no server build or environment variables. Public hosting is
not verified until the resulting URL works in a private browser window.

Do not upload the full source ZIP as the site root. Attach that ZIP as supporting
code/evidence, or provide a separately approved source link. The raw data checkout
is excluded: its provenance notes prohibit redistributing the bundled LVCVA and
Missouri tables pending clearance. The dashboard uses derived context and links.

## Record and submit

1. Review `WRITEUP.md` and `CLAIMS_EVIDENCE.md`; retain the model's limitations and
   the inspection's zero assumed direct uplift.
2. Record `VIDEO_SCRIPT.md` in two minutes or less. Confirm playback, audio and
   text legibility; the script is prepared, not a recorded video.
3. Include `AI_DISCLOSURE.md`, the dashboard link or file, code, appendix and the
   priced action plan. Main write-up is under 400 words; the appendix is separate.
4. Approve any repository push and any visibility change yourself if a public code
   link is needed. No credentials belong in the submission.
5. Submit on Devpost and preserve the confirmation. A locally working bundle does
   not establish a completed submission.

## Deadlines and refresh

The project brief sets feature freeze at **Sunday November 8, 2026, 8:00 AM CST**,
submission by **11:30 AM CST**, and hacking end at noon. Confirm the event's live
Devpost deadlines yourself. After feature freeze, make bug fixes only.

The verified release is `0.9.0-draft`, data repository commit
`5f9274bdc3efa6614e6c081becaeadda34c57a32`. Before final submission, refresh the
official data checkout and inspect changes. If values change, rerun the README
analysis commands and checks, regenerate the appendix, review every written
number, then rebuild the ZIP. This avoids submitting stale draft-release claims.

## Verification limits

Dataset hashes, all CSV/Parquet pairs, accounting invariants, analysis tests and
local HTTP browser interactions were checked, including a narrow-screen layout.
The browser tool blocks file URLs, so directly opening the offline file remains
a human check; the bundle uses ordinary local scripts and no fetch calls or CDN.
Public anonymous access, the recorded
video and Devpost receipt cannot be verified before the human completes them.
The plan's simulated action has not been executed, and none of its conditional
benefits are claimed as measured treatment effects.
