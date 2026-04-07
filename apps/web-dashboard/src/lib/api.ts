// ─────────────────────────────────────────────
// ZonForge API Client
// Typed fetch wrapper with JWT auth + error handling
// ─────────────────────────────────────────────

import { buildAppUrl, resolveApiBaseUrl, resolveLogoutRedirectUrl } from '@/lib/runtime-config'

const BASE_URL = resolveApiBaseUrl()

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return ''

  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry != null && entry !== '') {
          search.append(key, String(entry))
        }
      }
      continue
    }

    search.set(key, String(value))
  }

  const query = search.toString()
  return query ? `?${query}` : ''
}

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

type RawCurrentUser = Partial<Omit<CurrentUser, 'tenant' | 'membership'>> & {
  id?: string | number
  email?: string
  name?: string
  fullName?: string
  full_name?: string
  role?: string
  status?: string
  tenantId?: string | number
  tenant_id?: string | number
  mfaEnabled?: boolean
  mfa_enabled?: boolean
  emailVerified?: boolean
  email_verified?: boolean
}

type RawTenant = Partial<TenantContext> & {
  id?: string | number
  name?: string
  slug?: string
  plan?: string
  onboardingStatus?: string
  onboarding_status?: string
  onboardingStartedAt?: string | null
  onboarding_started_at?: string | null
  onboardingCompletedAt?: string | null
  onboarding_completed_at?: string | null
}

type RawMembership = Partial<MembershipContext> & {
  role?: string
}

type RawAuthContext = RawCurrentUser & {
  user?: RawCurrentUser
  tenant?: RawTenant
  membership?: RawMembership | null
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
  tenant?: RawTenant
  membership?: RawMembership | null
  requiresMfa?: boolean
  requires_mfa?: boolean
}

type RawOnboardingStep = {
  stepKey?: string
  step_key?: string
  title?: string
  description?: string
  isComplete?: boolean
  is_complete?: boolean
  payload?: unknown
  updatedAt?: string | null
  updated_at?: string | null
}

type RawOnboardingStatus = {
  tenantId?: string | number
  tenant_id?: string | number
  onboardingStatus?: string
  onboarding_status?: string
  onboardingStartedAt?: string | null
  onboarding_started_at?: string | null
  onboardingCompletedAt?: string | null
  onboarding_completed_at?: string | null
  steps?: RawOnboardingStep[]
}

type RawTeamActor = {
  userId?: string | number | null
  user_id?: string | number | null
  email?: string | null
  fullName?: string | null
  full_name?: string | null
}

type RawTeamMember = {
  membershipId?: string | number
  membership_id?: string | number
  userId?: string | number
  user_id?: string | number
  email?: string
  fullName?: string | null
  full_name?: string | null
  status?: string | null
  role?: string
  createdAt?: string | null
  created_at?: string | null
  updatedAt?: string | null
  updated_at?: string | null
  isCurrentUser?: boolean
  is_current_user?: boolean
  invitedBy?: RawTeamActor | null
  invited_by?: RawTeamActor | null
}

type RawTeamInvite = {
  id?: string | number
  email?: string
  role?: string
  status?: string
  expiresAt?: string | null
  expires_at?: string | null
  createdAt?: string | null
  created_at?: string | null
  updatedAt?: string | null
  updated_at?: string | null
  acceptedAt?: string | null
  accepted_at?: string | null
  revokedAt?: string | null
  revoked_at?: string | null
  acceptedByUserId?: string | number | null
  accepted_by_user_id?: string | number | null
  invitedBy?: RawTeamActor | null
  invited_by?: RawTeamActor | null
}

type RawTeamPermissions = {
  canManageTeam?: boolean
  can_manage_team?: boolean
  currentRole?: string
  current_role?: string
}

type RawTeamMembersResponse = {
  items?: RawTeamMember[]
  permissions?: RawTeamPermissions
}

type RawTeamInvitesResponse = {
  items?: RawTeamInvite[]
}

type RawTeamInviteCreateResponse = {
  invite?: RawTeamInvite
  invitationUrl?: string
  invitation_url?: string
  emailStatus?: string
  email_status?: string
}

type RawInvitePreview = {
  id?: string | number
  email?: string
  role?: string
  status?: string
  expiresAt?: string | null
  expires_at?: string | null
  existingUser?: boolean
  existing_user?: boolean
  tenant?: RawTenant
  inviter?: RawTeamActor | null
}

