import { v4 as uuid } from 'uuid'
import type { ScenarioStep } from '../models/simulation-result.js'
import { SIMULATION_MARKER_PREFIX } from '../models/simulation-result.js'

// ─────────────────────────────────────────────
// SIMULATION EVENT GENERATOR
//
// Generates realistic OCSF-compatible events
// for injection into the existing ingestion pipeline.
//
// ALL generated events include:
//   _simulation: true        → never triggers real playbooks
//   _sim_marker: <id>        → links events to a simulation run
//   _sim_tenant: <tenantId>  → maintains tenant isolation
//
// Safety invariants:
//   - No real userIds from production DB
//   - No real IP addresses (uses TEST-NET RFC 5737)
//   - No real emails (uses @sim.zonforge.internal)
// ─────────────────────────────────────────────

export interface GeneratedEvent {
  id:            string
  tenantId:      string
  sourceType:    string
  eventAction:   string
  eventCategory: string
  actorUserId:   string
  actorIp:       string
  actorCountry:  string
  targetAssetId: string | null
  targetResource: string | null
  outcome:       string
  eventTime:     Date
  rawEvent:      Record<string, unknown>
  // Safety markers
  _simulation:   true
  _simMarker:    string
  _simStep:      number
}

// RFC 5737 TEST-NET IPs — safe to use in tests, never route to real hosts
const TEST_IPS = [
  '192.0.2.1',   '192.0.2.42',  '192.0.2.100', '192.0.2.200',
  '198.51.100.1', '198.51.100.99', '203.0.113.1', '203.0.113.42',
]

const SIM_ACTORS = [
  'alice.sim@sim.zonforge.internal',
  'bob.sim@sim.zonforge.internal',
  'svc-deploy.sim@sim.zonforge.internal',
  'charlie.sim@sim.zonforge.internal',
]

const SIM_ASSETS = [
  'asset-sim-web-01', 'asset-sim-db-01', 'asset-sim-app-01',
  'asset-sim-admin-01', 'asset-sim-storage-01',
]

const COUNTRY_FOR_IP: Record<string, string> = {
  '192.0.2.1':    'US',
  '192.0.2.42':   'US',
  '192.0.2.100':  'US',
  '192.0.2.200':  'US',
  '198.51.100.1':  'DE',
  '198.51.100.99': 'DE',
  '203.0.113.1':   'CN',
  '203.0.113.42':  'CN',
}

// ─────────────────────────────────────────────
// EVENT TEMPLATES PER TYPE
// ─────────────────────────────────────────────

type EventTemplate = (
  actor: string, ip: string, country: string,
  asset: string, params: Record<string, unknown>,
  simMarker: string, tenantId: string,
) => Omit<GeneratedEvent, 'id' | 'eventTime' | '_simulation' | '_simMarker' | '_simStep' | 'tenantId'>

