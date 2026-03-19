# Local Development Guide

## Objective

Run the required ZonForge Sentinel local platform path reliably on Windows PowerShell without breaking optional services.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop
- PowerShell 7+ (recommended)

## Environment

1. Copy environment template if needed:

```powershell
Copy-Item .env.example .env.local
```

2. Ensure required values in `.env.local` are set for local development.

## Start Infrastructure

```powershell
npm run infra:up
```

This starts:

- PostgreSQL
- Redis
- ClickHouse

## Build Required Platform Path

```powershell
npm run build:required
```

This includes required shared packages, required core runtime services, required AI services, and web dashboard build prerequisites.

## Start Required Platform Path

```powershell
npm run dev:required
```

Equivalent helper script:

```powershell
./scripts/demo-start-required.ps1
```

## Verify Health

```powershell
./scripts/demo-health-check.ps1
```

Expected required ports:

- 3000
- 3001
- 3002
- 3003
- 3005
- 3006
- 3007
- 3008
- 3015
- 3020
- 3021
- 3022

Dashboard:

- `http://localhost:5173`

## Required vs Optional

Required local success path is documented in `README.md` and `docs/SERVICE_MAP.md`.

Optional services may require independent builds and are intentionally not blocking the minimum local platform workflow.
