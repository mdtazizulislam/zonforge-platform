// ─────────────────────────────────────────────
// ZonForge API Client
// Typed fetch wrapper with JWT auth + error handling
// ─────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// ── API error ────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly code:    string,
    message:                  string,
    public readonly status:  number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Auth token storage ────────────────────────

const TOKEN_KEY  = 'zf_access_token'
const RTOKEN_KEY = 'zf_refresh_token'

export const tokenStorage = {
  get:          () => localStorage.getItem(TOKEN_KEY),
  set:          (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear:        () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(RTOKEN_KEY) },
  getRefresh:   () => localStorage.getItem(RTOKEN_KEY),
  setRefresh:   (t: string) => localStorage.setItem(RTOKEN_KEY, t),
}

type ApiEnvelope<T> = {
  success?: boolean
  data?: T
  error?: { code?: string; message?: string }
  meta?: unknown
  [key: string]: unknown
}

type RawCurrentUser = Partial<CurrentUser> & {
  id?: string | number
  email?: string
  name?: string
  role?: string
  tenantId?: string | number
  tenant_id?: string | number
  mfaEnabled?: boolean
  mfa_enabled?: boolean
}

type LegacyUserLookup = {
  user?: RawCurrentUser
}

type TokenClaims = {
  userId?: string | number
  email?: string
}

type RawLoginResult = {
  accessToken?: string
  access_token?: string
  token?: string
  refreshToken?: string
  refresh_token?: string
  accessExpiresAt?: string
  access_expires_at?: string
  refreshExpiresAt?: string
  refresh_expires_at?: string
  user?: RawCurrentUser
  requiresMfa?: boolean
  requires_mfa?: boolean
}

function toDisplayName(email?: string, name?: string): string {
  if (name?.trim()) return name.trim()
  const localPart = email?.split('@')[0]?.trim()
  return localPart && localPart.length > 0 ? localPart : 'User'
}

function normalizeCurrentUser(user: RawCurrentUser): CurrentUser {
  const email = user.email ?? ''
  return {
    id: String(user.id ?? ''),
    email,
    name: toDisplayName(email, user.name),
    role: user.role ?? 'member',
    tenantId: String(user.tenantId ?? user.tenant_id ?? ''),
    mfaEnabled: Boolean(user.mfaEnabled ?? user.mfa_enabled ?? false),
  }
}

function unwrapSuccessPayload<T>(json: ApiEnvelope<T>): T {
  if (Object.prototype.hasOwnProperty.call(json, 'data')) {
    return json.data as T
  }

  const { success: _success, error: _error, meta: _meta, ...rest } = json
  return rest as T
}

function normalizeLoginPayload(payload: RawLoginResult): Omit<LoginResult, 'user'> & { user?: CurrentUser } {
  return {
    accessToken: String(payload.accessToken ?? payload.access_token ?? payload.token ?? ''),
    refreshToken: String(payload.refreshToken ?? payload.refresh_token ?? ''),
    accessExpiresAt: String(payload.accessExpiresAt ?? payload.access_expires_at ?? ''),
    refreshExpiresAt: String(payload.refreshExpiresAt ?? payload.refresh_expires_at ?? ''),
    requiresMfa: Boolean(payload.requiresMfa ?? payload.requires_mfa ?? false),
    user: payload.user ? normalizeCurrentUser(payload.user) : undefined,
  }
}