const EVENT_TEMPLATES: Record<string, EventTemplate> = {

  user_login_failed: (actor, ip, country, asset, params, marker) => ({
    sourceType:    (params.source_type as string) ?? 'm365_entra',
    eventAction:   'login',
    eventCategory: 'authentication',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: asset,
    targetResource: null,
    outcome:       'failure',
    rawEvent: {
      userPrincipalName: actor,
      ipAddress:         ip,
      location:          { countryOrRegion: country },
      status:            { errorCode: 50126 },
      appDisplayName:    'Microsoft 365',
      _simMarker:        marker,
      _simulation:       true,
    },
  }),

  user_login_success: (actor, ip, country, asset, params, marker) => ({
    sourceType:    (params.source_type as string) ?? 'm365_entra',
    eventAction:   'login',
    eventCategory: 'authentication',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: asset,
    targetResource: null,
    outcome:       'success',
    rawEvent: {
      userPrincipalName:  actor,
      ipAddress:          ip,
      location:           { countryOrRegion: country },
      status:             { errorCode: 0 },
      authenticationRequirement: 'multiFactorAuthentication',
      appDisplayName:     'Microsoft 365',
      _simMarker:         marker,
      _simulation:        true,
    },
  }),

  iam_role_change: (actor, ip, country, asset, params, marker) => ({
    sourceType:    (params.source_type as string) ?? 'm365_entra',
    eventAction:   (params.event_action as string) ?? 'Add member to role',
    eventCategory: 'iam',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: (params.target_role as string) ?? 'Global Administrator',
    outcome:       'success',
    rawEvent: {
      actorId:           actor,
      modifiedProperties: [{
        name:    'Role.DisplayName',
        newValue: params.target_role ?? 'Global Administrator',
        oldValue: 'User',
      }],
      targetResources: [{ userPrincipalName: 'target.sim@sim.zonforge.internal' }],
      _simMarker:        marker,
      _simulation:       true,
    },
  }),

  iam_role_list: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'aws_cloudtrail',
    eventAction:   'ListRoles',
    eventCategory: 'iam',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: 'iam',
    outcome:       'success',
    rawEvent: {
      eventSource: 'iam.amazonaws.com',
      eventName:   'ListRoles',
      userIdentity: { type: 'AssumedRole', arn: `arn:aws:sts::123456789012:assumed-role/sim-role/${actor}` },
      sourceIPAddress: ip,
      _simMarker:  marker,
      _simulation: true,
    },
  }),

  file_download: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'm365_entra',
    eventAction:   'FileDownloaded',
    eventCategory: 'file',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: asset,
    targetResource: `/sites/SimDocLib-${marker.slice(-4)}/Documents/sensitive-doc-${uuid().slice(0,6)}.xlsx`,
    outcome:       'success',
    rawEvent: {
      userId:        actor,
      SourceFileName: `sensitive-doc-${uuid().slice(0,6)}.xlsx`,
      SourceRelativeUrl: '/sites/SimDocLib/Documents',
      SiteUrl:        'https://sim.sharepoint.com',
      ObjectId:       uuid(),
      ClientIP:       ip,
      _simMarker:     marker,
      _simulation:    true,
    },
  }),

  file_access: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'm365_entra',
    eventAction:   'FileAccessed',
    eventCategory: 'file',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: asset,
    targetResource: `/sites/SimDocLib/Documents/file-${uuid().slice(0,6)}`,
    outcome:       'success',
    rawEvent: {
      userId:   actor,
      ClientIP: ip,
      _simMarker: marker,
      _simulation: true,
    },
  }),

  file_list: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'm365_entra',
    eventAction:   'FileAccessed',
    eventCategory: 'file',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: asset,
    targetResource: '/sites/SimDocLib',
    outcome:       'success',
    rawEvent: { userId: actor, ClientIP: ip, _simMarker: marker, _simulation: true },
  }),

  email_rule_created: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'm365_entra',
    eventAction:   'New-InboxRule',
    eventCategory: 'email',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: 'InboxRule',
    outcome:       'success',
    rawEvent: {
      UserId:     actor,
      ClientIP:   ip,
      Parameters: JSON.stringify([
        { Name: 'ForwardTo', Value: params.forward_to ?? 'sim-attacker@external-sim.invalid' },
        { Name: 'Name',      Value: 'sim-forward-rule' },
      ]),
      _simMarker:  marker,
      _simulation: true,
    },
  }),

  email_sent_external: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'm365_entra',
    eventAction:   'Send',
    eventCategory: 'email',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: `sim-target@${params.recipient_domain ?? 'external-sim.invalid'}`,
    outcome:       'success',
    rawEvent: {
      SenderAddress:    actor,
      RecipientAddress: `sim-target@${params.recipient_domain ?? 'external-sim.invalid'}`,
      HasAttachments:   true,
      _simMarker:       marker,
      _simulation:      true,
    },
  }),

  oauth_consent_granted: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'm365_entra',
    eventAction:   'Consent to application',
    eventCategory: 'oauth',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: (params.app_name as string) ?? 'SimMaliciousApp',
    outcome:       'success',
    rawEvent: {
      actorId:          actor,
      targetResources:  [{
        displayName: params.app_name ?? 'SimMaliciousApp',
        modifiedProperties: [{ name: 'ConsentType', newValue: 'AllPrincipals' }],
      }],
      ModifiedProperties: [{ Name: 'ConsentContext.Scopes', NewValue: JSON.stringify(params.scopes ?? ['Mail.ReadWrite']) }],
      _simMarker:        marker,
      _simulation:       true,
    },
  }),

  oauth_token_issued: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'm365_entra',
    eventAction:   'Add OAuth2PermissionGrant',
    eventCategory: 'oauth',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: 'OAuth2PermissionGrant',
    outcome:       'success',
    rawEvent: { actorId: actor, _simMarker: marker, _simulation: true },
  }),

  mail_read_api: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'm365_entra',
    eventAction:   'MailItemsAccessed',
    eventCategory: 'email',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: 'Mailbox',
    outcome:       'success',
    rawEvent: { userId: actor, OperationCount: 1, _simMarker: marker, _simulation: true },
  }),

  iam_credential_report: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'aws_cloudtrail',
    eventAction:   'GenerateCredentialReport',
    eventCategory: 'iam',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: 'iam',
    outcome:       'success',
    rawEvent: {
      eventSource: 'iam.amazonaws.com',
      eventName:   'GenerateCredentialReport',
      _simMarker:  marker,
      _simulation: true,
    },
  }),

  iam_access_key_created: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'aws_cloudtrail',
    eventAction:   'CreateAccessKey',
    eventCategory: 'iam',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: 'AccessKey',
    outcome:       'success',
    rawEvent: {
      eventSource:      'iam.amazonaws.com',
      eventName:        'CreateAccessKey',
      requestParameters: { userName: 'sim-backdoor-user' },
      _simMarker:       marker,
      _simulation:      true,
    },
  }),

  admin_action: (actor, ip, country, asset, params, marker) => ({
    sourceType:    'm365_entra',
    eventAction:   (params.event_action as string) ?? 'admin_change',
    eventCategory: 'iam',
    actorUserId:   actor,
    actorIp:       ip,
    actorCountry:  country,
    targetAssetId: null,
    targetResource: 'OrganizationSettings',
    outcome:       'success',
    rawEvent: { actorId: actor, _simMarker: marker, _simulation: true },
  }),
}

