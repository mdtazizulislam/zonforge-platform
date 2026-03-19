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

## Runtime Security Considerations

- Validate auth middleware coverage for gateway and service endpoints.
- Ensure production deployment uses TLS and secure key management.
- Keep Redis and database access policy aligned with least privilege.

## Disclosure

If a vulnerability is identified, report it through repository issue workflow with sensitive details redacted from public channels.
