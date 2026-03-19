# ZonForge Sentinel — Security Hardening Guide

## Overview

This document describes all security controls implemented in ZonForge Sentinel.
Every control maps to a specific threat and has associated verification steps.

---

## Layer 1: Network Security

### mTLS (Mutual TLS)
- **Implementation**: Istio Service Mesh with `PeerAuthentication: STRICT`
- **Scope**: All service-to-service communication within the `zonforge` namespace
- **Certificate rotation**: Automatic, every 24 hours via Istio Citadel
- **Verification**: `istioctl experimental auth check <pod>`

### Network Policies (L3/L4)
- **Default**: Deny all ingress and egress
- **Explicitly allowed**: Intra-namespace, DNS, database ports, external HTTPS (collectors)
- **Verification**: `kubectl get networkpolicies -n zonforge`

### External TLS
- **Certificates**: cert-manager + Let's Encrypt wildcard via DNS-01
- **Protocol**: TLS 1.3 minimum (ELBSecurityPolicy-TLS13-1-2-2021-06)
- **HSTS**: `max-age=31536000; includeSubDomains; preload`
- **Renewal**: Automatic 30 days before expiry

---

## Layer 2: Application Security

### Authentication
- **JWT**: HS256, 15-minute access tokens, 7-day refresh tokens
- **JTI blocklist**: Redis-backed, instant invalidation on logout
- **Refresh token rotation**: New token issued on each refresh, old revoked
- **Reuse detection**: All refresh tokens revoked if reuse detected
- **MFA**: TOTP (RFC 6238) with ±1 window tolerance

### Authorization
- **RBAC**: 5 roles (PLATFORM_ADMIN, TENANT_ADMIN, SECURITY_ANALYST, READ_ONLY, API_CONNECTOR)
- **Tenant isolation**: `WHERE tenant_id = :tid` mandatory in every DB query
- **Feature gates**: Plan-level enforcement via `requireFeatureMiddleware()`
- **Quota checks**: Connector and rule limits enforced before every create

### Password Security
- **Hashing**: bcrypt with cost factor 12
- **Minimum strength**: Validated via `validatePasswordStrength()`
- **Timing attacks**: Dummy hash always run even if user not found

### API Keys
- **Format**: `sk_live_{prefix}_{random}` — prefix stored in DB, full key hashed
- **Storage**: SHA-256 hash only — raw key shown once on creation
- **Verification**: Constant-time comparison via `verifyApiKey()`

---

## Layer 3: Data Security

### Encryption at Rest
| Data | Encryption | Key |
|------|------------|-----|
| Connector credentials | AES-256-GCM | Tenant-specific DEK |
| PostgreSQL | AWS KMS (RDS) | Per-environment KMS key |
| ElastiCache | AWS KMS | Per-environment KMS key |
| S3 (events) | SSE-KMS | s3-{env} KMS key |
| S3 (audit/WORM) | SSE-KMS | Same KMS key |
| Secrets Manager | AWS KMS | Managed |

### Encryption in Transit
- External: TLS 1.3 (ALB)
- Internal: Istio mTLS (auto-rotated certificates)
- Database: SSL required in production
- Redis: TLS required in production

### Field-Level Encryption
- `connector.configEncrypted`: AES-256-GCM, IV stored alongside
- Key derivation: HKDF from master `ZONFORGE_ENCRYPTION_KEY`

---

## Layer 4: Audit & Compliance

### Audit Log
- **Hash chain**: SHA-256, every entry hashes previous entry
- **Tamper detection**: Chain verification on export + nightly automated check
- **WORM export**: S3 Object Lock COMPLIANCE mode, 7-year retention
- **Export schedule**: Nightly at 3 AM UTC per tenant

### Audit Events Captured
```
user.login / logout / login_failed
user.created / updated / deleted
tenant.created / updated / suspended
connector.created / updated / deleted
alert.status_changed / assigned / feedback
rule.created / updated / enabled / disabled
playbook.executed / approved / cancelled
api_key.created / revoked
settings.updated
billing.plan_changed
admin.tenant_suspended / data_purge
```

---

## Layer 5: Secrets Management

### Rotation Schedule
| Secret | Rotation | Method |
|--------|----------|--------|
| JWT secret | 30 days | AWS Secrets Manager auto |
| HMAC secret | 30 days | AWS Secrets Manager auto |
| API key salt | 90 days | AWS Secrets Manager auto |
| DB password | 30 days | AWS Secrets Manager auto |
| Redis auth | 90 days | AWS Secrets Manager auto |
| Encryption key | 365 days | Manual (requires re-encrypt) |
| KMS keys | Annual | AWS KMS auto |

### BYOK (Enterprise)
- Customer-managed KMS key accepted via `ZONFORGE_KMS_KEY_ARN`
- Key access verified on tenant activation
- Audit trail of all key usage via CloudTrail

---

## Layer 6: Runtime Security

### Pod Security
- Non-root user (UID 1001)
- Read-only root filesystem (`/tmp` mounted as emptyDir)
- No privilege escalation
- `ALL` capabilities dropped
- Seccomp: `RuntimeDefault`

### OPA Gatekeeper Policies
- Block `latest` image tags
- Require resource limits
- Block host namespaces
- Require non-root containers
- Block privileged containers

### Container Images
- Multi-stage builds (builder → production)
- Trivy CVE scan on every push (blocks on CRITICAL)
- Cosign image signing on release
- SBOM generated and stored as artifact
- ECR: scan_on_push enabled, lifecycle: keep 10 images max

---

## Layer 7: Rate Limiting & DDoS Protection

### Layers
1. **IP-based** (sliding window, 100 req/min default)
2. **User-based** (300 req/min per authenticated user)
3. **Endpoint-specific** (login: 10/min, register: 5/hour)
4. **Auto-block** (IP auto-blocked after 5× limit exceeded)
5. **Plan-based** (event ingestion limited by plan tier)

### Request Sanitization
- Max body size: 10MB
- Log injection prevention (newline in headers)
- Suspicious pattern detection (XSS, SQLi, path traversal)

---

## Incident Response Contacts

| Severity | Contact | SLA |
|----------|---------|-----|
| Critical (P1) | security@zonforge.com + on-call | 15 minutes |
| High (P2) | security@zonforge.com | 1 hour |
| Medium (P3) | security@zonforge.com | 4 hours |

---

## Verification Commands

```bash
# Verify mTLS is enforced
kubectl exec -n zonforge deploy/api-gateway -- curl -v http://auth-service:3100/health

# Check hardening status
curl -H "Authorization: Bearer $TOKEN" \
  https://api.zonforge.com/internal/security/hardening-check

# Verify audit chain integrity
curl -H "Authorization: Bearer $TOKEN" \
  -X POST https://api.zonforge.com/internal/security/verify-audit-chain \
  -d '{"tenantId":"...", "fromDate":"2024-01-01", "toDate":"2024-12-31"}'

# Check secrets rotation status
curl -H "Authorization: Bearer $TOKEN" \
  https://api.zonforge.com/internal/security/secrets-status

# Run Trivy scan
trivy image --severity CRITICAL,HIGH \
  $ECR_REGISTRY/zonforge/auth-service:sha-$(git rev-parse --short HEAD)
```
