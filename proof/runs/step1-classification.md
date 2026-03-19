# Step 1 — Root cause classification (observed / inferred)

| package/service | required min? | build script? | dev script? | dev requires dist? | failure class | action taken |
|-----------------|---------------|----------------|-------------|-------------------|---------------|----------------|
| @zonforge/shared-types | yes | yes | no | n/a | — | included in `build:required` |
| @zonforge/logger | yes | yes | no | n/a | — | included in `build:required` |
| @zonforge/config | yes | yes | no | n/a | — | included in `build:required` |
| @zonforge/auth-utils | yes | yes | no | n/a | — | included in `build:required` |
| @zonforge/event-schema | yes | yes | no | n/a | — | included in `build:required` |
| @zonforge/db-client | yes | yes | no | n/a | — | included in `build:required` |
| @zonforge/ingestion-service … api-gateway (8 core) | yes | yes | yes | yes | missing build artifact | `build:required` + `dev:required` |
| @zonforge/behavioral-ai, alert-triage-ai, ai-soc-analyst, security-assistant | yes | yes | yes | yes | missing build artifact | same |
| @zonforge/web-dashboard | yes | yes | yes | no (Vite) | missing upstream / optional | `build:required` includes dashboard build |
| Optional apps (poc-manager, sso-service, …) | no | yes | yes | yes | missing build artifact | out of minimum path; use full `npm run build` or per-app `npm run build` before `npm run dev` |
| collectors/* (m365, aws, google) | no* | yes | yes | yes | wrong env file path | fixed `--env-file` to `../../.env.local` |

\*Not in the user’s required platform list; fixed so collector dev does not point outside the repo.

**Classes used**

- **missing build artifact** — `dev` runs `node … dist/index.js` without a prior `tsc` output.
- **wrong env file path** — `--env-file=../../../.env.local` from `collectors/<name>` resolves above monorepo root.
- **missing root DX script** — addressed by documenting/using `build:required` and `dev:required` (root already had `dev:backend`, `dev:dashboard`, etc. in this tree).
