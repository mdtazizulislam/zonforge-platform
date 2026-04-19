# PRE-SERIAL REPO ROOT LOCK

- Date: 2026-04-08
- Canonical active repo root: `C:\Users\vitor\Downloads\zonforge-sentinel-v4.6.0_1\zonforge-platform-main-release`
- Git storage root: `C:\Users\vitor\Downloads\zonforge-sentinel-v4.6.0_1\zonforge-platform\.git`
- Repo model: `zonforge-platform-main-release` is the active Git worktree root; `zonforge-platform` holds the shared `.git` directory for all attached worktrees.
- Outer workspace folder: `C:\Users\vitor\Downloads\zonforge-sentinel-v4.6.0_1` is a wrapper/download container, not a Git repo.

## Backend Environment Source

- Local backend runtime env file: `C:\Users\vitor\Downloads\zonforge-sentinel-v4.6.0_1\zonforge-platform-main-release\apps\backend\.env`
- Proof script env file: `apps/backend/scripts/serial17-subscription-proof.ts` explicitly loads `../.env`, which resolves to `apps/backend/.env` in this worktree.
- Backend build env file: none. `apps/backend/package.json` uses `tsc` for `build`, so compile time does not load dotenv.
- Production backend env source: Railway service variables for the backend deployment.

## Command Lock

Use only this root for future work:

```powershell
git -C C:\Users\vitor\Downloads\zonforge-sentinel-v4.6.0_1\zonforge-platform-main-release <command>
npm --prefix C:\Users\vitor\Downloads\zonforge-sentinel-v4.6.0_1\zonforge-platform-main-release <command>
Push-Location C:\Users\vitor\Downloads\zonforge-sentinel-v4.6.0_1\zonforge-platform-main-release
```

Do not run future repository work from the outer wrapper folder or from sibling worktrees unless a task explicitly targets a different branch/worktree.