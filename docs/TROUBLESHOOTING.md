# Troubleshooting

## Quick Checks

1. Confirm you are in repo root.
2. Confirm Docker containers are healthy.
3. Confirm `.env.local` exists in repo root.
4. Confirm required services were built (`npm run build:required`).

## Common Issues

### 1) `dist/index.js` missing

Cause:

- Service was started with `dev` before build output existed.

Resolution:

```powershell
npm run build:required
npm run dev:required
```

### 2) BullMQ error: `Queue name cannot contain :`

Cause:

- BullMQ queue names include colon characters.

Known fixed services:

- `apps/behavioral-ai/src/index.ts`
- `apps/ai-soc-analyst/src/index.ts`

Resolution pattern:

- Use dash-separated queue names for BullMQ queues.
- Keep Redis channel names separate from BullMQ queue naming constraints.

### 3) Port already in use (`EADDRINUSE`)

Cause:

- Existing process already listening on required port.

Resolution:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Repeat with affected port.

### 4) Redis warning: eviction policy not ideal

Warning:

- `IMPORTANT! Eviction policy is allkeys-lru. It should be "noeviction"`

Impact:

- Usually non-blocking for local demo, but not recommended for queue reliability.

Resolution:

```powershell
redis-cli CONFIG SET maxmemory-policy noeviction
```

### 5) Health check failures

Resolution sequence:

1. Run `./scripts/demo-health-check.ps1`.
2. Inspect logs for failed service.
3. Rebuild affected service and dependencies.
4. Restart required services.

## Escalation Artifacts

Attach these when reporting issues:

- `git status --short`
- `git diff --stat`
- `./scripts/demo-health-check.ps1` output
- Relevant service logs
