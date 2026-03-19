# Repository Governance

## Governance Scope

This document defines repository maintenance expectations, ownership model, and decision pathways.

## Ownership Model

- Path ownership is defined in [CODEOWNERS](../CODEOWNERS).
- The repository owner is the current default maintainer of all paths.
- Team-level owners can be introduced later without changing governance principles.

## Decision Principles

- Stability first: avoid breakage of verified runtime path.
- Proof first: require command output and reproducible evidence for critical changes.
- Scope discipline: keep PRs focused and reviewable.
- Transparency: document limitations and operator dependencies explicitly.

## Change Classes

1. Runtime changes: require build/start/health proof.
2. Documentation/demo changes: require link and asset validation.
3. Governance/process changes: require consistency with CONTRIBUTING and SECURITY policy.

## Review and Merge Expectations

- CODEOWNER review required for owned paths.
- PR template sections should be completed with meaningful content.
- Breaking changes must be explicitly labeled and justified.
- Merge only after validation evidence is provided.

## Operator-Managed Controls

Repository files cannot enforce all controls. Operator configuration is required for:

- Branch protection
- Required status checks
- Required approvals
- Secret scanning and security settings

See [docs/BRANCH_PROTECTION_CHECKLIST.md](BRANCH_PROTECTION_CHECKLIST.md).
