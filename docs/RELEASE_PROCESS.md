# Release Process

## Purpose

Define a repeatable release workflow for ZonForge Sentinel without fabricating version history.

## Current Strategy

Until formal tag cadence is introduced:

- Maintain [CHANGELOG.md](../CHANGELOG.md) with `Unreleased` plus historical milestones.
- Promote validated commits on `main` as release candidates.
- Create tags only when maintainers explicitly approve a release cut.

## Release Readiness Checklist

1. Required local platform path is healthy.
2. Critical docs are up to date.
3. Proof artifacts exist for runtime-affecting changes.
4. Security-impacting changes are reviewed.
5. Changelog updated with meaningful entry.

## Proposed Release Flow

1. Prepare release PR (changelog + docs + verification evidence).
2. Merge into `main` after review.
3. Create Git tag from validated merge commit.
4. Publish GitHub Release with categorized notes.
5. Announce release scope and known limitations.

## Release Notes Categorization

Release note categories are configured in [/.github/release.yml](../.github/release.yml).

## Non-Goals

- This document does not claim branch protection or deployment gates are auto-enforced.
- Operator-level controls are documented in [docs/BRANCH_PROTECTION_CHECKLIST.md](BRANCH_PROTECTION_CHECKLIST.md).
