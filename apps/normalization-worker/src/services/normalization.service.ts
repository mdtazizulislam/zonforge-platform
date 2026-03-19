import { v4 as uuidv4 } from 'uuid'
import {
  type NormalizedEvent,
  type RawEvent,
  OCSF_CLASSES,
  OCSF_CATEGORIES,
  OCSF_SEVERITY,
  mapM365SignIn,
  mapM365AuditLog,
  mapCloudTrailRecord,
  mapGoogleWorkspaceActivity,
} from '@zonforge/event-schema'
import { createLogger } from '@zonforge/logger'
import type { Redis } from 'ioredis'

const log = createLogger({ service: 'normalization-worker:normalizer' })

// ─────────────────────────────────────────────
// NORMALIZATION SERVICE
//
// Converts raw vendor events → OCSF-aligned
// NormalizedEvent records ready for ClickHouse
// ─────────────────────────────────────────────

export class NormalizationService {

  normalize(raw: RawEvent): NormalizedEvent {
    const base = this.mapToOcsf(raw)

    // Ensure all required fields have defaults
    return {
      eventId:              raw.eventId,
      tenantId:             raw.tenantId,
      connectorId:          raw.connectorId,
      ocsfClassUid:         base.ocsfClassUid         ?? OCSF_CLASSES.API_ACTIVITY,
      ocsfCategoryUid:      base.ocsfCategoryUid      ?? OCSF_CATEGORIES.APPLICATION_ACTIVITY,
      ocsfActivityId:       base.ocsfActivityId       ?? 0,
      ocsfSeverityId:       base.ocsfSeverityId       ?? OCSF_SEVERITY.INFORMATIONAL,
      schemaVersion:        1,
      sourceType:           raw.sourceType,
      eventCategory:        base.eventCategory        ?? 'unknown',
      eventAction:          base.eventAction          ?? 'unknown',
      outcome:              base.outcome              ?? 'unknown',
      actorUserId:          base.actorUserId          ?? null,
      actorUserEmail:       base.actorUserEmail       ?? null,
      actorUserName:        base.actorUserName        ?? null,
      actorUserType:        base.actorUserType        ?? 'unknown',
      actorIp:              base.actorIp              ?? null,
      actorIpCountry:       base.actorIpCountry       ?? null,
      actorIpCity:          base.actorIpCity          ?? null,
      actorIpIsVpn:         base.actorIpIsVpn         ?? null,
      actorIpIsTor:         base.actorIpIsTor         ?? null,
      actorUserAgent:       base.actorUserAgent       ?? null,
      actorDeviceId:        base.actorDeviceId        ?? null,
      targetAssetId:        base.targetAssetId        ?? null,
      targetResource:       base.targetResource       ?? null,
      targetResourceType:   base.targetResourceType   ?? null,
      threatIntelMatched:   false,    // enriched later by threat-intel-service
      threatIntelIocType:   null,
      threatIntelConfidence: null,
      threatIntelFeedSource: null,
      eventTime:            base.eventTime            ?? raw.receivedAt,
      ingestedAt:           raw.receivedAt,
      rawPayloadRef:        null,     // S3 key set by storage worker if enabled
      metadata:             base.metadata             ?? {},
    }
  }

  // ── Dispatch to per-source mapper ────────────

  private mapToOcsf(raw: RawEvent): Partial<NormalizedEvent> {
    try {
      switch (raw.sourceType) {

        // ── Microsoft 365 / Entra ID ──────────
        case 'm365_entra': {
          const payload = raw.payload
          // Distinguish sign-in log vs audit log by shape
          if ('status' in payload && 'userPrincipalName' in payload) {
            return mapM365SignIn(payload as any, raw.tenantId, raw.connectorId, raw.eventId)
          }
          if ('activityDisplayName' in payload) {
            return mapM365AuditLog(payload as any, raw.tenantId, raw.connectorId, raw.eventId)
          }
          return this.genericMap(raw, 'authentication', 'unknown_m365_event')
        }

        // ── AWS CloudTrail ────────────────────
        case 'aws_cloudtrail': {
          return mapCloudTrailRecord(
            raw.payload as any,
            raw.tenantId,
            raw.connectorId,
            raw.eventId,
          )
        }

        // ── Google Workspace ──────────────────
        case 'google_workspace': {
          return mapGoogleWorkspaceActivity(
            raw.payload as any,
            raw.tenantId,
            raw.connectorId,
            raw.eventId,
          )
        }

        // ── Azure Activity Logs ───────────────
        case 'azure_activity': {
          return this.mapAzureActivity(raw)
        }

        // ── Generic webhook / syslog ──────────
        case 'generic_webhook':
        case 'generic_syslog': {
          return this.genericMap(raw, 'api_call', 'generic_event')
        }

        // ── WAF logs (Cloudflare / AWS WAF) ───
        case 'cloudflare_waf':
        case 'aws_waf': {
          return this.mapWafEvent(raw)
        }

        default: {
          log.warn({ sourceType: raw.sourceType, eventId: raw.eventId },
            'Unknown source type — using generic mapper')
          return this.genericMap(raw, 'unknown', 'unknown_event')
        }
      }
    } catch (err) {
      log.error({ err, sourceType: raw.sourceType, eventId: raw.eventId },
        'Normalization mapping failed — using fallback')
      return this.genericMap(raw, 'error', 'normalization_failed')
    }
  }

