import type { NormalizedEvent } from '../ocsf.types.js'
import { OCSF_CLASSES, OCSF_CATEGORIES, OCSF_SEVERITY } from '../ocsf.types.js'

// ─────────────────────────────────────────────
// Google Workspace Reports API → OCSF Mapping
// Applications: login, admin, drive, token, groups
// ─────────────────────────────────────────────

type GoogleWorkspaceActivity = {
  kind: string
  id: {
    time: string
    uniqueQualifier: string
    applicationName: string
    customerId: string
  }
  actor: {
    email: string
    profileId: string
    callerType?: string
  }
  ipAddress: string
  events: Array<{
    type: string
    name: string
    parameters?: Array<{
      name: string
      value?: string
      boolValue?: boolean
      intValue?: string
      multiValue?: string[]
    }>
  }>
}

export function mapGoogleWorkspaceActivity(
  raw: GoogleWorkspaceActivity,
  tenantId: string,
  connectorId: string,
  eventId: string,
): Partial<NormalizedEvent> {
  const appName = raw.id.applicationName
  const event = raw.events[0]
  if (!event) throw new Error('GoogleWorkspace activity has no events array')

  const params = parseParams(event.parameters ?? [])
  const eventAction = normalizeGoogleAction(appName, event.name)
  const isFailure = isFailedAction(event.name, params)

  const ocsfClass = resolveOcsfClass(appName)
  const severityId = resolveSeverity(appName, event.name, event.type)

  return {
    eventId,
    tenantId,
    connectorId,
    ocsfClassUid: ocsfClass,
    ocsfCategoryUid: OCSF_CATEGORIES.IDENTITY_ACCESS,
    ocsfActivityId: appName === 'login' ? 1 : 0,
    ocsfSeverityId: severityId,
    sourceType: 'google_workspace',
    eventCategory: resolveCategory(appName),
    eventAction,
    outcome: isFailure ? 'failure' : 'success',

    actorUserEmail: raw.actor.email,
    actorUserName: raw.actor.email.split('@')[0] ?? null,
    actorUserType: raw.actor.callerType === 'KEY' ? 'service_account' : 'user',
    actorIp: raw.ipAddress || null,
    actorIpCountry: null,
    actorIpCity: null,
    actorIpIsVpn: null,
    actorIpIsTor: null,
    actorUserAgent: typeof params['user_agent'] === 'string' ? params['user_agent'] : null,
    actorDeviceId: null,

    targetResource: resolveTarget(appName, event.name, params),
    targetResourceType: appName,

    eventTime: new Date(raw.id.time),
    metadata: {
      googleAppName: appName,
      googleEventType: event.type,
      googleEventName: event.name,
      googleCustomerId: raw.id.customerId,
      googleUniqueQualifier: raw.id.uniqueQualifier,
      googleParams: params,
    },
  }
}

// Parse Google's parameter array into a flat map
function parseParams(
  parameters: Array<{ name: string; value?: string; boolValue?: boolean; intValue?: string; multiValue?: string[] }>
): Record<string, string | boolean | string[]> {
  const result: Record<string, string | boolean | string[]> = {}
  for (const p of parameters) {
    if (p.value !== undefined) result[p.name] = p.value
    else if (p.boolValue !== undefined) result[p.name] = p.boolValue
    else if (p.intValue !== undefined) result[p.name] = p.intValue
    else if (p.multiValue !== undefined) result[p.name] = p.multiValue
  }
  return result
}

function isFailedAction(
  eventName: string,
  params: Record<string, unknown>
): boolean {
  if (eventName === 'login_failure') return true
  if (eventName === 'login_challenge') return true
  const loginType = params['login_type']
  if (typeof loginType === 'string' && loginType.includes('FAILURE')) return true
  return false
}

function resolveOcsfClass(appName: string): number {
  if (appName === 'login') return OCSF_CLASSES.AUTHENTICATION
  if (appName === 'admin') return OCSF_CLASSES.ACCOUNT_CHANGE
  if (appName === 'drive') return OCSF_CLASSES.FILE_SYSTEM_ACTIVITY
  if (appName === 'token') return OCSF_CLASSES.API_ACTIVITY
  return OCSF_CLASSES.API_ACTIVITY
}

function resolveCategory(appName: string): string {
  const map: Record<string, string> = {
    login: 'authentication',
    admin: 'account_management',
    drive: 'file_access',
    token: 'oauth_token',
    groups: 'group_management',
    mobile: 'mobile_device',
    rules: 'email_rules',
    calendar: 'calendar_access',
  }
  return map[appName] ?? 'api_call'
}

