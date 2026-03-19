import type { NormalizedEvent } from '../ocsf.types.js'
import { OCSF_CLASSES, OCSF_CATEGORIES, OCSF_SEVERITY, OCSF_STATUS } from '../ocsf.types.js'

// ─────────────────────────────────────────────
// M365 / Entra ID → OCSF Field Mapping
// Source: Microsoft Graph API SignIn logs
//         Microsoft Graph API AuditLogs
// ─────────────────────────────────────────────

type M365SignInLog = {
  id: string
  createdDateTime: string
  userDisplayName: string
  userPrincipalName: string
  userId: string
  appDisplayName: string
  appId: string
  ipAddress: string
  status: { errorCode: number; failureReason?: string }
  location?: { city: string; countryOrRegion: string }
  deviceDetail?: { deviceId: string; browser: string; operatingSystem: string }
  riskLevelAggregated?: string
  conditionalAccessStatus?: string
  authenticationRequirement?: string
}

type M365AuditLog = {
  id: string
  activityDateTime: string
  activityDisplayName: string
  category: string
  initiatedBy: { user?: { id: string; userPrincipalName: string; displayName: string } }
  targetResources: Array<{ id: string; displayName: string; type: string }>
  result: 'success' | 'failure' | 'timeout' | 'unknownFutureValue'
}

export function mapM365SignIn(
  raw: M365SignInLog,
  tenantId: string,
  connectorId: string,
  eventId: string,
): Partial<NormalizedEvent> {
  const isSuccess = raw.status.errorCode === 0

  return {
    eventId,
    tenantId,
    connectorId,
    ocsfClassUid: OCSF_CLASSES.AUTHENTICATION,
    ocsfCategoryUid: OCSF_CATEGORIES.IDENTITY_ACCESS,
    ocsfActivityId: 1, // LOGON
    ocsfSeverityId: isSuccess ? OCSF_SEVERITY.INFORMATIONAL : OCSF_SEVERITY.MEDIUM,
    sourceType: 'm365_entra',
    eventCategory: 'authentication',
    eventAction: isSuccess ? 'login_success' : 'login_failed',
    outcome: isSuccess ? 'success' : 'failure',

    // Actor fields
    actorUserEmail: raw.userPrincipalName,
    actorUserName: raw.userDisplayName,
    actorUserType: 'user',
    actorIp: raw.ipAddress,
    actorIpCountry: raw.location?.countryOrRegion ?? null,
    actorIpCity: raw.location?.city ?? null,
    actorUserAgent: raw.deviceDetail
      ? `${raw.deviceDetail.browser} on ${raw.deviceDetail.operatingSystem}`
      : null,
    actorDeviceId: raw.deviceDetail?.deviceId ?? null,
    actorIpIsVpn: null,
    actorIpIsTor: null,

    // Target
    targetResource: raw.appDisplayName,
    targetResourceType: 'application',

    eventTime: new Date(raw.createdDateTime),
    metadata: {
      m365AppId: raw.appId,
      m365ErrorCode: raw.status.errorCode,
      m365FailureReason: raw.status.failureReason,
      m365RiskLevel: raw.riskLevelAggregated,
      m365ConditionalAccess: raw.conditionalAccessStatus,
      m365AuthRequirement: raw.authenticationRequirement,
    },
  }
}

export function mapM365AuditLog(
  raw: M365AuditLog,
  tenantId: string,
  connectorId: string,
  eventId: string,
): Partial<NormalizedEvent> {
  const isSuccess = raw.result === 'success'
  const actor = raw.initiatedBy.user

  return {
    eventId,
    tenantId,
    connectorId,
    ocsfClassUid: OCSF_CLASSES.ACCOUNT_CHANGE,
    ocsfCategoryUid: OCSF_CATEGORIES.IDENTITY_ACCESS,
    ocsfActivityId: 0,
    ocsfSeverityId: OCSF_SEVERITY.INFORMATIONAL,
    sourceType: 'm365_entra',
    eventCategory: 'account_management',
    eventAction: raw.activityDisplayName.toLowerCase().replace(/\s+/g, '_'),
    outcome: isSuccess ? 'success' : 'failure',

    actorUserEmail: actor?.userPrincipalName ?? null,
    actorUserName: actor?.displayName ?? null,
    actorUserType: 'user',
    actorIp: null,

    targetResource: raw.targetResources[0]?.displayName ?? null,
    targetResourceType: raw.targetResources[0]?.type ?? null,

    eventTime: new Date(raw.activityDateTime),
    metadata: {
      m365Category: raw.category,
      m365ActivityName: raw.activityDisplayName,
      m365TargetResources: raw.targetResources,
    },
  }
}

// Common M365 event action normalizations
export const M365_EVENT_ACTION_MAP: Record<string, string> = {
  'Sign-in': 'login_success',
  'Sign-in failure': 'login_failed',
  'Add member to role': 'privilege_escalation',
  'Add user': 'user_created',
  'Delete user': 'user_deleted',
  'Reset user password': 'password_reset',
  'Update user': 'user_updated',
  'Disable account': 'account_disabled',
  'Enable account': 'account_enabled',
  'Add app role assignment to user': 'app_role_assigned',
  'Consent to application': 'oauth_consent_granted',
  'Add delegation entry': 'delegation_added',
  'Set password': 'password_set',
  'Change user password': 'password_changed',
  'Update application – Certificates and secrets management': 'app_secret_modified',
}