// ─────────────────────────────────────────────
// MAIN GENERATOR
// ─────────────────────────────────────────────

export function generateEventsForStep(
  step:      ScenarioStep,
  simMarker: string,
  tenantId:  string,
  actorSeed: number = 0,
): GeneratedEvent[] {
  const template = EVENT_TEMPLATES[step.event_type]
  if (!template) {
    throw new Error(`No event template for type: ${step.event_type}`)
  }

  const events: GeneratedEvent[] = []
  const baseTime = Date.now()

  // Use TEST-NET IPs
  const ipIndex   = parseInt(step.params.actor_ip as string ?? '', 10) || (actorSeed % TEST_IPS.length)
  const ip        = (step.params.actor_ip as string) ?? TEST_IPS[ipIndex % TEST_IPS.length]!
  const country   = (step.params.actor_country as string) ?? COUNTRY_FOR_IP[ip] ?? 'US'
  const actorBase = (step.params.actor_type as string) === 'service_account'
    ? `svc-sim-${actorSeed}@sim.zonforge.internal`
    : SIM_ACTORS[actorSeed % SIM_ACTORS.length]!

  for (let i = 0; i < step.count; i++) {
    const actor = (step.params.vary_target_asset as boolean)
      ? actorBase
      : actorBase
    const asset = (step.params.vary_target_asset as boolean)
      ? SIM_ASSETS[i % SIM_ASSETS.length]!
      : SIM_ASSETS[0]!

    const eventBase = template(actor, ip, country, asset, step.params, simMarker, tenantId)

    events.push({
      ...eventBase,
      id:          uuid(),
      tenantId,
      eventTime:   new Date(baseTime + i * step.delay_ms),
      _simulation: true,
      _simMarker:  simMarker,
      _simStep:    step.step,
    })
  }

  return events
}

// ─────────────────────────────────────────────
// SAFETY VALIDATOR
//
// Final safety check before any event is injected.
// Ensures no production data is leaked or modified.
// ─────────────────────────────────────────────

export function validateEventSafety(event: GeneratedEvent): {
  safe: boolean
  violations: string[]
} {
  const violations: string[] = []

  if (!event._simulation) violations.push('Missing _simulation:true marker')
  if (!event._simMarker?.startsWith(SIMULATION_MARKER_PREFIX)) violations.push('Missing or invalid simulation marker')

  // Block real domains
  if (event.actorUserId && !event.actorUserId.endsWith('@sim.zonforge.internal') &&
      !event.actorUserId.startsWith('svc-sim-')) {
    violations.push(`Real actor email detected: ${event.actorUserId}`)
  }

  // Block non-TEST-NET IPs
  const isTestNet = event.actorIp.startsWith('192.0.2.') ||
                    event.actorIp.startsWith('198.51.100.') ||
                    event.actorIp.startsWith('203.0.113.')
  if (!isTestNet) violations.push(`Non-TEST-NET IP detected: ${event.actorIp}`)

  // Block destructive event types
  const BLOCKED_ACTIONS = ['delete', 'destroy', 'terminate', 'drop', 'truncate', 'purge']
  const actionLower = event.eventAction.toLowerCase()
  for (const blocked of BLOCKED_ACTIONS) {
    if (actionLower === blocked) violations.push(`Blocked destructive action: ${event.eventAction}`)
  }

  return { safe: violations.length === 0, violations }
}
