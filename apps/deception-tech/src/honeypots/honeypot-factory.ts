import { v4 as uuid } from 'uuid'
import { randomBytes } from 'crypto'
import type { Honeypot, HoneypotType } from '../models/honeypot.js'

// ─────────────────────────────────────────────
// HONEYPOT FACTORY
//
// Generates realistic-looking decoy values that
// an attacker would naturally want to steal and use.
//
// Security model:
//   - Every token is unique per tenant + honeypot
//   - Tokens are tracked in DB + ZonForge canary backend
//   - No real credentials are generated
//   - All keys are in TEST/CANARY namespaces
// ─────────────────────────────────────────────

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

function randomBase64(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

function randomAlphaNum(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ─────────────────────────────────────────────
// DECOY GENERATORS PER TYPE
// ─────────────────────────────────────────────

export interface GeneratedHoneypot {
  type:          HoneypotType
  name:          string
  description:   string
  decoyValue:    string       // what attacker sees
  trackingToken: string       // embedded unique ID for detection
  instructions:  string       // how to deploy this honeypot
  deployedTo:    string
}

export function generateHoneypot(
  type:      HoneypotType,
  tenantId:  string,
  name?:     string,
): GeneratedHoneypot {
  const trackingToken = `ZF-HC-${randomHex(12).toUpperCase()}`

  switch (type) {

    case 'credential': {
      const user = `admin_${randomAlphaNum(6).toLowerCase()}`
      const pass = `${randomAlphaNum(8)}@${randomAlphaNum(4)}!${Math.floor(Math.random() * 999)}`
      return {
        type,
        name:          name ?? 'Fake Admin Credentials',
        description:   'Username/password pair for a non-existent admin account',
        decoyValue:    JSON.stringify({ username: user, password: pass, token: trackingToken }),
        trackingToken,
        instructions:  `Plant in: .env file, README, Confluence wiki, or app config. Label it as "backup admin" or "legacy credentials". Comment: # Emergency backup credentials`,
        deployedTo:    '.env / wiki / config file',
      }
    }

    case 'aws_key': {
      // AWS canary key format — starts with AKIAZF (ZF = ZonForge canary namespace)
      const keyId     = `AKIAZF${randomAlphaNum(14).toUpperCase()}`
      const secretKey = `${randomBase64(30)}`
      return {
        type,
        name:          name ?? 'AWS Canary Access Key',
        description:   'Fake AWS access key — any API call immediately triggers detection',
        decoyValue:    `AWS_ACCESS_KEY_ID=${keyId}\nAWS_SECRET_ACCESS_KEY=${secretKey}\n# ${trackingToken}`,
        trackingToken,
        instructions:  `Plant in: .env, terraform.tfvars, ~/.aws/credentials, GitHub Actions secrets file, or CI/CD config. Label as "aws-backup" or "legacy-aws". The key will register any use attempt via the ZonForge canary webhook.`,
        deployedTo:    '.env / terraform / CI config',
      }
    }

    case 'api_token': {
      const token = `zf_canary_${randomBase64(32)}_${randomHex(8)}`
      return {
        type,
        name:          name ?? 'API Token Honeypot',
        description:   'Fake API token planted in code or config',
        decoyValue:    token,
        trackingToken,
        instructions:  `Plant as a comment in source code: // Legacy API token: ${token}\nOr in .env: LEGACY_API_KEY=${token}\nOr in Postman collection variables. Any HTTP request using this token will trigger detection.`,
        deployedTo:    'source code / env / postman',
      }
    }

    case 's3_bucket': {
      const bucketName = `${tenantId.slice(0,8).toLowerCase()}-backup-${randomHex(4)}`
      return {
        type,
        name:          name ?? 'Fake S3 Bucket',
        description:   'S3 bucket name in configs — access triggers immediate alert',
        decoyValue:    `s3://${bucketName}/\n# Tracking: ${trackingToken}`,
        trackingToken,
        instructions:  `Plant in: S3 bucket policy reference, app config, terraform variable, or README. Any s3:GetObject, s3:ListBucket, or other API call to this bucket will trigger a P1 alert. Configure bucket with S3 event notifications → ZonForge webhook.`,
        deployedTo:    'S3 bucket config / terraform',
      }
    }

    case 'user_account': {
      const email = `admin.backup.${randomHex(4)}@${tenantId.slice(0,8).toLowerCase()}.internal`
      return {
        type,
        name:          name ?? 'Ghost Admin Account',
        description:   'Fake admin account — any login attempt is an attack indicator',
        decoyValue:    JSON.stringify({ email, role: 'TENANT_ADMIN', note: 'Emergency recovery account', trackingToken }),
        trackingToken,
        instructions:  `Create in M365/Google Workspace/IAM with email ${email}. Assign admin role. Set a complex password and store trackingToken in account notes. Configure login alert. This account should NEVER receive legitimate login attempts.`,
        deployedTo:    'M365 / Google Workspace / IAM',
      }
    }

    case 'dns_canary': {
      const subdomain = `canary-${randomHex(6)}.internal`
      return {
        type,
        name:          name ?? 'DNS Canary Record',
        description:   'Unique DNS hostname — any resolution reveals attacker infrastructure',
        decoyValue:    `${subdomain}.zonforge-canary.io\n# Token: ${trackingToken}`,
        trackingToken,
        instructions:  `Embed this hostname in: app config, terraform output, database connection string, API endpoint. Any DNS resolution of this canary domain will be logged and trigger a P1 alert. Can also embed in HTML/JS as a resource URL.`,
        deployedTo:    'DNS config / app config',
      }
    }

    case 'oauth_client': {
      const clientId     = `${randomHex(16)}`
      const clientSecret = `${randomBase64(40)}`
      return {
        type,
        name:          name ?? 'OAuth Canary Client',
        description:   'Fake OAuth client credentials — any token request triggers detection',
        decoyValue:    `CLIENT_ID=${clientId}\nCLIENT_SECRET=${clientSecret}\n# ${trackingToken}`,
        trackingToken,
        instructions:  `Plant in: OAuth integration config, .env file, or documentation. Any OAuth token request using these credentials will be detected. Configure ZonForge webhook as redirect_uri to capture use attempts.`,
        deployedTo:    '.env / OAuth config',
      }
    }

    case 'db_record': {
      const ssn      = `${randomAlphaNum(3)}-${randomAlphaNum(2)}-${randomAlphaNum(4)}`
      const ccNum    = `4${randomAlphaNum(3)}-${randomAlphaNum(4)}-${randomAlphaNum(4)}-${randomAlphaNum(4)}`
      return {
        type,
        name:          name ?? 'Database Canary Record',
        description:   'Fake high-value database record with embedded tracking',
        decoyValue:    JSON.stringify({
          id:            trackingToken,
          type:          'canary_record',
          label:         'VIP Customer',
          email:         `vip.customer.${randomHex(4)}@example.com`,
          ssn:           ssn,
          creditCard:    ccNum,
          note:          `TRACKING:${trackingToken}`,
        }, null, 2),
        trackingToken,
        instructions:  `Insert this record into your customers/users/financial table. The record ID equals the tracking token. Any SELECT query returning this record, or any API response containing it, will be flagged. Particularly useful for detecting SQL injection or insider data theft.`,
        deployedTo:    'database table',
      }
    }
  }
}

// ─────────────────────────────────────────────
// BATCH GENERATOR — standard honeypot grid
// ─────────────────────────────────────────────

export function generateStandardGrid(tenantId: string): GeneratedHoneypot[] {
  const types: HoneypotType[] = [
    'credential',
    'aws_key',
    'api_token',
    'user_account',
    'dns_canary',
    'db_record',
  ]
  return types.map(t => generateHoneypot(t, tenantId))
}