type RawInviteAcceptResult = RawLoginResult & {
  invite?: RawInvitePreview
  redirectUrl?: string
  redirect_url?: string
}

function toDisplayName(email?: string, name?: string): string {
  if (name?.trim()) return name.trim()
  const localPart = email?.split('@')[0]?.trim()
  return localPart && localPart.length > 0 ? localPart : 'User'
}

function normalizeTenantContext(tenant?: RawTenant, fallbackUser?: RawCurrentUser): TenantContext | undefined {
  const tenantId = tenant?.id ?? fallbackUser?.tenantId ?? fallbackUser?.tenant_id
  const tenantName = tenant?.name
  const tenantSlug = tenant?.slug

  if (tenantId == null && !tenantName && !tenantSlug) {
    return undefined
  }

  return {
    id: tenantId != null ? String(tenantId) : '',
    name: String(tenantName ?? 'Workspace'),
    slug: String(tenantSlug ?? ''),
    plan: String(tenant?.plan ?? 'starter'),
    onboardingStatus: String(tenant?.onboardingStatus ?? tenant?.onboarding_status ?? 'pending'),
    onboardingStartedAt: tenant?.onboardingStartedAt ?? tenant?.onboarding_started_at ?? null,
    onboardingCompletedAt: tenant?.onboardingCompletedAt ?? tenant?.onboarding_completed_at ?? null,
  }
}

function normalizeOnboardingPayload(payload: RawOnboardingStatus): OnboardingStatusResponse {
  return {
    tenantId: String(payload.tenantId ?? payload.tenant_id ?? ''),
    onboardingStatus: String(payload.onboardingStatus ?? payload.onboarding_status ?? 'pending'),
    onboardingStartedAt: payload.onboardingStartedAt ?? payload.onboarding_started_at ?? null,
    onboardingCompletedAt: payload.onboardingCompletedAt ?? payload.onboarding_completed_at ?? null,
    steps: Array.isArray(payload.steps)
      ? payload.steps.map((step) => ({
          stepKey: String(step.stepKey ?? step.step_key ?? ''),
          title: String(step.title ?? String(step.stepKey ?? step.step_key ?? '').replace(/_/g, ' ')),
          description: String(step.description ?? ''),
          isComplete: Boolean(step.isComplete ?? step.is_complete ?? false),
          payload: step.payload ?? null,
          updatedAt: step.updatedAt ?? step.updated_at ?? null,
        }))
      : [],
  }
}

function normalizeTeamActor(actor?: RawTeamActor | null): TeamActor | null {
  if (!actor || (!actor.email && actor.userId == null && actor.user_id == null)) {
    return null
  }

  const email = actor.email ?? ''
  return {
    userId: String(actor.userId ?? actor.user_id ?? ''),
    email,
    fullName: String(actor.fullName ?? actor.full_name ?? toDisplayName(email, undefined)),
  }
}

function normalizeTeamMember(member: RawTeamMember): TeamMember {
  return {
    membershipId: String(member.membershipId ?? member.membership_id ?? ''),
    userId: String(member.userId ?? member.user_id ?? ''),
    email: String(member.email ?? ''),
    fullName: String(member.fullName ?? member.full_name ?? toDisplayName(member.email, undefined)),
    status: String(member.status ?? 'active'),
    role: String(member.role ?? 'viewer'),
    createdAt: member.createdAt ?? member.created_at ?? null,
    updatedAt: member.updatedAt ?? member.updated_at ?? null,
    isCurrentUser: Boolean(member.isCurrentUser ?? member.is_current_user ?? false),
    invitedBy: normalizeTeamActor(member.invitedBy ?? member.invited_by ?? null),
  }
}

function normalizeTeamInvite(invite: RawTeamInvite): TeamInvite {
  return {
    id: String(invite.id ?? ''),
    email: String(invite.email ?? ''),
    role: String(invite.role ?? 'viewer'),
    status: String(invite.status ?? 'pending'),
    expiresAt: invite.expiresAt ?? invite.expires_at ?? null,
    createdAt: invite.createdAt ?? invite.created_at ?? null,
    updatedAt: invite.updatedAt ?? invite.updated_at ?? null,
    acceptedAt: invite.acceptedAt ?? invite.accepted_at ?? null,
    revokedAt: invite.revokedAt ?? invite.revoked_at ?? null,
    acceptedByUserId: invite.acceptedByUserId != null || invite.accepted_by_user_id != null
      ? String(invite.acceptedByUserId ?? invite.accepted_by_user_id ?? '')
      : null,
    invitedBy: normalizeTeamActor(invite.invitedBy ?? invite.invited_by ?? null),
  }
}

