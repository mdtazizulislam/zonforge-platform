import type { NormalizedEvent } from '../ocsf.types.js'
import { OCSF_CLASSES, OCSF_CATEGORIES, OCSF_SEVERITY } from '../ocsf.types.js'

// ─────────────────────────────────────────────
// AWS CloudTrail → OCSF Field Mapping
// Source: CloudTrail S3 JSON records
// ─────────────────────────────────────────────

type CloudTrailRecord = {
  eventVersion: string
  eventID: string
  eventTime: string
  eventSource: string
  eventName: string
  eventType: string
  awsRegion: string
  sourceIPAddress: string
  userAgent: string
  userIdentity: {
    type: 'Root' | 'IAMUser' | 'AssumedRole' | 'FederatedUser' | 'AWSService' | 'AWSAccount'
    principalId: string
    arn: string
    accountId: string
    userName?: string
    sessionContext?: {
      sessionIssuer?: { userName?: string; arn?: string }
      webIdFederationData?: unknown
    }
  }
  requestParameters: Record<string, unknown> | null
  responseElements: Record<string, unknown> | null
  errorCode?: string
  errorMessage?: string
  resources?: Array<{ ARN: string; accountId: string; type: string }>
  recipientAccountId: string
}

export function mapCloudTrailRecord(
  raw: CloudTrailRecord,
  tenantId: string,
  connectorId: string,
  eventId: string,
): Partial<NormalizedEvent> {
  const isError = !!raw.errorCode
  const isRoot = raw.userIdentity.type === 'Root'

  // Determine OCSF class based on eventSource
  const ocsfClass = resolveOcsfClass(raw.eventSource, raw.eventName)

  // Determine actor email/name
  const actorName =
    raw.userIdentity.userName ??
    raw.userIdentity.sessionContext?.sessionIssuer?.userName ??
    raw.userIdentity.principalId

  const actorUserType =
    isRoot ? 'admin'
    : raw.userIdentity.type === 'IAMUser' ? 'user'
    : 'service_account'

  // Normalized action
  const eventAction = normalizeCloudTrailAction(raw.eventName, isError)

  // Severity bump for Root usage or destructive actions
  const severityId =
    isRoot ? OCSF_SEVERITY.HIGH
    : DESTRUCTIVE_ACTIONS.has(raw.eventName) ? OCSF_SEVERITY.MEDIUM
    : isError ? OCSF_SEVERITY.LOW
    : OCSF_SEVERITY.INFORMATIONAL

  return {
    eventId,
    tenantId,
    connectorId,
    ocsfClassUid: ocsfClass,
    ocsfCategoryUid: OCSF_CATEGORIES.APPLICATION_ACTIVITY,
    ocsfActivityId: 0,
    ocsfSeverityId: severityId,
    sourceType: 'aws_cloudtrail',
    eventCategory: resolveCategory(raw.eventSource),
    eventAction,
    outcome: isError ? 'failure' : 'success',

    actorUserEmail: null,
    actorUserName: actorName,
    actorUserType,
    actorIp: raw.sourceIPAddress,
    actorIpCountry: null,
    actorIpCity: null,
    actorIpIsVpn: null,
    actorIpIsTor: null,
    actorUserAgent: raw.userAgent,
    actorDeviceId: null,

    targetResource: resolveTargetResource(raw),
    targetResourceType: raw.eventSource,

    eventTime: new Date(raw.eventTime),
    metadata: {
      awsRegion: raw.awsRegion,
      awsEventSource: raw.eventSource,
      awsEventName: raw.eventName,
      awsEventType: raw.eventType,
      awsErrorCode: raw.errorCode,
      awsErrorMessage: raw.errorMessage,
      awsUserIdentityType: raw.userIdentity.type,
      awsUserIdentityArn: raw.userIdentity.arn,
      awsAccountId: raw.userIdentity.accountId,
      awsResources: raw.resources?.map(r => r.ARN),
      awsRequestParams: raw.requestParameters,
    },
  }
}

function resolveOcsfClass(eventSource: string, _eventName: string): number {
  if (eventSource.includes('signin')) return OCSF_CLASSES.AUTHENTICATION
  if (eventSource.includes('iam')) return OCSF_CLASSES.ACCOUNT_CHANGE
  if (eventSource.includes('s3')) return OCSF_CLASSES.FILE_SYSTEM_ACTIVITY
  return OCSF_CLASSES.API_ACTIVITY
}