  // ── Azure Activity Log mapper ─────────────

  private mapAzureActivity(raw: RawEvent): Partial<NormalizedEvent> {
    const p = raw.payload as Record<string, unknown>
    const isFailure = (p['status'] as Record<string,unknown>)?.['value'] === 'Failed'

    return {
      ocsfClassUid:     OCSF_CLASSES.API_ACTIVITY,
      ocsfCategoryUid:  OCSF_CATEGORIES.APPLICATION_ACTIVITY,
      ocsfSeverityId:   isFailure ? OCSF_SEVERITY.MEDIUM : OCSF_SEVERITY.INFORMATIONAL,
      sourceType:       'azure_activity',
      eventCategory:    'cloud_resource',
      eventAction:      ((p['operationName'] as Record<string,unknown>)?.['value'] as string)
                          ?.toLowerCase().replace(/[/ ]/g, '_') ?? 'unknown',
      outcome:          isFailure ? 'failure' : 'success',
      actorUserEmail:   (p['caller'] as string) ?? null,
      actorIp:          (p['httpRequest'] as Record<string,unknown>)?.['clientIpAddress'] as string ?? null,
      targetResource:   p['resourceId'] as string ?? null,
      eventTime:        new Date((p['eventTimestamp'] as string) ?? Date.now()),
      metadata: {
        azureSubscriptionId: p['subscriptionId'],
        azureResourceGroup:  p['resourceGroupName'],
        azureOperationName:  (p['operationName'] as Record<string,unknown>)?.['value'],
        azureCorrelationId:  p['correlationId'],
      },
    }
  }

  // ── WAF event mapper ──────────────────────

  private mapWafEvent(raw: RawEvent): Partial<NormalizedEvent> {
    const p = raw.payload as Record<string, unknown>
    const isBlocked = p['action'] === 'BLOCK' || p['Action'] === 'BLOCK'

    return {
      ocsfClassUid:     OCSF_CLASSES.NETWORK_ACTIVITY,
      ocsfCategoryUid:  OCSF_CATEGORIES.NETWORK_ACTIVITY,
      ocsfSeverityId:   isBlocked ? OCSF_SEVERITY.MEDIUM : OCSF_SEVERITY.INFORMATIONAL,
      sourceType:       raw.sourceType,
      eventCategory:    'network',
      eventAction:      isBlocked ? 'waf_block' : 'waf_allow',
      outcome:          isBlocked ? 'failure' : 'success',
      actorIp:          (p['ClientIP'] ?? p['httpSourceIp'] ?? p['ip']) as string ?? null,
      actorUserAgent:   (p['userAgent'] ?? p['UserAgent']) as string ?? null,
      targetResource:   (p['uri'] ?? p['Uri'] ?? p['request_uri']) as string ?? null,
      targetResourceType: 'http_endpoint',
      eventTime:        new Date((p['timestamp'] ?? p['Timestamp'] ?? Date.now()) as string),
      metadata: {
        wafRuleId:   p['ruleId'] ?? p['RuleId'],
        wafRuleGroup: p['ruleGroupId'] ?? p['RuleGroupId'],
        httpMethod:  p['httpMethod'] ?? p['HttpMethod'],
        statusCode:  p['responseCode'] ?? p['ResponseCode'],
      },
    }
  }

  // ── Generic / fallback mapper ─────────────

  private genericMap(
    raw:          RawEvent,
    category:     string,
    action:       string,
  ): Partial<NormalizedEvent> {
    const p = raw.payload as Record<string, unknown>
    return {
      ocsfClassUid:    OCSF_CLASSES.API_ACTIVITY,
      ocsfCategoryUid: OCSF_CATEGORIES.APPLICATION_ACTIVITY,
      ocsfSeverityId:  OCSF_SEVERITY.INFORMATIONAL,
      sourceType:      raw.sourceType,
      eventCategory:   category,
      eventAction:     action,
      outcome:         'unknown',
      eventTime:       new Date(
        (p['timestamp'] ?? p['time'] ?? p['created_at'] ?? Date.now()) as string,
      ),
      metadata: { raw_keys: Object.keys(p).slice(0, 20) },
    }
  }

  // ── Threat intel enrichment stub ──────────
  // Real enrichment done by threat-intel-service via Redis lookup
  // This checks the hot cache only (fast path)

  async enrichWithThreatIntel(
    event:  NormalizedEvent,
    redis:  Redis,
  ): Promise<NormalizedEvent> {
    if (!event.actorIp) return event

    // Normalize IPv4-mapped IPv6 back to IPv4 for lookup
    const ip = event.actorIp.replace('::ffff:', '')
    const cacheKey = `zf:platform:ioc:ip`

    try {
      const iocData = await redis.hget(cacheKey, ip)
      if (iocData) {
        const ioc = JSON.parse(iocData) as {
          confidence: number
          severity:   string
          feedSource: string
        }
        return {
          ...event,
          threatIntelMatched:    true,
          threatIntelIocType:    'ip',
          threatIntelConfidence: ioc.confidence,
          threatIntelFeedSource: ioc.feedSource,
        }
      }
    } catch {
      // Non-fatal: proceed without enrichment
    }

    return event
  }
}
