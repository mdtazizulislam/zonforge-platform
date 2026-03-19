import { authenticator } from 'otplib'
import { randomBytes } from 'crypto'

// ─────────────────────────────────────────────
// TOTP — Time-based One-Time Password
// RFC 6238 compliant (Google Authenticator compatible)
// Window: ±1 step (30-second tolerance for clock skew)
// ─────────────────────────────────────────────

authenticator.options = {
  window: 1,          // ±1 step tolerance
  step:   30,         // 30-second TOTP step
  digits: 6,          // 6-digit code
}

export interface TotpSetup {
  secret: string          // store encrypted in DB
  otpauthUrl: string      // for QR code display
  backupCodes: string[]   // 8 backup codes, one-time use
}

// ── Generate TOTP secret for a new user ───────

export function generateTotpSetup(
  userEmail: string,
  issuer = 'ZonForge Sentinel',
): TotpSetup {
  const secret     = authenticator.generateSecret(32)
  const otpauthUrl = authenticator.keyuri(userEmail, issuer, secret)
  const backupCodes = generateBackupCodes(8)

  return { secret, otpauthUrl, backupCodes }
}

// ── Verify a TOTP code ────────────────────────

export function verifyTotpCode(
  token: string,
  secret: string,
): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ''), secret })
  } catch {
    return false
  }
}

// ── Generate backup codes (one-time use) ──────

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(4).toString('hex').toUpperCase()
      .match(/.{4}/g)!.join('-')   // Format: ABCD-1234
  )
}

// ── Verify a backup code (plain text check) ───
// Caller is responsible for marking code as used in DB

export function verifyBackupCode(
  inputCode: string,
  storedCodes: string[],
): { valid: boolean; usedCode: string | null } {
  const normalised = inputCode.replace(/[-\s]/g, '').toUpperCase()
  const match = storedCodes.find(c => c.replace(/-/g, '') === normalised)
  return { valid: !!match, usedCode: match ?? null }
}
