# Verification Index

## Purpose

Index of concrete verification artifacts and command outputs for local platform reliability.

## Current Verified Artifact

1. `proof/runs/2026-03-19_local-dev-boot-fix.md`

Contains:

- Baseline discovery output
- Root cause classification table
- Exact file-level fixes applied
- Build proof for required packages/services
- Health-check proof for required ports
- Dashboard response proof
- Final pass/fail verdict for required vs optional path

## Core Verification Commands

```powershell
npm run build:required
npm run dev:required
./scripts/demo-health-check.ps1
```

## Required Health Ports

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

## Dashboard Verification

- URL: `http://localhost:5173`
- Expected: HTTP 200 from local Vite server

## Integrity Notes

- Verification claims must reference reproducible commands.
- Demo samples in `docs/demo/api` are labeled and intended for local demonstration only.
