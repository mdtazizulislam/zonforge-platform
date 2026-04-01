# SERIAL 03.1 - JWT CI Guard Proof (2026-04-01)

## Goal

Prevent JWT secret fallback/default behavior from re-entering backend production code via CI enforcement on pull requests.

## Implemented Changes

1. CI workflow guard
- Updated `.github/workflows/pr-check.yml`
- Added job: `JWT Secret Regression Guard`
- Command executed in CI: `npm run security:jwt-guard`

2. Deterministic scan script
- Added `scripts/security/jwt-secret-guard.cjs`
- Targeted backend files include:
  - `apps/backend/src/auth.ts`
  - `apps/backend/src/index.ts`
  - related backend security/config files when present
- Fails on:
  - env fallback/default secret patterns
  - placeholder/default secret literals
  - hardcoded JWT secret assignments
  - weak production min-length checks below 64

3. Package script
- Updated `package.json`
- Added script: `security:jwt-guard`

4. Security docs note
- Updated `docs/SECURITY.md`
- Added rule section with remediation steps

## Required Proof

### A) Intentional failing example (expected fail)

Bad sample file:
- `proof/runs/f22-jwt-guard-intentional-fail-example.ts`

Command:
- `node scripts/security/jwt-secret-guard.cjs --path proof/runs/f22-jwt-guard-intentional-fail-example.ts`

Result:
- Exit code: `1`
- Output includes:
  - `FAILED: JWT secret regression risk detected.`
  - rule hits for fallback/default pattern and placeholder literal
- Raw output artifacts:
  - `proof/runs/f22-jwt-guard-fail-output-20260401.txt`
  - `proof/runs/f22-jwt-guard-fail-output-20260401.exitcode.txt`

### B) Passing proof on current main code (expected pass)

Command:
- `npm run security:jwt-guard`

Result:
- Output:
  - `[jwt-secret-guard] PASS: No JWT secret fallback/default regressions detected.`
  - `[jwt-secret-guard] Scanned 3 file(s).`
- Exit code: `0`
- Raw output artifacts:
  - `proof/runs/f22-jwt-guard-pass-output-20260401.txt`
  - `proof/runs/f22-jwt-guard-pass-output-20260401.exitcode.txt`

## Notes

- Guard is deterministic (regex rules, fixed file targets, no network calls).
- Guard is lightweight and safe for PR pipeline usage.
- Existing build/deploy jobs were not modified.
