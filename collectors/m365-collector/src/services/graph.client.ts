import { createLogger } from '@zonforge/logger'
import { sleep } from '@zonforge/collector-base'

// ─────────────────────────────────────────────
// Microsoft Graph API Client
//
// Uses client credentials OAuth2 flow
// (Application permissions — no user interaction)
// Required Graph API permissions:
//   - AuditLog.Read.All
//   - Directory.Read.All
// ─────────────────────────────────────────────

const log = createLogger({ service: 'collector:m365:graph' })

async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

function toFormUrlEncoded(values: Record<string, string>): string {
  return new URLSearchParams(values).toString()
}

interface GraphDeltaResponse {
  value: Array<Record<string, unknown>>
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

interface GraphListResponse {
  value: Array<Record<string, unknown>>
  '@odata.nextLink'?: string
}

export interface M365AuthConfig {
  azureTenantId: string     // Azure AD tenant GUID (NOT ZonForge tenant)
  clientId:      string
  clientSecret:  string
}

interface TokenCache {
  accessToken: string
  expiresAt:   number
}

export class M365GraphClient {
  private tokenCache: TokenCache | null = null

  constructor(private readonly auth: M365AuthConfig) {}

  // ── Get (and cache) OAuth token ───────────

  private async getToken(): Promise<string> {
    const now = Date.now()

    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.accessToken
    }

    const url  = `https://login.microsoftonline.com/${this.auth.azureTenantId}/oauth2/v2.0/token`
    const body = toFormUrlEncoded({
      client_id:     this.auth.clientId,
      client_secret: this.auth.clientSecret,
      scope:         'https://graph.microsoft.com/.default',
      grant_type:    'client_credentials',
    })

    const resp = await fetchWithTimeout(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }, 15_000)

    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`M365 OAuth failed (${resp.status}): ${err}`)
    }

    const data = await resp.json() as {
      access_token: string
      expires_in:   number
    }

    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt:   now + data.expires_in * 1000,
    }

    return this.tokenCache.accessToken
  }

  // ── Generic Graph API GET ─────────────────

  private async graphGet<T>(url: string): Promise<T> {
    const token = await this.getToken()
    const resp  = await fetchWithTimeout(url, {
      headers: {
        Authorization:    `Bearer ${token}`,
        'Content-Type':   'application/json',
        ConsistencyLevel: 'eventual',
      },
    }, 30_000)

    if (resp.status === 429) {
      // Throttled — respect Retry-After header
      const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '60', 10)
      log.warn({ retryAfter }, 'Graph API throttled — backing off')
      await sleep(retryAfter * 1000)
      return this.graphGet<T>(url)   // retry once
    }

    if (!resp.ok) {
      throw new Error(`Graph API error ${resp.status}: ${await resp.text()}`)
    }

    return resp.json() as Promise<T>
  }

  // ── Sign-in logs (delta query — only new events since last call) ──

  async getSignInsDelta(
    deltaLink?:   string,   // from previous call's @odata.deltaLink
    startDateTime?: string, // ISO datetime for first call
  ): Promise<{
    events:    Array<Record<string, unknown>>
    deltaLink: string
    hasMore:   boolean
  }> {
    let url: string

    if (deltaLink) {
      url = deltaLink
    } else {
      const filter = startDateTime
        ? `&$filter=createdDateTime ge ${startDateTime}`
        : ''
      url = `https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=999${filter}`
    }

    const events: Array<Record<string, unknown>> = []
    let   nextDeltaLink = ''
    let   hasMore       = false

    // Follow @odata.nextLink pagination
    let currentUrl: string | null = url
    while (currentUrl) {
      const data: GraphDeltaResponse = await this.graphGet<GraphDeltaResponse>(currentUrl)

      events.push(...(data.value ?? []))

      if (data['@odata.deltaLink']) {
        nextDeltaLink = data['@odata.deltaLink']
        hasMore       = false
        currentUrl    = null
      } else if (data['@odata.nextLink']) {
        currentUrl = data['@odata.nextLink']
        hasMore    = true
      } else {
        currentUrl = null
      }

      // Safety: yield between pages to avoid tight loops
      if (currentUrl) await sleep(200)
    }

    return { events, deltaLink: nextDeltaLink, hasMore }
  }

  // ── Audit logs (admin, users, apps, etc.) ─────────────────────

  async getAuditLogs(
    startDateTime: string,
    endDateTime?:  string,
    categories:    string[] = ['UserManagement', 'RoleManagement', 'Application', 'Policy'],
    top = 999,
  ): Promise<Array<Record<string, unknown>>> {
    const end    = endDateTime ?? new Date().toISOString()
    const events: Array<Record<string, unknown>> = []

    for (const category of categories) {
      let url: string | null =
        `https://graph.microsoft.com/v1.0/auditLogs/directoryAudits` +
        `?$top=${top}` +
        `&$filter=activityDateTime ge ${startDateTime} and activityDateTime le ${end}` +
        ` and loggedByService eq '${category}'`

      while (url) {
        const data: GraphListResponse = await this.graphGet<GraphListResponse>(url)

        events.push(...(data.value ?? []))
        url = data['@odata.nextLink'] ?? null
        if (url) await sleep(100)
      }
    }

    return events
  }

  // ── Risky users (Identity Protection) ────────────────────────

  async getRiskyUsers(top = 100): Promise<Array<Record<string, unknown>>> {
    const data = await this.graphGet<{
      value: Array<Record<string, unknown>>
    }>(
      `https://graph.microsoft.com/v1.0/identityProtection/riskyUsers?$top=${top}`,
    )
    return data.value ?? []
  }

  // ── Risky sign-ins ────────────────────────────────────────────

  async getRiskySignIns(
    startDateTime: string,
    top = 100,
  ): Promise<Array<Record<string, unknown>>> {
    const data = await this.graphGet<{
      value: Array<Record<string, unknown>>
    }>(
      `https://graph.microsoft.com/v1.0/identityProtection/riskyServicePrincipals` +
      `?$top=${top}&$filter=lastUpdatedDateTime ge ${startDateTime}`,
    ).catch(() => ({ value: [] }))
    return (data as any).value ?? []
  }

  // ── Service principal sign-ins ────────────────────────────────

  async getServicePrincipalSignIns(
    startDateTime: string,
  ): Promise<Array<Record<string, unknown>>> {
    const data = await this.graphGet<{
      value: Array<Record<string, unknown>>
    }>(
      `https://graph.microsoft.com/v1.0/auditLogs/servicePrincipalSignIns` +
      `?$top=500&$filter=createdDateTime ge ${startDateTime}`,
    ).catch(() => ({ value: [] }))
    return data.value ?? []
  }
}
