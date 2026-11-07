# Dashboard Royale setup

Challenge 2 in the [official challenge list](https://tamudatathon.com/challenges/2). Keep this folder as its own Git repository and open each challenge in a separate agent session.

## Current state

- The official starter/data repository is already cloned into `data/dashboard-royale/`.
- The outer repository contains the task board, toolkit, `src/metrics.py`, and seven existing metric tests. Preserve that work and its Git history.
- All seven metric tests passed on November 7, 2026, in 2.79 seconds. The checks compare against the official floor totals and cover ratio-of-sums calculations, off-floor exclusions, date filtering, daylight saving time, and payout variance.
- A dashboard application has not yet been implemented. The test result verifies the existing metrics module, not a finished dashboard or submission.

## Official source and pinned version

| Item | Value |
|---|---|
| Challenge | <https://tamudatathon.com/challenges/2> |
| Official guide | <https://github.com/tamu-datathon-org/dashboard-royale/blob/main/GUIDE.md> |
| Starter repository | <https://github.com/tamu-datathon-org/dashboard-royale.git> |
| Pinned commit | `4a06b97f8a9dfb57204bd8a29a40e7e2e0376923` |
| Local starter/data path | `data/dashboard-royale/` |
| Guide in the pinned clone | `data/dashboard-royale/GUIDE.md` |
| Data reference | `data/dashboard-royale/reference/DATASET.md` |
| Machine-readable record | [starter-manifest.json](starter-manifest.json) |

The guide still shows `dashboard-casino` in its clone example. The challenge page links to `dashboard-royale`, which is the source of the current local clone. The pinned guide labels the data release `0.9.0-draft`; check organizer announcements before adopting any newer release.

The entire nested clone is ignored by the outer repository. The data is already present on this laptop, but a fresh clone of this project requires a separate data download. No datasets, generated outputs, model files, or keys should be added to the outer repository.

For a fresh checkout only, run these commands from the challenge folder when `data/dashboard-royale` does not exist:

```powershell
git clone --no-checkout --depth 1 https://github.com/tamu-datathon-org/dashboard-royale.git data/dashboard-royale
git -C data/dashboard-royale fetch --depth 1 origin 4a06b97f8a9dfb57204bd8a29a40e7e2e0376923
git -C data/dashboard-royale checkout --detach 4a06b97f8a9dfb57204bd8a29a40e7e2e0376923
git -C data/dashboard-royale rev-parse HEAD
```

Do not rerun the clone or checkout commands over the existing data folder. The last command should print the pinned commit above.

## Python and verification

Use the shared Python environment without modifying it:

```powershell
& 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe' -B -m pytest tests -q -p no:cacheprovider
```

The expected current result is `7 passed`. This command reads the official data locally; it does not require account credentials or a hosted service.

Treat the shared `.venv` as read-only during parallel work. Follow `AGENTS.md` and record a `coord.py decide` entry before any approved shared-environment change. Use a challenge-local environment for incompatible dependencies. Keep API keys in the workspace-level `.env`, outside every challenge repository.

## Parallel work

Read `AGENTS.md` and the challenge goal before making changes. Use a unique agent name and claim the relevant task:

```powershell
& 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe' coord.py brief
& 'C:\Users\asus\Desktop\MS\Datathon\.venv\Scripts\python.exe' coord.py claim --agent dashboard-agent-1
```

The board already records gpt-1 and claude-1 ownership lanes; respect those assignments. Add a scoped task for new work and claim its ID if the automatic claim would select someone else's assigned lane. When multiple agents edit code in this challenge, create a separate worktree with `coord.py worktree AGENT_NAME` and work only inside the claimed file scope. Worktrees can read the main checkout's data; `DR_DATA` can override the data directory if needed.

Reserve local dashboard port **8602** for this challenge, bound to `127.0.0.1`. If Streamlit is selected, configure `--server.port 8602 --server.address 127.0.0.1` when an entrypoint exists. No application is launched by setup.

Keep code in `src/`, source data in `data/`, experiment outputs in `outputs/`, and models in `runs/`. Limit shared GPU use to one training job at a time. Follow the board's note/done/fail workflow and do not replace another agent's pending changes.