function resolveSeverity(appName: string, eventName: string, _eventType: string): number {
  if (HIGH_SEVERITY_EVENTS.has(eventName)) return OCSF_SEVERITY.HIGH
  if (MEDIUM_SEVERITY_EVENTS.has(eventName)) return OCSF_SEVERITY.MEDIUM
  if (appName === 'login' && eventName === 'login_failure') return OCSF_SEVERITY.LOW
  return OCSF_SEVERITY.INFORMATIONAL
}

function resolveTarget(
  appName: string,
  _eventName: string,
  params: Record<string, unknown>
): string | null {
  if (appName === 'drive') {
    return (params['doc_title'] as string) ?? (params['doc_id'] as string) ?? null
  }
  if (appName === 'admin') {
    return (params['target_name'] as string) ?? (params['user_email'] as string) ?? null
  }
  return null
}

function normalizeGoogleAction(appName: string, eventName: string): string {
  const key = `${appName}.${eventName}`
  return GOOGLE_ACTION_MAP[key] ?? eventName
}

// High severity events in Google Workspace
export const HIGH_SEVERITY_EVENTS = new Set([
  'GRANT_ADMIN_PRIVILEGE',
  'REVOKE_ADMIN_PRIVILEGE',
  'CREATE_APPLICATION',
  'AUTHORIZE_API_CLIENT_ACCESS',
  'REVOKE_API_CLIENT_ACCESS',
  'CHANGE_PASSWORD',
  'SUSPEND_USER',
  'DELETE_USER',
  'CREATE_FORWARDING_RULE',
  'ADD_GMAIL_DELEGATE',
  'DOWNLOAD',
  'SUSPICIOUS_LOGIN',
  'SUSPICIOUS_ACTIVITY',
  'LEAKED_PASSWORD_LOGIN',
])

export const MEDIUM_SEVERITY_EVENTS = new Set([
  'ADD_GROUP_MEMBER',
  'UPDATE_GROUP_MEMBER',
  'CHANGE_APPLICATION_SETTING',
  'TOGGLE_SERVICE_ENABLED',
  'CREATE_USER',
  'RENAME_USER',
  '2SV_DISABLE',
  'login_challenge',
  'login_failure',
])

export const GOOGLE_ACTION_MAP: Record<string, string> = {
  // Login events
  'login.login_success': 'login_success',
  'login.login_failure': 'login_failed',
  'login.login_challenge': 'mfa_challenge',
  'login.login_verification': 'mfa_verified',
  'login.2sv_disable': 'mfa_disabled',
  'login.2sv_enroll': 'mfa_enrolled',
  'login.suspicious_login': 'suspicious_login',
  'login.suspicious_login_less_secure_app': 'suspicious_login',
  'login.account_disabled_hijacked': 'account_hijack_detected',
  'login.leaked_password_login': 'leaked_credential_login',
  // Admin events
  'admin.CREATE_USER': 'user_created',
  'admin.DELETE_USER': 'user_deleted',
  'admin.SUSPEND_USER': 'account_suspended',
  'admin.UNSUSPEND_USER': 'account_unsuspended',
  'admin.RENAME_USER': 'user_renamed',
  'admin.CHANGE_PASSWORD': 'password_changed',
  'admin.GRANT_ADMIN_PRIVILEGE': 'privilege_escalation',
  'admin.REVOKE_ADMIN_PRIVILEGE': 'privilege_revoked',
  'admin.ADD_GROUP_MEMBER': 'user_added_to_group',
  'admin.REMOVE_GROUP_MEMBER': 'user_removed_from_group',
  'admin.AUTHORIZE_API_CLIENT_ACCESS': 'oauth_client_authorized',
  'admin.REVOKE_API_CLIENT_ACCESS': 'oauth_client_revoked',
  'admin.CREATE_FORWARDING_RULE': 'email_forward_rule_created',
  'admin.ADD_GMAIL_DELEGATE': 'email_delegate_added',
  'admin.TOGGLE_SERVICE_ENABLED': 'service_toggled',
  // Drive events
  'drive.download': 'file_download',
  'drive.view': 'file_view',
  'drive.edit': 'file_edit',
  'drive.delete': 'file_delete',
  'drive.share': 'file_shared',
  'drive.unshare': 'file_unshared',
  'drive.add_to_folder': 'file_moved',
  'drive.create': 'file_created',
  'drive.move': 'file_moved',
  // Token events
  'token.AUTHORIZE': 'oauth_token_authorized',
  'token.REVOKE': 'oauth_token_revoked',
}
