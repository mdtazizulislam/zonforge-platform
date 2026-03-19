# Branch Protection Checklist (Operator Action)

## Important

This checklist documents GitHub repository settings that must be configured by a repository administrator.

These controls are not automatically enabled by repository files.

## Target Branch

- `main`

## Recommended Settings

1. Require pull request before merging.
2. Require at least one approval.
3. Dismiss stale approvals when new commits are pushed.
4. Require status checks to pass before merging.
5. Require conversation resolution before merging.
6. Restrict who can push directly to `main`.
7. Require linear history (optional, team preference).
8. Require signed commits (optional, if org policy mandates).
9. Enable secret scanning and push protection if available.

## Suggested Required Checks

Use actual workflow names from [/.github/workflows](../.github/workflows):

- CI / build verification
- PR checks
- Security checks

## Verification Procedure

After configuration:

1. Attempt direct push to `main` from a non-admin account.
2. Verify push is blocked and PR flow is enforced.
3. Open a test PR and verify required checks/approvals are enforced.

## Maintenance

Review protection settings at least quarterly or after major workflow changes.