function normalizeTeamMembersResponse(payload: RawTeamMembersResponse): TeamMembersResponse {
  return {
    items: Array.isArray(payload.items) ? payload.items.map(normalizeTeamMember) : [],
    permissions: {
      canManageTeam: Boolean(payload.permissions?.canManageTeam ?? payload.permissions?.can_manage_team ?? false),
      currentRole: String(payload.permissions?.currentRole ?? payload.permissions?.current_role ?? 'viewer'),
    },
  }
}

function normalizeInvitePreview(payload: RawInvitePreview): TeamInvitePreview {
  return {
    id: String(payload.id ?? ''),
    email: String(payload.email ?? ''),
    role: String(payload.role ?? 'viewer'),
    status: String(payload.status ?? 'pending'),
    expiresAt: payload.expiresAt ?? payload.expires_at ?? null,
    existingUser: Boolean(payload.existingUser ?? payload.existing_user ?? false),
    tenant: normalizeTenantContext(payload.tenant) ?? {
      id: '',
      name: 'Workspace',
      slug: '',
      plan: 'starter',
      onboardingStatus: 'pending',
      onboardingStartedAt: null,
      onboardingCompletedAt: null,
    },
    inviter: normalizeTeamActor(payload.inviter ?? null),
  }
}

function normalizeMembershipContext(membership?: RawMembership | null, fallbackUser?: RawCurrentUser): MembershipContext | undefined {
  const role = membership?.role ?? fallbackUser?.role
  if (!role) {
    return undefined
  }

  return {
    role: String(role),
  }
}

function normalizeAuthContext(payload: RawAuthContext): CurrentUser {
  const sourceUser = payload.user ?? payload
  const email = sourceUser.email ?? ''
  const tenant = normalizeTenantContext(payload.tenant, sourceUser)
  const membership = normalizeMembershipContext(payload.membership, sourceUser)
  const fullName = String(sourceUser.fullName ?? sourceUser.full_name ?? sourceUser.name ?? toDisplayName(email, sourceUser.name))

  return {
    id: String(sourceUser.id ?? ''),
    email,
    fullName,
    name: fullName,
    role: membership?.role ?? sourceUser.role ?? 'member',
    status: String(sourceUser.status ?? 'active'),
    emailVerified: Boolean(sourceUser.emailVerified ?? sourceUser.email_verified ?? false),
    tenantId: tenant?.id ?? String(sourceUser.tenantId ?? sourceUser.tenant_id ?? ''),
    tenant,
    membership,
    onboardingStatus: tenant?.onboardingStatus,
    mfaEnabled: Boolean(sourceUser.mfaEnabled ?? sourceUser.mfa_enabled ?? false),
  }
}

function normalizeCurrentUser(user: RawCurrentUser): CurrentUser {
  return normalizeAuthContext(user)
}

function unwrapSuccessPayload<T>(json: ApiEnvelope<T>): T {
  if (Array.isArray(json)) {
    return json as T
  }

  if (!json || typeof json !== 'object') {
    return json as T
  }

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
    user: payload.user ? normalizeAuthContext({ user: payload.user, tenant: payload.tenant, membership: payload.membership }) : undefined,
  }
}

