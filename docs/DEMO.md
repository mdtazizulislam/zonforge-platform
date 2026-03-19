# Demo Guide

## Demo Goal

Show a credible, repeatable local demonstration of the required ZonForge Sentinel platform path.

## Demo Preconditions

1. Infrastructure running (`npm run infra:up`).
2. Required build complete (`npm run build:required`).
3. Required services running (`npm run dev:required`).
4. Dashboard reachable (`http://localhost:5173`).

## Demo Walkthrough (10-15 minutes)

1. Show service startup command and terminal session.
2. Run health validation for all required ports.
3. Open dashboard and show initial load.
4. Send a sample ingest event request to ingestion service.
5. Show API response and explain downstream processing path.
6. Review proof artifacts and verification files.

## Commands

```powershell
./scripts/demo-start-required.ps1 -BuildOnly
./scripts/demo-start-required.ps1 -NoBuild
./scripts/demo-health-check.ps1
```

## Sample API Call

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/v1/events/ingest" `
  -Method Post `
  -ContentType "application/json" `
  -Body (Get-Content "docs/demo/api/ingest-event-request.json" -Raw)
```

## Demo Artifacts

- API examples: `docs/demo/api/*`
- Screenshot set: `docs/demo/screenshots/*`
- Architecture diagrams: `docs/demo/architecture/*`
- Local verification report: `proof/runs/2026-03-19_local-dev-boot-fix.md`

## Visual Artifact Inventory

1. `docs/demo/screenshots/dashboard-home.png`
2. `docs/demo/screenshots/dashboard-health.png`
3. `docs/demo/screenshots/services-running.png`
4. `docs/demo/screenshots/health-check-proof.png`
5. `docs/demo/screenshots/ai-intelligence-or-module-proof.png`

All files above were captured from a running local platform path in this repository context.

## Capture Method

- Runtime verified first using `./scripts/demo-health-check.ps1`.
- Web/API screenshots captured from live local endpoints.
- Services and health-proof visuals captured from live command output rendered into capture pages under `docs/demo/screenshots/_capture/`.

## Architecture Layer

- Diagram markdown: `docs/demo/architecture/zonforge-platform-architecture.md`
- Mermaid source: `docs/demo/architecture/zonforge-platform-architecture.mmd`

## Demo Truth Policy

- Captured outputs must be real command output.
- Synthetic examples are explicitly labeled as demo samples.
- Optional services are not presented as verified unless separately validated.
