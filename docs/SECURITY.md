# Security Notes

## Scope

Security guidance for local development and repository hygiene.

## Secret Handling

- Do not commit `.env.local`.
- Use local-only credentials for development.
- Rotate any credential accidentally exposed during testing.

## Local Infrastructure Baseline

- Run local dependencies in isolated Docker containers.
- Restrict network exposure of local ports where possible.
- Prefer least-privilege credentials for database and API keys.

## Repository Hygiene

- Keep `.gitignore` and secret patterns up to date.
- Use PR review for security-relevant changes.
- Keep dependency versions reviewed and patched.

## CI Rule: JWT Secret Regression Guard

Pull requests run a deterministic JWT guard to prevent reintroducing unsafe secret handling in backend production code.

- Guard command: `npm run security:jwt-guard`
- Script: `scripts/security/jwt-secret-guard.cjs`
- Primary target files:
	- `apps/backend/src/auth.ts`
	- `apps/backend/src/index.ts`
	- Related backend security/config files

The check fails if backend source includes:

- Fallback/default patterns like `process.env.JWT_SECRET || '...'`
- Hardcoded JWT secret assignments
- Placeholder/weak secret literals used in production code
- Production minimum-length checks below 64 characters

How to fix violations:

1. Read JWT secrets from environment only.
2. Remove hardcoded and placeholder secret values from production source.
3. Keep production JWT minimum-length validation at 64 or higher.

## Runtime Security Considerations

- Validate auth middleware coverage for gateway and service endpoints.
- Ensure production deployment uses TLS and secure key management.
- Keep Redis and database access policy aligned with least privilege.

## Disclosure

If a vulnerability is identified, report it through repository issue workflow with sensitive details redacted from public channels.
