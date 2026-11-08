# Vercel deployment

## Latest release: November 7, 2026 at 9:32 PM America/Chicago

- Pulled `origin/main` at `7035c02` and merged cleanly into local main as `f631974`, preserving deployment and diagnostic records. The enhanced `web/` source matches the fetched commit exactly.
- Published production deployment `dpl_8PHMdn9xpU12WbsGpxLUJXbkZ1sG`; Vercel confirms Ready and assigns https://gilded-ace-dashboard.vercel.app/ to this release.
- Inspector: https://vercel.com/chetansai2003-7922s-projects/gilded-ace-dashboard/8PHMdn9xpU12WbsGpxLUJXbkZ1sG
- Fresh prebuilt artifact directory: `C:\Users\asus\Desktop\MS\Datathon\outputs\gilded-ace-vercel-release-7035c02`.
- Artifact contains 25 static files totaling 32,287,530 bytes. All 25 uploaded SHA-1 hashes match the tested local build. The retired video and poster are absent.
- Validation passed: 8 budget tests; 13,616 calculation/placement assertions; seven-route interaction checks; storytelling checks; cinematic and particle lifecycle checks; exact aggregation parity for 72 real-data scopes plus 5 location edge cases; TypeScript/Vite production build and offline packaging. Vite retains its non-blocking large-chunk warning.
- Browser QA verified automatic opening/handoff, visible tumbling cards, pause/resume/replay, the new ten-machine floor story and decision step, and return to the overview. No captured browser runtime errors. The updated local preview remains open at http://127.0.0.1:4173/#verdict.
- Public browser verification remains limited by the current network: DNS still resolves the production hostname to Cisco Umbrella's `146.112.61.104` block page. No network settings or certificate checks were changed.

## Initial release

Published November 7, 2026 at 7:51 PM America/Chicago after the user explicitly requested Vercel hosting and stopping existing hosted apps.

- Production: https://gilded-ace-dashboard.vercel.app/
- Project: `gilded-ace-dashboard`
- Account scope: `chetansai2003-7922s-projects`
- Project ID: `prj_Y3crsPJTkqCXuiisx9Syi6SbMeLs`
- Deployment: `dpl_BdWPfvsDbCDAxBT3sBDJDYi4zaD1`
- Inspector: https://vercel.com/chetansai2003-7922s-projects/gilded-ace-dashboard/BdWPfvsDbCDAxBT3sBDJDYi4zaD1
- Source checkout at release: `3428970`; dashboard source pulled from `origin/main` at `313186a`.

## Existing apps

Both previous projects were paused with Vercel's project pause API and independently checked through the project listing:

| Project | Confirmed state |
| --- | --- |
| `together-for-reed` | `paused: true` |
| `ai-podcast-clipper-frontend` | `paused: true` |

Pausing preserves these projects. They can be resumed from their Vercel project settings. See [Vercel project management](https://vercel.com/docs/projects/managing-projects).

## Release method

The enhanced React/Vite app lives in `web/`. Its production build contains 27 static files, totaling 38,985,692 bytes, including the offline HTML, JSON exports, evidence documents, fonts, and video. It requires no server or environment variables.

The initial source deployment was blocked by Vercel's Hobby Git-author check (`TEAM_ACCESS_REQUIRED`): the current commit author was not verified for the signed-in owner. The final release used the authenticated owner's supported prebuilt artifact workflow. Git history, commit attribution, and account permissions were unchanged.

The release directory is outside the Git checkout:

`C:\Users\asus\Desktop\MS\Datathon\outputs\gilded-ace-vercel-release-20261107`

Its `.vercel/output/config.json` contains `{"version":3}`. Its `.vercel/output/static/` contains only the compiled `web/dist/` files. Local `.vercel/project.json` links this artifact directory to the existing project. Do not commit local Vercel metadata or credentials.

For a future release, rebuild with Node 24 and the committed lockfile, copy the new `web/dist/` into a fresh artifact directory using the same structure, link it to the existing project, and deploy:

```powershell
vercel.cmd link --cwd <artifact-directory> --yes --project gilded-ace-dashboard --scope chetansai2003-7922s-projects
vercel.cmd deploy --cwd <artifact-directory> --prebuilt --prod --yes --project gilded-ace-dashboard --scope chetansai2003-7922s-projects
```

See [Build Output API](https://vercel.com/docs/build-output-api) and [prebuilt deployments](https://vercel.com/docs/cli/deploy#prebuilt).

The repository's `vercel.json` also defines source-build settings: install `npm ci --prefix web --no-audit --no-fund`, build `npm run build`, output `dist`. `.vercelignore` excludes raw challenge data, coordination records, other applications, dependency trees, and credentials. Source deployments still require resolving the Git-author verification described above. Git auto-deployment was not configured during this release.

## Verification

- Vercel reports production deployment `READY` and assigns `gilded-ace-dashboard.vercel.app` to it.
- Vercel's uploaded-file API lists all 27 static files. Every returned SHA-1 equals the corresponding local `web/dist/` file hash.
- Both older projects remain paused in the final account listing.
- The same build passed local TypeScript/Vite compilation and rendered successfully on the local preview in the preceding task.
- Public browser verification was attempted but blocked by `ERR_CERT_AUTHORITY_INVALID`; Windows HTTPS requests also reported an untrusted certificate root. No certificate validation was disabled. Rendered public-page and anonymous HTTP checks therefore remain unverified from this environment.

## Privacy-warning diagnosis, November 7 at 7:57 PM

The current Wi-Fi DNS resolves `gilded-ace-dashboard.vercel.app` to `146.112.61.104`. Both previously hosted Vercel app hostnames resolve to the same address. [Cisco identifies this address as its Domain List Block Page](https://www.cisco.com/c/en/us/support/docs/security/umbrella/224799-learn-the-umbrella-block-page-ip.html).

A TLS handshake inspection with OpenSSL `-verify_return_error` found a leaf certificate for the dashboard issued by `Cisco Umbrella Secondary SubCA dfw-SG`, chaining through Cisco Umbrella Primary SubCA to Cisco Umbrella Root CA. Verification failed with `unable to get local issuer certificate`. The connection is reaching Cisco's network-policy block page, and its certificate is not trusted by the local browser. The block address does not establish a malware, phishing, or content-category classification.

Vercel still reports the deployed release Ready. The local preview at `http://127.0.0.1:4173/` returns HTTP 200. Public rendering remains unverified from this filtered connection.

Resolution requires the network administrator to review the domain-list rule and approve access to the dashboard hostname. [TAMU Help Desk Central](https://it.tamu.edu/help/) can be contacted at `helpdesk@tamu.edu` or `979-845-8300`. No ticket was submitted, certificates installed, resolver settings changed, or browser warnings bypassed during diagnosis.