async function fetchCurrentUser(accessToken: string): Promise<CurrentUser> {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  }

  const authMeResponse = await fetch(`${BASE_URL}/v1/auth/me`, { headers })
  if (authMeResponse.ok) {
    const json = await authMeResponse.json().catch(() => ({})) as ApiEnvelope<RawCurrentUser>
    if (json.success !== false) {
      return normalizeCurrentUser(unwrapSuccessPayload<RawCurrentUser>(json))
    }
  } else if (authMeResponse.status !== 404) {
    const json = await authMeResponse.json().catch(() => ({})) as ApiEnvelope<RawCurrentUser>
    throw new ApiError(
      String(json.error?.code ?? 'UNKNOWN_ERROR'),
      String(json.error?.message ?? `HTTP ${authMeResponse.status}`),
      authMeResponse.status,
    )
  }

  const legacyUserResponse = await fetch(`${BASE_URL}/v1/users`, { headers })
  if (legacyUserResponse.ok) {
    const json = await legacyUserResponse.json().catch(() => ({})) as ApiEnvelope<LegacyUserLookup>
    const payload = unwrapSuccessPayload<LegacyUserLookup>(json)
    if (payload.user) {
      return normalizeCurrentUser(payload.user)
    }
  } else {
    const json = await legacyUserResponse.json().catch(() => ({})) as ApiEnvelope<LegacyUserLookup>
    throw new ApiError(
      String(json.error?.code ?? 'UNKNOWN_ERROR'),
      String(json.error?.message ?? `HTTP ${legacyUserResponse.status}`),
      legacyUserResponse.status,
    )
  }

  try {
    const payloadPart = accessToken.split('.')[1]
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized)) as TokenClaims
    return normalizeCurrentUser({
      id: decoded.userId,
      email: decoded.email,
    })
  } catch {
    throw new ApiError('INVALID_AUTH_RESPONSE', 'Unable to resolve current user after login', 500)
  }
}

// ── Core fetch wrapper ────────────────────────

async function apiFetch<T>(
  path:    string,
  options: RequestInit = {},
): Promise<T> {
  const token = tokenStorage.get()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const resp = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  // Auto-refresh on 401
  if (resp.status === 401 && tokenStorage.getRefresh()) {
    const refreshed = await attemptRefresh()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${tokenStorage.get()}`
      const retry = await fetch(`${BASE_URL}${path}`, { ...options, headers })
      return handleResponse<T>(retry)
    }
    tokenStorage.clear()
    window.location.href = '/login'
    throw new ApiError('UNAUTHORIZED', 'Session expired', 401)
  }

  return handleResponse<T>(resp)
}

async function handleResponse<T>(resp: Response): Promise<T> {
  const json = await resp.json().catch(() => ({})) as ApiEnvelope<T>

  if (!resp.ok || json.success === false) {
    throw new ApiError(
      String(json.error?.code ?? 'UNKNOWN_ERROR'),
      String(json.error?.message ?? `HTTP ${resp.status}`),
      resp.status,
    )
  }

  return unwrapSuccessPayload<T>(json)
}

async function attemptRefresh(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefresh()
  if (!refreshToken) return false

  try {
    const resp = await fetch(`${BASE_URL}/v1/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken, refresh_token: refreshToken }),
    })
    if (!resp.ok) return false
    const json = await resp.json() as ApiEnvelope<RawLoginResult>
    if (json.success === false) return false

    const data = normalizeLoginPayload(unwrapSuccessPayload<RawLoginResult>(json))
    if (!data.accessToken || !data.refreshToken) return false

    tokenStorage.set(data.accessToken)
    tokenStorage.setRefresh(data.refreshToken)
    return true
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────
// TYPED API METHODS
// ─────────────────────────────────────────────

