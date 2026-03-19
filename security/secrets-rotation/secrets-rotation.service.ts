import {
  SecretsManagerClient,
  RotateSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  ListSecretsCommand,
} from '@aws-sdk/client-secrets-manager'
import {
  KMSClient,
  EnableKeyRotationCommand,
  DescribeKeyCommand,
  GetKeyRotationStatusCommand,
  ListAliasesCommand,
} from '@aws-sdk/client-kms'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'secrets-rotation' })

// ─────────────────────────────────────────────
// SECRETS ROTATION SERVICE
//
// Automates rotation of:
//   1. JWT signing secret (30-day rotation)
//   2. API key salt (90-day rotation)
//   3. HMAC secret (30-day rotation)
//   4. Connector credentials (per-connector)
//
// Uses AWS Secrets Manager auto-rotation.
// KMS keys use automatic annual rotation.
// ─────────────────────────────────────────────

export interface SecretRotationConfig {
  secretName:           string
  automaticRotation:    boolean
  rotationDays:         number
  lambdaRotationArn?:   string    // for custom rotation logic
  requiresServiceRestart: boolean
}

export const MANAGED_SECRETS: SecretRotationConfig[] = [
  {
    secretName:           'zonforge/prod/jwt-secret',
    automaticRotation:    true,
    rotationDays:         30,
    requiresServiceRestart: true,   // needs auth-service rolling restart
  },
  {
    secretName:           'zonforge/prod/api-key-salt',
    automaticRotation:    true,
    rotationDays:         90,
    requiresServiceRestart: false,  // salt only used on key creation
  },
  {
    secretName:           'zonforge/prod/hmac-secret',
    automaticRotation:    true,
    rotationDays:         30,
    requiresServiceRestart: true,
  },
  {
    secretName:           'zonforge/prod/encryption-key',
    automaticRotation:    false,   // DEK rotation requires data re-encryption
    rotationDays:         365,
    requiresServiceRestart: true,
  },
  {
    secretName:           'zonforge/prod/db/password',
    automaticRotation:    true,
    rotationDays:         30,
    requiresServiceRestart: true,
  },
  {
    secretName:           'zonforge/prod/redis/auth-token',
    automaticRotation:    true,
    rotationDays:         90,
    requiresServiceRestart: true,
  },
]

export class SecretsRotationService {
  private readonly sm:  SecretsManagerClient
  private readonly kms: KMSClient

  constructor(region = 'us-east-1') {
    this.sm  = new SecretsManagerClient({ region })
    this.kms = new KMSClient({ region })
  }

  // ── Configure automatic rotation on all managed secrets ─────────

  async configureRotation(): Promise<{
    configured: number
    errors:     string[]
  }> {
    let   configured = 0
    const errors:     string[] = []

    for (const config of MANAGED_SECRETS) {
      if (!config.automaticRotation) continue

      try {
        const rotateCmd = new RotateSecretCommand({
          SecretId:                   config.secretName,
          RotationRules: {
            AutomaticallyAfterDays: config.rotationDays,
          },
          RotationLambdaARN: config.lambdaRotationArn,
        })

        await this.sm.send(rotateCmd)
        configured++
        log.info({
          secret:      config.secretName,
          rotateDays:  config.rotationDays,
        }, 'Automatic rotation configured')

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors.push(`${config.secretName}: ${msg}`)
        log.error({ err, secret: config.secretName }, 'Failed to configure rotation')
      }
    }

    return { configured, errors }
  }

  // ── Check rotation status for all managed secrets ────────────────