function resolveCategory(eventSource: string): string {
  if (eventSource.includes('signin')) return 'authentication'
  if (eventSource.includes('iam')) return 'account_management'
  if (eventSource.includes('s3')) return 'file_access'
  if (eventSource.includes('ec2')) return 'cloud_resource'
  if (eventSource.includes('lambda')) return 'serverless'
  if (eventSource.includes('kms')) return 'cryptography'
  return 'api_call'
}

function resolveTargetResource(raw: CloudTrailRecord): string | null {
  if (raw.resources && raw.resources.length > 0) {
    return raw.resources[0]?.ARN ?? null
  }
  const params = raw.requestParameters
  if (!params) return null
  return (
    (params['bucketName'] as string) ??
    (params['instanceId'] as string) ??
    (params['functionName'] as string) ??
    (params['userName'] as string) ??
    (params['roleName'] as string) ??
    null
  )
}

function normalizeCloudTrailAction(eventName: string, isError: boolean): string {
  const mapped = CLOUDTRAIL_ACTION_MAP[eventName]
  if (mapped) return isError ? `${mapped}_failed` : mapped
  // snake_case the eventName as fallback
  return eventName
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
}

// High-risk / destructive CloudTrail actions
export const DESTRUCTIVE_ACTIONS = new Set([
  'DeleteBucket',
  'DeleteObject',
  'DeleteObjects',
  'PutBucketPolicy',
  'DeleteBucketPolicy',
  'StopLogging',
  'DeleteTrail',
  'UpdateTrail',
  'DeleteLogGroup',
  'DeleteLogStream',
  'PutEventSelectors',
  'DeleteVolume',
  'TerminateInstances',
  'DeleteDBInstance',
  'ModifyDBInstance',
  'DeleteSecret',
  'DeleteKey',
  'ScheduleKeyDeletion',
  'DisableKey',
  'DetachRolePolicy',
  'DetachUserPolicy',
  'DeleteRolePolicy',
  'DeleteUserPolicy',
  'PutRolePolicy',
  'CreatePolicyVersion',
  'AttachRolePolicy',
])

// Normalized action names for key CloudTrail events
export const CLOUDTRAIL_ACTION_MAP: Record<string, string> = {
  // IAM
  'ConsoleLogin': 'login_success',
  'CreateUser': 'user_created',
  'DeleteUser': 'user_deleted',
  'AttachUserPolicy': 'policy_attached_user',
  'AttachRolePolicy': 'policy_attached_role',
  'PutRolePolicy': 'inline_policy_put',
  'CreateAccessKey': 'access_key_created',
  'DeleteAccessKey': 'access_key_deleted',
  'UpdateAccessKey': 'access_key_updated',
  'CreateRole': 'role_created',
  'DeleteRole': 'role_deleted',
  'AssumeRole': 'role_assumed',
  'AssumeRoleWithSAML': 'role_assumed_saml',
  'AssumeRoleWithWebIdentity': 'role_assumed_web_identity',
  'AddUserToGroup': 'user_added_to_group',
  'CreateLoginProfile': 'console_password_created',
  'UpdateLoginProfile': 'console_password_changed',
  // S3
  'GetObject': 'file_read',
  'PutObject': 'file_write',
  'DeleteObject': 'file_delete',
  'DeleteObjects': 'bulk_file_delete',
  'CopyObject': 'file_copy',
  'CreateBucket': 'bucket_created',
  'DeleteBucket': 'bucket_deleted',
  'PutBucketPolicy': 'bucket_policy_modified',
  // CloudTrail
  'StopLogging': 'logging_stopped',
  'DeleteTrail': 'trail_deleted',
  'UpdateTrail': 'trail_updated',
  // KMS
  'ScheduleKeyDeletion': 'kms_key_deletion_scheduled',
  'DisableKey': 'kms_key_disabled',
  'DeleteSecret': 'secret_deleted',
  // EC2
  'TerminateInstances': 'instance_terminated',
  'RunInstances': 'instance_launched',
  'ModifyInstanceAttribute': 'instance_modified',
}
