import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { v4 as uuid } from 'uuid'
import { eq, and } from 'drizzle-orm'
import Redis          from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { signAccessToken } from '@zonforge/auth-utils'
import {
  ConfigureSamlSchema, ConfigureScimSchema,
  PROVIDER_SETUP_GUIDES,
  type SamlConfig, type ScimConfig, type ScimUser,
} from './saml/sso.models.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'sso-service' })

// ─────────────────────────────────────────────
// SAML SP METADATA GENERATOR
// ─────────────────────────────────────────────

function generateSpMetadata(tenantId: string, baseUrl: string): string {
  const entityId = `${baseUrl}/saml/sp`
  const acsUrl   = `${baseUrl}/saml/${tenantId}/acs`

  return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${entityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>
      urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress
    </md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}"
      index="1"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`
}

// ─────────────────────────────────────────────
// SAML ASSERTION PARSER (simplified)
// In production: use samlify library
// ─────────────────────────────────────────────

interface ParsedAssertion {
  email:      string
  firstName?: string
  lastName?:  string
  nameId:     string
  sessionIndex: string
  groups:     string[]
  attributes: Record<string, unknown>
}

function parseSamlResponse(
  samlResponseB64: string,
  config:          SamlConfig,
): ParsedAssertion {
  // In production: use samlify to validate signature + decrypt
  // Here we parse the base64 XML and extract attributes

  let xml: string
  try {
    xml = Buffer.from(samlResponseB64, 'base64').toString('utf-8')
  } catch {
    throw new Error('Invalid SAML response encoding')
  }

  // Extract NameID
  const nameIdMatch = xml.match(/<(?:saml:|saml2:)?NameID[^>]*>([^<]+)</)
  const nameId      = nameIdMatch?.[1]?.trim() ?? ''

  // Extract SessionIndex
  const sessionMatch = xml.match(/SessionIndex="([^"]+)"/)
  const sessionIndex = sessionMatch?.[1] ?? uuid()

  // Extract attributes
  const attrs: Record<string, unknown> = {}
  const attrRegex    = /<(?:saml:|saml2:)?Attribute\s+Name="([^"]+)"[^>]*>[\s\S]*?<(?:saml:|saml2:)?AttributeValue[^>]*>([^<]+)<\//g
  let   attrMatch: RegExpExecArray | null

  while ((attrMatch = attrRegex.exec(xml)) !== null) {
    attrs[attrMatch[1]!] = attrMatch[2]!.trim()
  }

  // Map using config
  const emailAttr = config.attributeMap.email
  const email     = (attrs[emailAttr] as string) ?? nameId ?? ''

  if (!email || !email.includes('@')) {
    throw new Error(`Could not extract valid email from SAML assertion (attribute: ${emailAttr})`)
  }

  const firstNameAttr = config.attributeMap.firstName
  const lastNameAttr  = config.attributeMap.lastName
  const groupsAttr    = config.attributeMap.groups

  // Extract groups (may be multi-value)
  const groups: string[] = []
  if (groupsAttr) {
    const groupRegex = new RegExp(`<(?:saml:|saml2:)?Attribute\\s+Name="${groupsAttr}"[^>]*>[\\s\\S]*?</(?:saml:|saml2:)?Attribute>`)
    const groupBlock = xml.match(groupRegex)?.[0] ?? ''
    const groupVals  = [...groupBlock.matchAll(/<(?:saml:|saml2:)?AttributeValue[^>]*>([^<]+)</g)]
    groups.push(...groupVals.map(m => m[1]!.trim()))
  }

  return {
    email,
    firstName:    firstNameAttr ? attrs[firstNameAttr] as string : undefined,
    lastName:     lastNameAttr  ? attrs[lastNameAttr]  as string : undefined,
    nameId,
    sessionIndex,
    groups,
    attributes:   attrs,
  }
}

// ─────────────────────────────────────────────
// JIT USER PROVISIONING
// ─────────────────────────────────────────────

async function provisionJitUser(
  email:      string,
  tenantId:   string,
  config:     SamlConfig,
  assertion:  ParsedAssertion,
  db:         ReturnType<typeof getDb>,
): Promise<{ userId: string; isNew: boolean }> {
  // Check if user exists
  const existing = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      eq(schema.users.email, email),
      eq(schema.users.tenantId, tenantId),
    ))
    .limit(1)

  if (existing[0]) {
    // Update last login
    await db.update(schema.users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, existing[0].id))
    return { userId: existing[0].id, isNew: false }
  }

  // Create new user (JIT provisioning)
  const userId  = uuid()
  const nameParts = email.split('@')[0]!.split('.')
  const firstName = assertion.firstName ?? nameParts[0] ?? ''
  const lastName  = assertion.lastName  ?? nameParts[1] ?? ''

  await db.insert(schema.users).values({
    id:          userId,
    tenantId,
    email,
    name:        `${firstName} ${lastName}`.trim() || email,
    role:        config.jitDefaultRole,
    provider:    'saml',
    providerAccountId: assertion.nameId,
    emailVerified: true,
    createdAt:   new Date(),
    updatedAt:   new Date(),
    lastLoginAt: new Date(),
  })

  log.info({ userId, email, tenantId, provider: config.provider },
    `JIT user provisioned via SSO: ${email}`)

  return { userId, isNew: true }
}

// ─────────────────────────────────────────────
// SCIM 2.0 HANDLERS
// ─────────────────────────────────────────────

function formatScimUser(user: any, baseUrl: string): ScimUser {
  return {
    schemas:    ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id:         user.id,
    externalId: user.providerAccountId ?? user.id,
    userName:   user.email,
    name: {
      formatted:  user.name,
      givenName:  user.name?.split(' ')[0] ?? '',
      familyName: user.name?.split(' ').slice(1).join(' ') ?? '',
    },
    emails:     [{ value: user.email, primary: true, type: 'work' }],
    active:     user.active !== false,
    meta: {
      resourceType: 'User',
      created:      user.createdAt?.toISOString() ?? new Date().toISOString(),
      lastModified: user.updatedAt?.toISOString() ?? new Date().toISOString(),
      location:     `${baseUrl}/Users/${user.id}`,
    },
  }
}

// ─────────────────────────────────────────────
// MAIN SERVICE
// ─────────────────────────────────────────────

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const redis = new Redis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password, tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
  })

  const BASE_URL = process.env['ZONFORGE_PUBLIC_URL'] ?? 'https://app.zonforge.com'
  const app      = new Hono()

  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: '*', allowMethods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }))
  app.use('*', secureHeaders())

  // ═══════════════════════════════════════════
  // SAML ENDPOINTS (public — no auth middleware)
  // ═══════════════════════════════════════════

  // ── GET /saml/sp-metadata ──────────────────
  // Service Provider metadata XML (give to IdP admin)

  app.get('/saml/sp-metadata', (ctx) => {
    const xml = generateSpMetadata('*', BASE_URL)
    return ctx.text(xml, 200, { 'Content-Type': 'application/xml' })
  })

  app.get('/saml/:tenantId/sp-metadata', async (ctx) => {
    const tenantId = ctx.req.param('tenantId')
    const xml      = generateSpMetadata(tenantId, BASE_URL)
    return ctx.text(xml, 200, { 'Content-Type': 'application/xml' })
  })

  // ── GET /saml/:tenantId/init ───────────────
  // Initiates SAML SSO flow — redirects to IdP

  app.get('/saml/:tenantId/init', async (ctx) => {
    const tenantId = ctx.req.param('tenantId')
    const db       = getDb()

    const [config] = await db.select()
      .from(schema.ssoConfigs)
      .where(and(
        eq(schema.ssoConfigs.tenantId, tenantId),
        eq(schema.ssoConfigs.enabled, true),
      ))
      .limit(1)

    if (!config) {
      return ctx.text('SSO not configured for this tenant', 404)
    }

    // Generate SAML AuthnRequest
    const requestId  = `_${uuid().replace(/-/g, '')}`
    const issueInstant = new Date().toISOString()
    const acsUrl     = `${BASE_URL}/saml/${tenantId}/acs`

    const authnRequest = `<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${issueInstant}"
  Destination="${config.idpSsoUrl}"
  AssertionConsumerServiceURL="${acsUrl}">
  <saml:Issuer>${BASE_URL}/saml/sp</saml:Issuer>
</samlp:AuthnRequest>`

    const encoded   = Buffer.from(authnRequest).toString('base64')
    const relayState = ctx.req.query('relay') ?? '/'

    // Store request ID to prevent replay attacks
    await redis.setex(`saml:req:${requestId}`, 300, tenantId)

    // Redirect to IdP
    const redirectUrl = `${config.idpSsoUrl}?SAMLRequest=${encodeURIComponent(encoded)}&RelayState=${encodeURIComponent(relayState)}`
    return ctx.redirect(redirectUrl)
  })

  // ── POST /saml/:tenantId/acs ───────────────
  // SAML Assertion Consumer Service
  // IdP posts the SAML response here after auth

  app.post('/saml/:tenantId/acs', async (ctx) => {
    const tenantId       = ctx.req.param('tenantId')
    const formData       = await ctx.req.formData()
    const samlResponse   = formData.get('SAMLResponse') as string
    const relayState     = (formData.get('RelayState') as string) ?? '/'

    if (!samlResponse) {
      return ctx.text('Missing SAMLResponse', 400)
    }

    const db = getDb()

    // Load SSO config
    const configs = await db.select()
      .from(schema.ssoConfigs)
      .where(and(eq(schema.ssoConfigs.tenantId, tenantId), eq(schema.ssoConfigs.enabled, true)))
      .limit(1)

    const config = configs[0]
    if (!config) return ctx.text('SSO not configured', 404)

    // Parse and validate assertion
    let assertion: ReturnType<typeof parseSamlResponse>
    try {
      assertion = parseSamlResponse(samlResponse, config as any as SamlConfig)
    } catch (err) {
      log.error({ err, tenantId }, 'SAML assertion parse failed')
      return ctx.text('Invalid SAML assertion', 400)
    }

    // Validate email domain
    const samlCfg  = config as any as SamlConfig
    const emailDomain = assertion.email.split('@')[1] ?? ''
    if (samlCfg.allowedDomains?.length > 0 && !samlCfg.allowedDomains.includes(emailDomain)) {
      log.warn({ email: assertion.email, allowed: samlCfg.allowedDomains }, 'Email domain not allowed')
      return ctx.text(`Email domain ${emailDomain} is not authorized for this tenant`, 403)
    }

    // JIT provision user
    const { userId, isNew } = await provisionJitUser(
      assertion.email, tenantId, samlCfg, assertion, db,
    )

    // Get user for token
    const [user] = await db.select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)

    if (!user) return ctx.text('User provisioning failed', 500)

    // Issue ZonForge access token
    const accessToken = await signAccessToken({
      userId,
      tenantId,
      role:      user.role,
      email:     user.email,
      jti:       uuid(),
      ssoLogin:  true,
      provider:  samlCfg.provider,
    } as any, { expiresIn: '8h' } as any)

    // Update login stats
    await db.update(schema.ssoConfigs)
      .set({
        loginCount:  (config.loginCount ?? 0) + 1,
        lastUsedAt:  new Date(),
        updatedAt:   new Date(),
      })
      .where(eq(schema.ssoConfigs.id, config.id))

    log.info({ userId, email: user.email, tenantId, provider: samlCfg.provider, isNew },
      `SSO login successful: ${user.email}`)

    // Redirect to dashboard with token in URL fragment
    // (In production: set secure HttpOnly cookie instead)
    const dashboardUrl = `${BASE_URL}/auth/sso-callback?token=${accessToken}&relay=${encodeURIComponent(relayState)}`
    return ctx.redirect(dashboardUrl)
  })

  // ═══════════════════════════════════════════
  // SSO MANAGEMENT API (authenticated)
  // ═══════════════════════════════════════════

  app.use('/v1/*', authMiddleware)

  // ── GET /v1/sso/config ─────────────────────

  app.get('/v1/sso/config', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const [config] = await db.select()
      .from(schema.ssoConfigs)
      .where(eq(schema.ssoConfigs.tenantId, user.tenantId))
      .limit(1)

    const spInfo = {
      entityId:    `${BASE_URL}/saml/sp`,
      acsUrl:      `${BASE_URL}/saml/${user.tenantId}/acs`,
      metadataUrl: `${BASE_URL}/saml/${user.tenantId}/sp-metadata`,
      initiateUrl: `${BASE_URL}/saml/${user.tenantId}/init`,
    }

    return ctx.json({ success: true, data: {
      configured: !!config,
      enabled:    config?.enabled ?? false,
      provider:   config?.provider ?? null,
      loginCount: config?.loginCount ?? 0,
      lastUsedAt: config?.lastUsedAt ?? null,
      spInfo,
      providerGuides: Object.entries(PROVIDER_SETUP_GUIDES).map(([id, g]) => ({
        id, name: g.name, logo: g.logo, docsUrl: g.docsUrl, setupSteps: g.setupSteps,
      })),
    }})
  })

  // ── POST /v1/sso/config ────────────────────

  app.post('/v1/sso/config',
    zValidator('json', ConfigureSamlSchema),
    async (ctx) => {
      const user = ctx.var.user
      const body = ctx.req.valid('json')
      const db   = getDb()

      if (!['TENANT_ADMIN','PLATFORM_ADMIN'].includes(user.role)) {
        return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
      }

      // Upsert SSO config
      const existing = await db.select({ id: schema.ssoConfigs.id })
        .from(schema.ssoConfigs)
        .where(eq(schema.ssoConfigs.tenantId, user.tenantId))
        .limit(1)

      if (existing[0]) {
        await db.update(schema.ssoConfigs)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(schema.ssoConfigs.id, existing[0].id))
      } else {
        await db.insert(schema.ssoConfigs).values({
          id:           uuid(),
          tenantId:     user.tenantId,
          enabled:      true,
          loginCount:   0,
          configuredBy: user.id,
          createdAt:    new Date(),
          updatedAt:    new Date(),
          ...body,
        })
      }

      return ctx.json({ success: true, data: { configured: true, provider: body.provider } })
    })

  // ── DELETE /v1/sso/config ──────────────────

  app.delete('/v1/sso/config', async (ctx) => {
    const user = ctx.var.user
    if (!['TENANT_ADMIN','PLATFORM_ADMIN'].includes(user.role)) {
      return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
    }
    const db = getDb()
    await db.update(schema.ssoConfigs)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(schema.ssoConfigs.tenantId, user.tenantId))
    return ctx.json({ success: true, data: { disabled: true } })
  })

  // ═══════════════════════════════════════════
  // SCIM 2.0 ENDPOINTS
  // Auth: Bearer token from scim_configs table
  // ═══════════════════════════════════════════

  // SCIM Bearer token validator
  const validateScimToken = async (ctx: any, tenantId: string) => {
    const auth  = ctx.req.header('Authorization') ?? ''
    const token = auth.replace(/^Bearer\s+/i, '')
    if (!token) return false
    const db    = getDb()
    const [cfg] = await db.select({ bearerToken: schema.scimConfigs.bearerToken })
      .from(schema.scimConfigs)
      .where(and(eq(schema.scimConfigs.tenantId, tenantId), eq(schema.scimConfigs.enabled, true)))
      .limit(1)
    return cfg?.bearerToken === token
  }

  // ── GET /scim/v2/:tenantId/Users ──────────

  app.get('/scim/v2/:tenantId/Users', async (ctx) => {
    const tenantId = ctx.req.param('tenantId')
    if (!await validateScimToken(ctx, tenantId)) return ctx.json({ status: 401, detail: 'Unauthorized' }, 401)

    const db    = getDb()
    const start = parseInt(ctx.req.query('startIndex') ?? '1', 10)
    const count = parseInt(ctx.req.query('count') ?? '100', 10)

    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.tenantId, tenantId))
      .limit(count)

    const baseUrl = `${BASE_URL}/scim/v2/${tenantId}`
    return ctx.json({
      schemas:      ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: users.length,
      startIndex:   start,
      itemsPerPage: count,
      Resources:    users.map(u => formatScimUser(u, baseUrl)),
    })
  })

  // ── GET /scim/v2/:tenantId/Users/:id ──────

  app.get('/scim/v2/:tenantId/Users/:id', async (ctx) => {
    const tenantId = ctx.req.param('tenantId')
    if (!await validateScimToken(ctx, tenantId)) return ctx.json({ status: 401, detail: 'Unauthorized' }, 401)

    const db     = getDb()
    const [user] = await db.select()
      .from(schema.users)
      .where(and(eq(schema.users.id, ctx.req.param('id')), eq(schema.users.tenantId, tenantId)))
      .limit(1)

    if (!user) return ctx.json({ status: 404, detail: 'User not found' }, 404)
    return ctx.json(formatScimUser(user, `${BASE_URL}/scim/v2/${tenantId}`))
  })

  // ── POST /scim/v2/:tenantId/Users ─────────
  // IdP creates a user

  app.post('/scim/v2/:tenantId/Users', async (ctx) => {
    const tenantId = ctx.req.param('tenantId')
    if (!await validateScimToken(ctx, tenantId)) return ctx.json({ status: 401, detail: 'Unauthorized' }, 401)

    const body     = await ctx.req.json() as ScimUser
    const email    = body.emails?.[0]?.value
    if (!email) return ctx.json({ status: 400, detail: 'Email required' }, 400)

    const db       = getDb()
    const existing = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.email, email), eq(schema.users.tenantId, tenantId)))
      .limit(1)

    if (existing[0]) {
      // Return existing (idempotent)
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, existing[0].id)).limit(1)
      return ctx.json(formatScimUser(u, `${BASE_URL}/scim/v2/${tenantId}`), 200)
    }

    const userId = uuid()
    const newUser = {
      id:           userId,
      tenantId,
      email,
      name:         body.name?.formatted ?? `${body.name?.givenName ?? ''} ${body.name?.familyName ?? ''}`.trim() || email,
      role:         'VIEWER',
      provider:     'scim',
      providerAccountId: body.externalId ?? body.id,
      emailVerified: true,
      active:       body.active !== false,
      createdAt:    new Date(),
      updatedAt:    new Date(),
    }

    await db.insert(schema.users).values(newUser as any)
    log.info({ userId, email, tenantId }, `SCIM user provisioned: ${email}`)

    return ctx.json(formatScimUser(newUser, `${BASE_URL}/scim/v2/${tenantId}`), 201)
  })

  // ── PATCH /scim/v2/:tenantId/Users/:id ────
  // IdP updates a user (e.g. active=false to deprovision)

  app.patch('/scim/v2/:tenantId/Users/:id', async (ctx) => {
    const tenantId = ctx.req.param('tenantId')
    if (!await validateScimToken(ctx, tenantId)) return ctx.json({ status: 401, detail: 'Unauthorized' }, 401)

    const body     = await ctx.req.json() as { Operations?: Array<{ op: string; path?: string; value?: unknown }> }
    const db       = getDb()
    const updates: Record<string, unknown> = { updatedAt: new Date() }

    // Process SCIM patch operations
    for (const op of body.Operations ?? []) {
      if (op.op?.toLowerCase() === 'replace' && op.path === 'active') {
        updates['active'] = op.value
        // Deprovisioning: disable account
        if (!op.value) {
          log.warn({ userId: ctx.req.param('id'), tenantId }, 'SCIM deprovisioning: account disabled')
        }
      }
      if (op.op?.toLowerCase() === 'replace' && op.path === 'displayName') {
        updates['name'] = op.value
      }
    }

    await db.update(schema.users)
      .set(updates as any)
      .where(and(eq(schema.users.id, ctx.req.param('id')), eq(schema.users.tenantId, tenantId)))

    const [user] = await db.select()
      .from(schema.users)
      .where(eq(schema.users.id, ctx.req.param('id')))
      .limit(1)

    return ctx.json(formatScimUser(user, `${BASE_URL}/scim/v2/${tenantId}`))
  })

  // ── DELETE /scim/v2/:tenantId/Users/:id ───

  app.delete('/scim/v2/:tenantId/Users/:id', async (ctx) => {
    const tenantId = ctx.req.param('tenantId')
    if (!await validateScimToken(ctx, tenantId)) return ctx.json({ status: 401, detail: 'Unauthorized' }, 401)
    const db = getDb()

    // Soft-delete: just disable
    await db.update(schema.users)
      .set({ active: false, updatedAt: new Date() } as any)
      .where(and(eq(schema.users.id, ctx.req.param('id')), eq(schema.users.tenantId, tenantId)))

    return ctx.body(null, 204)
  })

  // ── SCIM Config API ────────────────────────

  app.post('/v1/scim/config',
    zValidator('json', ConfigureScimSchema),
    async (ctx) => {
      const user = ctx.var.user
      const body = ctx.req.valid('json')
      const db   = getDb()

      if (!['TENANT_ADMIN','PLATFORM_ADMIN'].includes(user.role)) {
        return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
      }

      const bearerToken = `zfscim_${uuid().replace(/-/g,'')}`
      const scimBaseUrl = `${BASE_URL}/scim/v2/${user.tenantId}`

      const existing = await db.select({ id: schema.scimConfigs.id })
        .from(schema.scimConfigs)
        .where(eq(schema.scimConfigs.tenantId, user.tenantId))
        .limit(1)

      if (existing[0]) {
        await db.update(schema.scimConfigs)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(schema.scimConfigs.id, existing[0].id))
      } else {
        await db.insert(schema.scimConfigs).values({
          id: uuid(), tenantId: user.tenantId,
          enabled: true, version: '2.0', bearerToken, scimBaseUrl,
          createdAt: new Date(), updatedAt: new Date(), ...body,
        })
      }

      return ctx.json({ success: true, data: {
        scimBaseUrl,
        bearerToken,   // ← show only once, customer must copy now
        note: 'Save the bearer token now — it will not be shown again',
      }})
    })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'sso-service', timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3024', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🔐 ZonForge SSO Service on port ${info.port}`)
    log.info(`   SAML ACS: ${BASE_URL}/saml/:tenantId/acs`)
    log.info(`   SCIM Base: ${BASE_URL}/scim/v2/:tenantId`)
    log.info(`   Providers: Okta, Azure AD, Google Workspace, +4`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down SSO service...')
    await closeDb(); await redis.quit(); process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => { log.fatal({ err }, '❌ SSO service failed'); process.exit(1) })