export const api = {

  // ── Auth ──────────────────────────────────

  auth: {
    login: async (email: string, password: string, totpCode?: string) => {
      const result = await apiFetch<RawLoginResult>('/v1/auth/login', {
        method: 'POST',
        body:   JSON.stringify({ email, password, totpCode }),
      })

      const normalized = normalizeLoginPayload(result)
      if (normalized.requiresMfa) {
        return normalized
      }

      if (!normalized.accessToken || !normalized.refreshToken) {
        throw new ApiError('INVALID_AUTH_RESPONSE', 'Login response did not include tokens', 500)
      }

      const user = normalized.user ?? await fetchCurrentUser(normalized.accessToken)
      return { ...normalized, user }
    },
    logout: () =>
      apiFetch<void>('/v1/auth/logout', { method: 'POST' }),
    me: async () =>
      normalizeCurrentUser(await apiFetch<RawCurrentUser>('/v1/auth/me')),
  },

  // ── Alerts ────────────────────────────────

  alerts: {
    list: (params?: AlertListParams) =>
      apiFetch<PaginatedResult<AlertSummary>>(
        `/v1/alerts?${new URLSearchParams(params as Record<string, string> ?? {}).toString()}`,
      ),
    get: (id: string) =>
      apiFetch<AlertDetail>(`/v1/alerts/${id}`),
    updateStatus: (id: string, status: string, notes?: string) =>
      apiFetch<{ updated: boolean }>(`/v1/alerts/${id}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ status, notes }),
      }),
    feedback: (id: string, verdict: string, notes?: string) =>
      apiFetch<{ feedback_saved: boolean }>(`/v1/alerts/${id}/feedback`, {
        method: 'POST',
        body:   JSON.stringify({ verdict, notes }),
      }),
    assign: (id: string, analystId: string) =>
      apiFetch<{ assigned: boolean }>(`/v1/alerts/${id}/assign`, {
        method: 'POST',
        body:   JSON.stringify({ analystId }),
      }),
  },

  // ── Risk ──────────────────────────────────

  risk: {
    summary: () =>
      apiFetch<OrgPosture>('/v1/risk/summary'),
    users: (params?: { limit?: number; cursor?: string }) =>
      apiFetch<PaginatedResult<UserRiskScore>>(
        `/v1/risk/users?${new URLSearchParams(params as Record<string, string> ?? {}).toString()}`,
      ),
    userProfile: (userId: string) =>
      apiFetch<UserRiskProfile>(`/v1/risk/users/${userId}`),
    assets: (params?: { limit?: number }) =>
      apiFetch<PaginatedResult<AssetRiskScore>>(
        `/v1/risk/assets?${new URLSearchParams(params as Record<string, string> ?? {}).toString()}`,
      ),
    assetProfile: (assetId: string) =>
      apiFetch<AssetRiskProfile>(`/v1/risk/assets/${assetId}`),
    mttd: () =>
      apiFetch<MttdMetrics>('/v1/metrics/mttd'),
    overrideUser: (userId: string, newScore: number, justification: string) =>
      apiFetch<{ overrideApplied: boolean }>(`/v1/risk/users/${userId}/override`, {
        method: 'PATCH',
        body:   JSON.stringify({ newScore, justification }),
      }),
  },

  // ── Compliance ────────────────────────────

  compliance: {
    attackCoverage: (gapsOnly?: boolean) =>
      apiFetch<AttackCoverageResult>(
        `/v1/compliance/attack-coverage${gapsOnly ? '?gaps_only=true' : ''}`,
      ),
    auditLog: (params?: { limit?: number; cursor?: string }) =>
      apiFetch<PaginatedResult<AuditLogEntry>>(
        `/v1/compliance/audit-log?${new URLSearchParams(params as Record<string, string> ?? {}).toString()}`,
      ),
    rules: () =>
      apiFetch<DetectionRule[]>('/v1/compliance/rules'),
  },

  // ── Connectors ────────────────────────────

  connectors: {
    list: () =>
      apiFetch<ConnectorSummary[]>('/v1/connectors'),
    create: (body: CreateConnectorBody) =>
      apiFetch<{ connectorId: string }>('/v1/connectors', {
        method: 'POST',
        body:   JSON.stringify(body),
      }),
    validate: (id: string) =>
      apiFetch<ValidationResult>(`/v1/connectors/${id}/validate`),
    update: (id: string, updates: Partial<CreateConnectorBody>) =>
      apiFetch<{ updated: boolean }>(`/v1/connectors/${id}`, {
        method: 'PATCH',
        body:   JSON.stringify(updates),
      }),
  },

  // ── Health ────────────────────────────────

  health: {
    pipeline: () =>
      apiFetch<PipelineHealth>('/v1/health/pipeline'),
  },

  // Backward-compatible helper used in billing views.
  getPlans: () =>
    apiFetch<unknown>('/v1/billing/plans'),

  // ── Playbooks ─────────────────────────────

  playbooks: {
    list: () =>
      apiFetch<Playbook[]>('/v1/playbooks'),
    execute: (id: string, alertId: string, notes?: string) =>
      apiFetch<{ executionId: string; status: string }>(`/v1/playbooks/${id}/execute`, {
        method: 'POST',
        body:   JSON.stringify({ alertId, notes }),
      }),
  },

  // ── Billing ───────────────────────────────

  billing: {
    usage:        () => apiFetch<UsageSummary>('/v1/billing/usage'),
    subscription: () => apiFetch<Subscription>('/v1/billing/subscription'),
  },

  // ── AI ────────────────────────────────────

  ai: {
    chat: (message: string, sessionId?: string) =>
      apiFetch<AiChatMessage>('/v1/assistant/chat', {
        method: 'POST',
        body:   JSON.stringify({ message, sessionId }),
      }),
    investigations: () =>
      apiFetch<AiInvestigation[]>('/v1/investigations'),
    createInvestigation: (alertId: string, context?: string) =>
      apiFetch<AiInvestigation>('/v1/investigations', {
        method: 'POST',
        body:   JSON.stringify({ alertId, context }),
      }),
  },
}

// ─────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────

export interface LoginResult {
  accessToken:      string
  refreshToken:     string
  accessExpiresAt:  string
  refreshExpiresAt: string
  user?:            CurrentUser
  requiresMfa:      boolean
}

export interface CurrentUser {
  id:         string
  email:      string
  name:       string
  role:       string
  tenantId:   string
  mfaEnabled: boolean
}

export interface PaginatedResult<T> {
  items:      T[]
  nextCursor: string | null
  hasMore:    boolean
  totalCount: number
}

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AlertStatus    = 'open' | 'investigating' | 'resolved' | 'suppressed' | 'false_positive'
export type AlertPriority  = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

export interface AlertSummary {
  id:              string
  tenantId:        string
  title:           string
  severity:        AlertSeverity
  priority:        AlertPriority
  status:          AlertStatus
  affectedUserId?: string
  affectedIp?:     string
  mitreTactics:    string[]
  mitreTechniques: string[]
  detectionGapMinutes?: number
  mttdSlaBreached: boolean
  assignedTo?:     string
  createdAt:       string
  updatedAt:       string
  resolvedAt?:     string
}

export interface AlertDetail extends AlertSummary {
  description:     string
  evidence:        unknown[]
  llmNarrative?:   LlmNarrative
  llmNarrativeGeneratedAt?: string
  firstSignalTime?: string
  assignedAt?: string
  recommendedActions: string[]
}

export interface LlmNarrative {
  whatHappened:         string
  whyItMatters:         string
  recommendedNextSteps: string[]
  confidenceAssessment: string
  generatedAt:          string
  modelUsed:            string
}

export interface AlertListParams {
  severity?:  string | string[]
  status?:    string | string[]
  priority?:  string | string[]
  limit?:     number
  from?:      string
}

export interface OrgPosture {
  postureScore:         number
  openCriticalAlerts:   number
  openHighAlerts:       number
  avgUserRiskScore:     number
  topRiskUserIds:       string[]
  topRiskAssetIds:      string[]
  connectorHealthScore: number
  mttdP50Minutes:       number | null
  calculatedAt:         string
}

export interface UserRiskScore {
  entityId:       string
  score:          number
  severity:       string
  confidenceBand: string
  calculatedAt:   string
}

export interface UserRiskProfile {
  riskScore:    UserRiskScore & { contributingSignals: ContributingSignal[] }
  score?:       number
  severity?:    string
  confidenceBand?: string
  contributingSignals?: ContributingSignal[]
  user:         UserRecord | null
  recentAlerts: AlertSummary[]
  alertCount:   number
  recommendedActions?: string[]
}

export interface ContributingSignal {
  signalType:    string
  description:   string
  contribution:  number
  weight:        number
  sourceAlertId: string | null
  detectedAt:    string
}

export interface UserRecord {
  id:           string
  email:        string
  name:         string
  role:         string
  department:   string | null
  jobTitle:     string | null
  isContractor: boolean
  mfaEnabled:   boolean
  lastLoginAt:  string | null
  lastLoginIp:  string | null
}

export interface AssetRiskScore {
  entityId:     string
  score:        number
  severity:     string
  calculatedAt: string
}

export interface AssetRiskProfile {
  riskScore:       AssetRiskScore
  asset:           AssetRecord | null
  vulnerabilities: Vulnerability[]
  activeAlerts:    AlertSummary[]
}

export interface AssetRecord {
  id:              string
  hostname:        string
  assetType:       string
  environment:     string
  isInternetFacing: boolean
  criticalityLevel: string
}

export interface Vulnerability {
  id:           string
  cveId:        string | null
  title:        string
  cvssScore:    number
  severity:     string
  detectedAt:   string
}

export interface MttdMetrics {
  [priority: string]: { p50: number; p75: number; p95: number; count: number }
}

export interface ConnectorSummary {
  id:               string
  name:             string
  type:             string
  status:           string
  lastPollAt:       string | null
  lastEventAt:      string | null
  lastErrorMessage: string | null
  consecutiveErrors: number
  eventRatePerHour: number
  isHealthy:        boolean
  lagMinutes:       number | null
}

export interface CreateConnectorBody {
  name:                string
  type:                string
  config:              Record<string, unknown>
  pollIntervalMinutes?: number
}

export interface ValidationResult {
  valid:            boolean
  status:           string
  message:          string
  latencyMs:        number
  sampleEventCount: number
  lastEventAt:      string | null
  errors:           string[]
}

export interface PipelineHealth {
  connectors: {
    total:    number
    healthy:  number
    degraded: number
    error:    number
    details:  ConnectorSummary[]
  }
  queues:  Record<string, { waiting: number; active: number; failed: number; lagEstimateMs: number }>
  summary: { overallStatus: string }
}

export interface AttackCoverageResult {
  techniques: TechniqueEntry[]
  summary:    { total: number; covered: number; gaps: number; coveragePercent: number }
}

export interface TechniqueEntry {
  techniqueId:   string
  techniqueName: string
  tacticId:      string
  status:        'covered' | 'gap'
  ruleCount:     number
  ruleIds:       string[]
  hitCount:      number
}

export interface AuditLogEntry {
  id:           string
  actorEmail:   string | null
  actorRole:    string | null
  actorIp:      string | null
  action:       string
  resourceType: string
  resourceId:   string | null
  changes:      Record<string, unknown> | null
  createdAt:    string
}

export interface DetectionRule {
  id:              string
  name:            string
  description:     string | null
  severity:        string
  enabled:         boolean
  mitreTactics:    string[]
  mitreTechniques: string[]
  confidenceScore: number
  hitCount:        number
  lastHitAt:       string | null
}

export interface Playbook {
  id:             string
  name:           string
  description:    string | null
  triggerSeverities: string[]
  enabled:        boolean
  executionCount: number
  lastExecutedAt: string | null
}

export interface UsageSummary {
  planTier: string
  usage:    Record<string, { current: number; limit: number | null }>
  features: Record<string, boolean>
  retentionDays: number
}

export interface Subscription {
  planTier:           string
  status:             string
  currentPeriodStart: string
  currentPeriodEnd:   string
  trialEndsAt:        string | null
}

export interface AiChatMessage {
  role:        string
  content:     string
  model:       string
  sessionId:   string | null
  trialBypass: boolean
}

export interface AiInvestigation {
  id:        string
  tenantId:  number
  alertId:   string
  status:    'queued' | 'completed' | 'failed'
  summary:   string
  createdAt: string
}
