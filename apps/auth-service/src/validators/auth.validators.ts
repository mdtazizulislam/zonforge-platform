import { z } from 'zod'

// ─────────────────────────────────────────────
// AUTH REQUEST VALIDATORS
// ─────────────────────────────────────────────

export const LoginBodySchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().length(6).optional(),
})

export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})

export const RegisterBodySchema = z.object({
  email:    z.string().email(),
  name:     z.string().min(1).max(255),
  password: z.string().min(12),
  role:     z.enum(['TENANT_ADMIN', 'SECURITY_ANALYST', 'READ_ONLY']),
})

export const ConfirmMfaBodySchema = z.object({
  totpCode: z.string().length(6),
})

export const CreateApiKeyBodySchema = z.object({
  name:        z.string().min(1).max(100),
  role:        z.enum(['SECURITY_ANALYST', 'READ_ONLY', 'API_CONNECTOR']),
  connectorId: z.string().uuid().optional(),
  expiresAt:   z.string().datetime().optional(),
})

export const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(12),
})
