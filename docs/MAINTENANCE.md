# Maintenance Guide

## Purpose

Define how to keep repository quality, docs, demo assets, and governance artifacts current.

## Maintenance Cadence

Recommended cadence:

- Per PR: verify scope, docs impact, and proof requirements.
- Weekly: review open issues/PR health and workflow failures.
- Monthly: review changelog quality and stale branches.
- Quarterly: review governance, security process docs, and branch protection settings.

## Ongoing Tasks

1. Keep [CHANGELOG.md](../CHANGELOG.md) current.
2. Keep demo assets in [docs/demo](demo) aligned with real product state.
3. Ensure README references remain valid.
4. Keep contribution/governance/security docs synchronized.
5. Remove or refresh stale screenshots and proof captures when UI/flows change.

## Demo Asset Maintenance

When runtime/UI changes affect evidence:

- Recapture relevant screenshots.
- Update [docs/demo/screenshots/README.md](demo/screenshots/README.md).
- Document capture date and source path.

## Release Hygiene

- Follow [docs/RELEASE_PROCESS.md](RELEASE_PROCESS.md).
- Ensure PR notes map to release-note categories.
- Keep historical changelog entries factual and audit-friendly.

## Risk Controls

- Avoid large mixed-scope PRs.
- Keep non-breaking policy as default.
- Require proof artifacts for runtime-impacting changes.