async function fetchCurrentUser(accessToken: string): Promise<CurrentUser> {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  }

  const authMeResponse = await fetch(`${BASE_URL}/v1/auth/me`, { headers })
  if (authMeResponse.ok) {
    const json = await authMeResponse.json().catch(() => ({})) as ApiEnvelope<RawAuthContext>
    if (json.success !== false) {
      return normalizeAuthContext(unwrapSuccessPayload<RawAuthContext>(json))
    }
  } else if (authMeResponse.status !== 404) {
    const json = await authMeResponse.json().catch(() => ({})) as ApiEnvelope<RawAuthContext>
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
      id: decoded.userId != null ? String(decoded.userId) : undefined,
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
    window.location.href = buildAppUrl('/login')
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
    signup: async (input: { fullName: string; workspaceName: string; email: string; password: string }) => {
      const result = await apiFetch<RawLoginResult>('/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify(input),
      })

      const normalized = normalizeLoginPayload(result)
      if (!normalized.accessToken || !normalized.refreshToken) {
        throw new ApiError('INVALID_AUTH_RESPONSE', 'Signup response did not include tokens', 500)
      }

      const user = normalized.user ?? await fetchCurrentUser(normalized.accessToken)
      return { ...normalized, user }
    },
    logout: () =>
      apiFetch<void>('/v1/auth/logout', {
        method: 'POST',
        body:   JSON.stringify({ refresh_token: tokenStorage.getRefresh() }),
      }),
    me: async () =>
      normalizeAuthContext(await apiFetch<RawAuthContext>('/v1/auth/me')),
    invitePreview: async (token: string): Promise<TeamInvitePreview> => {
      const payload = await apiFetch<{ invite: RawInvitePreview }>(`/v1/auth/invite${buildQueryString({ token })}`)
      return normalizeInvitePreview(payload.invite)
    },
    acceptInvite: async (input: { token: string; fullName?: string; password?: string }) => {
      const payload = await apiFetch<RawInviteAcceptResult>('/v1/auth/invite/accept', {
        method: 'POST',
        body: JSON.stringify(input),
      })

      const normalized = normalizeLoginPayload(payload)
      if (!normalized.accessToken || !normalized.refreshToken) {
        throw new ApiError('INVALID_AUTH_RESPONSE', 'Invite acceptance response did not include tokens', 500)
      }

      const user = normalized.user ?? await fetchCurrentUser(normalized.accessToken)
      return {
        ...normalized,
        user,
        invite: payload.invite ? normalizeInvitePreview(payload.invite) : undefined,
        redirectUrl: String(payload.redirectUrl ?? payload.redirect_url ?? '/customer-dashboard'),
      }
    },
  },

  team: {
    members: async (): Promise<TeamMembersResponse> => {
      const payload = await apiFetch<RawTeamMembersResponse>('/v1/team/members')
      return normalizeTeamMembersResponse(payload)
    },
    invites: async (): Promise<TeamInvite[]> => {
      const payload = await apiFetch<RawTeamInvitesResponse>('/v1/team/invites')
      return Array.isArray(payload.items) ? payload.items.map(normalizeTeamInvite) : []
    },
    createInvite: async (input: { email: string; role: TeamRole }): Promise<TeamInviteCreateResult> => {
      const payload = await apiFetch<RawTeamInviteCreateResponse>('/v1/team/invites', {
        method: 'POST',
        body: JSON.stringify(input),
      })

      return {
        invite: payload.invite ? normalizeTeamInvite(payload.invite) : {
          id: '',
          email: input.email,
          role: input.role,
          status: 'pending',
          expiresAt: null,
          createdAt: null,
          updatedAt: null,
          acceptedAt: null,
          revokedAt: null,
          acceptedByUserId: null,
          invitedBy: null,
        },
        invitationUrl: String(payload.invitationUrl ?? payload.invitation_url ?? ''),
        emailStatus: String(payload.emailStatus ?? payload.email_status ?? 'queued'),
      }
    },
    updateMemberRole: (membershipId: string, role: TeamRole) =>
      apiFetch<{ updated: boolean }>(`/v1/team/members/${membershipId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    removeMember: (membershipId: string) =>
      apiFetch<{ removed: boolean }>(`/v1/team/members/${membershipId}`, {
        method: 'DELETE',
      }),
    revokeInvite: (inviteId: string) =>
      apiFetch<{ revoked: boolean }>(`/v1/team/invites/${inviteId}`, {
        method: 'DELETE',
      }),
  },

  onboarding: {
    get: async (): Promise<OnboardingStatusResponse> => {
      const payload = await apiFetch<RawOnboardingStatus>('/v1/onboarding')
      return normalizeOnboardingPayload(payload)
    },
    status: async (): Promise<OnboardingStatusResponse> => {
      const payload = await apiFetch<RawOnboardingStatus>('/v1/onboarding/status')
      return normalizeOnboardingPayload(payload)
    },
    updateStatus: async (input: {
      status?: 'pending' | 'in_progress' | 'completed'
      stepKey?: string
      isComplete?: boolean
      payload?: unknown
    }): Promise<OnboardingStatusResponse> => {
      const payload = await apiFetch<RawOnboardingStatus>('/v1/onboarding/status', {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
      return normalizeOnboardingPayload(payload)
    },
  },

  // ── Alerts ────────────────────────────────

  alerts: {
    list: (params?: AlertListParams) =>
      apiFetch<PaginatedResult<AlertSummary>>(
        `/v1/alerts${buildQueryString(params as Record<string, unknown> | undefined)}`,
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
        `/v1/risk/users${buildQueryString(params as Record<string, unknown> | undefined)}`,
      ),
    userProfile: (userId: string) =>
      apiFetch<UserRiskProfile>(`/v1/risk/users/${userId}`),
    assets: (params?: { limit?: number }) =>
      apiFetch<PaginatedResult<AssetRiskScore>>(
        `/v1/risk/assets${buildQueryString(params as Record<string, unknown> | undefined)}`,
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
        `/v1/compliance/audit-log${buildQueryString(params as Record<string, unknown> | undefined)}`,
      ),
    rules: () =>
      apiFetch<DetectionRule[]>('/v1/compliance/rules'),
    reportsList: () =>
      apiFetch<ComplianceReportCatalog>('/v1/compliance/reports/list'),
  },

  // ── Connectors ────────────────────────────

  connectors: {
    list: () =>
      apiFetch<ConnectorSummary[]>('/v1/connectors'),
    create: (body: CreateConnectorBody) =>
      apiFetch<{ connectorId: string; status: ConnectorStatus | string }>('/v1/connectors', {
        method: 'POST',
        body:   JSON.stringify(body),
      }),
    validate: (id: string) =>
      apiFetch<ValidationResult>(`/v1/connectors/${id}/validate`),
    test: (id: string) =>
      apiFetch<ValidationResult>(`/v1/connectors/${id}/test`, {
        method: 'POST',
      }),
    update: (id: string, updates: UpdateConnectorBody) =>
      apiFetch<{ updated: boolean; status: ConnectorStatus | string }>(`/v1/connectors/${id}`, {
        method: 'PATCH',
        body:   JSON.stringify(updates),
      }),
    remove: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/v1/connectors/${id}`, {
        method: 'DELETE',
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
    chat: (messages: Array<{ role: 'user' | 'assistant'; content: string }>, sessionId?: string | null) =>
      apiFetch<AiChatResponse>('/v1/assistant/chat', {
        method: 'POST',
        body:   JSON.stringify({ messages, sessionId: sessionId ?? undefined }),
      }),
    suggestions: () =>
      apiFetch<AssistantSuggestions>('/v1/assistant/suggestions'),
    investigations: (params?: { limit?: number }) =>
      apiFetch<AiInvestigation[]>(`/v1/investigations${buildQueryString(params as Record<string, unknown> | undefined)}`),
    investigation: (id: string) =>
      apiFetch<AiInvestigation>(`/v1/investigations/${id}`),
    investigationStats: () =>
      apiFetch<AiInvestigationStats>('/v1/investigations/stats'),
    createInvestigation: (alertId: string, context?: string) =>
      apiFetch<AiInvestigationCreateResult>('/v1/investigations', {
        method: 'POST',
        body:   JSON.stringify({ alertId, context }),
      }),
  },
}

export function redirectToLogout(): void {
  tokenStorage.clear()
  window.location.href = resolveLogoutRedirectUrl()
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
  fullName:   string
  name:       string
  role:       string
  status:     string
  emailVerified: boolean
  tenantId:   string
  tenant?:    TenantContext
  membership?: MembershipContext
  onboardingStatus?: string
  mfaEnabled: boolean
}

export interface TenantContext {
  id: string
  name: string
  slug: string
  plan: string
  onboardingStatus: string
  onboardingStartedAt: string | null
  onboardingCompletedAt: string | null
}

export interface MembershipContext {
  role: string
}

export type TeamRole = 'owner' | 'admin' | 'analyst' | 'viewer'

export interface TeamActor {
  userId: string
  email: string
  fullName: string
}

export interface TeamMember {
  membershipId: string
  userId: string
  email: string
  fullName: string
  status: string
  role: string
  createdAt: string | null
  updatedAt: string | null
  isCurrentUser: boolean
  invitedBy: TeamActor | null
}

export interface TeamInvite {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string | null
  createdAt: string | null
  updatedAt: string | null
  acceptedAt: string | null
  revokedAt: string | null
  acceptedByUserId: string | null
  invitedBy: TeamActor | null
}

export interface TeamMembersResponse {
  items: TeamMember[]
  permissions: {
    canManageTeam: boolean
    currentRole: string
  }
}

export interface TeamInviteCreateResult {
  invite: TeamInvite
  invitationUrl: string
  emailStatus: string
}

export interface TeamInvitePreview {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string | null
  existingUser: boolean
  tenant: TenantContext
  inviter: TeamActor | null
}

export interface OnboardingStep {
  stepKey: string
  title: string
  description: string
  isComplete: boolean
  payload: unknown
  updatedAt: string | null
}

export interface OnboardingStatusResponse {
  tenantId: string
  onboardingStatus: string
  onboardingStartedAt: string | null
  onboardingCompletedAt: string | null
  steps: OnboardingStep[]
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

export type ConnectorType = 'aws' | 'microsoft_365' | 'google_workspace'
export type ConnectorStatus = 'pending' | 'connected' | 'failed' | 'disabled'

export interface ConnectorCheck {
  key: string
  label: string
  passed: boolean
  detail: string
}

export interface ConnectorSummary {
  id:                string
  name:              string
  type:              ConnectorType | string
  typeLabel:         string
  status:            ConnectorStatus | string
  settings:          Record<string, unknown>
  hasStoredSecrets:  boolean
  lastPollAt:        string | null
  lastEventAt:       string | null
  lastValidatedAt:   string | null
  lastErrorMessage: string | null
  consecutiveErrors: number
  eventRatePerHour:  number
  isHealthy:         boolean
  lagMinutes:        number | null
  pollIntervalMinutes: number
  createdAt:         string | null
  updatedAt:         string | null
}

export interface CreateConnectorBody {
  name: string
  type: ConnectorType | string
  settings?: Record<string, unknown>
  config?: Record<string, unknown>
  secrets?: Record<string, string>
  pollIntervalMinutes?: number
  enabled?: boolean
}

export interface UpdateConnectorBody {
  name?: string
  type?: ConnectorType | string
  settings?: Record<string, unknown>
  config?: Record<string, unknown>
  secrets?: Record<string, string>
  pollIntervalMinutes?: number
  enabled?: boolean
}

export interface ValidationResult {
  valid:            boolean
  status:           ConnectorStatus | string
  message:          string
  latencyMs:        number
  sampleEventCount: number
  lastEventAt:      string | null
  checkedAt:        string
  errors:           string[]
  checks:           ConnectorCheck[]
}

export interface PipelineHealth {
  connectors: {
    total:    number
    healthy:  number
    degraded: number
    error:    number
    disabled: number
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

export interface AiChatResponse {
  sessionId:   string | null
  message:     string
  model:       string
  toolsUsed:   string[]
}

export type AiChatMessage = AiChatResponse

export interface AiInvestigation {
  id:                string
  tenantId:          string
  alertId:           string
  alertTitle?:       string
  alertSeverity?:    string
  status:            'queued' | 'investigating' | 'awaiting_approval' | 'completed' | 'failed'
  verdict?:          string | null
  confidence:        number
  summary?:          string
  executiveSummary?: string
  detailedReport?:   string
  recommendations?:  string[]
  iocList?:          string[]
  thoughts?:         unknown[]
  evidence?:         unknown[]
  totalSteps?:       number
  totalTokens?:      number
  durationMs?:       number
  agentModel?:       string
  createdAt:         string
  updatedAt?:        string
}

export interface AiInvestigationCreateResult {
  investigationId: string
  status:          string
  message:         string
}

export interface AiInvestigationStats {
  totalInvestigations: number
  truePositives:       number
  falsePositives:      number
  pendingReview:       number
  tpRate:              number
  fpRate:              number
  period:              string
}

export interface AssistantSuggestions {
  suggestions: string[]
}

export interface ComplianceReportDescriptor {
  type:      string
  name:      string
  available: boolean
}

export interface ComplianceReportCatalog {
  reports: ComplianceReportDescriptor[]
}
