# Security Response Process

## Goal

Provide a consistent response workflow for reported vulnerabilities.

## Intake

Current intake channel:

- GitHub issue marked as security-related

If sensitive detail is required, keep public issue details minimal and coordinate follow-up with maintainers.

## Triage Phases

1. Acknowledge report.
2. Validate reproducibility.
3. Assess impact and scope.
4. Classify severity (Critical/High/Medium/Low).
5. Plan mitigation and release path.

## Response Targets

Recommended internal targets:

- Initial acknowledgement: as soon as practical.
- Triage decision: as soon as practical after reproduction.
- Mitigation plan: based on severity and risk.

These are guidance targets, not contractual SLAs.

## Fix and Disclosure

1. Prepare fix branch and tests/proof artifacts.
2. Merge fix through standard PR review path.
3. Update changelog and release notes.
4. Disclose issue details after remediation is available.

## Coordination Artifacts

- [SECURITY.md](../SECURITY.md)
- [CHANGELOG.md](../CHANGELOG.md)
- [docs/RELEASE_PROCESS.md](RELEASE_PROCESS.md)
