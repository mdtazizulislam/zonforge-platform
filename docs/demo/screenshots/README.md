# Screenshot Capture Guide

Expected screenshot filenames:

- `dashboard-home.png`
- `dashboard-health.png`
- `services-running.png`
- `health-check-proof.png`
- `ai-intelligence-or-module-proof.png`

## Capture Workflow (Windows)

1. Start required platform path (`npm run dev:required`).
2. Run health script (`./scripts/demo-health-check.ps1`).
3. Open dashboard (`http://localhost:5173`).
4. Use Snipping Tool or equivalent to capture images.
5. Save files with exact names above into this directory.

## Current Status

This directory now contains real PNG captures from a running local environment.

Capture provenance:

- `dashboard-home.png`: `http://localhost:5173`
- `dashboard-health.png`: `http://localhost:3000/health`
- `services-running.png`: rendered from live `Get-Job` and listening port output
- `health-check-proof.png`: rendered from live required-path health-check output
- `ai-intelligence-or-module-proof.png`: `http://localhost:3015/health`

Support files used during capture are located in `_capture/`.

## Limitations

- Some captures are proof-render pages created from live command output rather than direct native terminal-window screenshots.
- This keeps the captures reproducible and repository-native while remaining truthful to real runtime state.