  async checkRotationStatus(): Promise<Array<{
    secretName:     string
    lastRotatedAt:  Date | null
    nextRotationAt: Date | null
    rotationEnabled: boolean
    daysSinceRotation: number | null
    overdue:        boolean
  }>> {
    const results = []

    for (const config of MANAGED_SECRETS) {
      try {
        const desc = await this.sm.send(
          new DescribeSecretCommand({ SecretId: config.secretName }),
        )

        const lastRotated  = desc.LastRotatedDate ?? desc.CreatedDate ?? null
        const daysAgo      = lastRotated
          ? Math.floor((Date.now() - lastRotated.getTime()) / 86_400_000)
          : null

        const nextRotation = lastRotated
          ? new Date(lastRotated.getTime() + config.rotationDays * 86_400_000)
          : null

        const overdue = config.automaticRotation && daysAgo !== null
          && daysAgo > config.rotationDays + 7   // 7-day grace period

        if (overdue) {
          log.warn({
            secret:   config.secretName,
            daysAgo,
            maxDays:  config.rotationDays,
          }, '⚠️  Secret rotation overdue')
        }

        results.push({
          secretName:         config.secretName,
          lastRotatedAt:      lastRotated,
          nextRotationAt:     nextRotation,
          rotationEnabled:    desc.RotationEnabled ?? false,
          daysSinceRotation:  daysAgo,
          overdue,
        })

      } catch (err) {
        log.error({ err, secret: config.secretName }, 'Failed to check secret status')
        results.push({
          secretName:         config.secretName,
          lastRotatedAt:      null,
          nextRotationAt:     null,
          rotationEnabled:    false,
          daysSinceRotation:  null,
          overdue:            false,
        })
      }
    }

    return results
  }

  // ── Ensure KMS key rotation is enabled ───────────────────────────

  async verifyKmsKeyRotation(): Promise<Array<{
    keyAlias:        string
    keyId:           string
    rotationEnabled: boolean
    keyState:        string
  }>> {
    const aliases = await this.kms.send(new ListAliasesCommand({
      Limit: 100,
    }))

    const results = []

    for (const alias of aliases.Aliases ?? []) {
      if (!alias.AliasName?.includes('zonforge')) continue
      if (!alias.TargetKeyId) continue

      try {
        const [keyDesc, rotStatus] = await Promise.all([
          this.kms.send(new DescribeKeyCommand({ KeyId: alias.TargetKeyId })),
          this.kms.send(new GetKeyRotationStatusCommand({ KeyId: alias.TargetKeyId })),
        ])

        const enabled = rotStatus.KeyRotationEnabled ?? false

        if (!enabled) {
          log.warn({
            keyAlias: alias.AliasName,
            keyId:    alias.TargetKeyId,
          }, '⚠️  KMS key rotation not enabled — enabling now')

          await this.kms.send(
            new EnableKeyRotationCommand({ KeyId: alias.TargetKeyId }),
          )
        }

        results.push({
          keyAlias:        alias.AliasName,
          keyId:           alias.TargetKeyId,
          rotationEnabled: true,   // we just enabled it if it wasn't
          keyState:        keyDesc.KeyMetadata?.KeyState ?? 'Unknown',
        })
      } catch (err) {
        log.error({ err, keyAlias: alias.AliasName }, 'Failed to check KMS key')
      }
    }

    return results
  }

  // ── Trigger immediate rotation for a secret ──────────────────────

  async rotateNow(secretName: string): Promise<{ rotated: boolean; message: string }> {
    try {
      await this.sm.send(new RotateSecretCommand({
        SecretId: secretName,
      }))

      log.info({ secret: secretName }, 'Immediate rotation triggered')
      return { rotated: true, message: `Rotation triggered for ${secretName}` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      log.error({ err, secret: secretName }, 'Rotation trigger failed')
      return { rotated: false, message: msg }
    }
  }

  // ── Get current secret value (for emergency access) ──────────────

  async getSecretValue(secretName: string): Promise<string | null> {
    try {
      const result = await this.sm.send(
        new GetSecretValueCommand({ SecretId: secretName }),
      )
      return result.SecretString ?? null
    } catch (err) {
      log.error({ err, secret: secretName }, 'Failed to get secret value')
      return null
    }
  }
}
