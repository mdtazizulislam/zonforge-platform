# Contributing Guide

Thank you for contributing to ZonForge Sentinel.

This repository follows a proof-first, non-breaking contribution model.

## Core Contribution Principles

- Keep changes non-breaking by default.
- Do not refactor runtime/business logic unless clearly justified.
- Preserve the verified local startup path unless an approved fix requires change.
- Update docs/demo/proof artifacts when behavior or workflows change.

## Branch Workflow

1. Sync local `main` from `origin/main`.
2. Create a focused branch using a descriptive prefix:
   - `fix/...`
   - `docs/...`
   - `chore/...`
3. Keep branch scope tight and reviewable.
4. Open a PR into `main`.

## Pull Request Standards

Every PR should include:

- Clear summary of change and reason.
- Explicit scope and impact statement.
- Validation commands and high-signal output.
- Proof artifacts for runtime/dev workflow changes.
- Updated docs where applicable.

Use [/.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md).

## Proof-First Expectations

For runtime or DX changes, provide:

- `git status --short`
- `git diff --stat`
- Build/startup command outputs
- Health verification outputs if services are affected
- Links to proof files under `proof/runs/` when relevant

## Non-Breaking Change Policy

- Additive changes are preferred.
- Avoid large unrelated refactors.
- Keep service APIs and startup flow stable unless change is intentional and documented.

## Documentation and Demo Expectations

If a change affects onboarding, operation, or runtime evidence:

- Update [README.md](README.md)
- Update relevant docs under [docs](docs)
- Update demo layer under [docs/demo](docs/demo) if screenshots/flows are impacted

## Security Reporting

For vulnerability disclosure and response workflow, see:

- [SECURITY.md](SECURITY.md)
- [docs/SECURITY_RESPONSE_PROCESS.md](docs/SECURITY_RESPONSE_PROCESS.md)
