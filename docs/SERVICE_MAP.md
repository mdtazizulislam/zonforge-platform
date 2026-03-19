# Service Map

## Required Local Platform Path

| Type | Service | Package | Port | Required for minimum local success |
|---|---|---|---:|---|
| Shared Package | Shared Types | `@zonforge/shared-types` | N/A | Yes |
| Shared Package | Logger | `@zonforge/logger` | N/A | Yes |
| Shared Package | Config | `@zonforge/config` | N/A | Yes |
| Shared Package | Auth Utils | `@zonforge/auth-utils` | N/A | Yes |
| Shared Package | Event Schema | `@zonforge/event-schema` | N/A | Yes |
| Shared Package | DB Client | `@zonforge/db-client` | N/A | Yes |
| Core Service | API Gateway | `@zonforge/api-gateway` | 3000 | Yes |
| Core Service | Ingestion Service | `@zonforge/ingestion-service` | 3001 | Yes |
| Core Service | Normalization Worker | `@zonforge/normalization-worker` | 3002 | Yes |
| Core Service | Detection Engine | `@zonforge/detection-engine` | 3003 | Yes |
| Core Service | Threat Intel Service | `@zonforge/threat-intel-service` | 3005 | Yes |
| Core Service | Correlation Engine | `@zonforge/correlation-engine` | 3006 | Yes |
| Core Service | Risk Scoring Engine | `@zonforge/risk-scoring-engine` | 3007 | Yes |
| Core Service | Alert Service | `@zonforge/alert-service` | 3008 | Yes |
| AI Service | AI SOC Analyst | `@zonforge/ai-soc-analyst` | 3015 | Yes |
| AI Service | Behavioral AI | `@zonforge/behavioral-ai` | 3020 | Yes |
| AI Service | Alert Triage AI | `@zonforge/alert-triage-ai` | 3021 | Yes |
| AI Service | Security Assistant | `@zonforge/security-assistant` | 3022 | Yes |
| UI | Web Dashboard | `@zonforge/web-dashboard` | 5173 | Yes |

## Optional Services (Examples)

These are not required for the minimum verified local success path and may require separate setup/build validation:

- `@zonforge/auth-service`
- `@zonforge/sso-service`
- `@zonforge/board-reports`
- `@zonforge/compliance-reports`
- `@zonforge/redteam-simulation`
- `@zonforge/supply-chain-intel`
- `@zonforge/anomaly-service` (Python runtime)
- `@zonforge/mobile-app` (Expo workflow)

## Notes

- Required path is verification-first and intentionally scoped.
- Optional services should be validated incrementally with explicit proof.
