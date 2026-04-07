import {
  useQuery, useMutation, useQueryClient,
} from '@tanstack/react-query'
import {
  api,
  type AlertListParams,
  type CreateConnectorBody,
  type UpdateConnectorBody,
  type AlertSummary,
  type AlertDetail,
  type OrgPosture,
  type PaginatedResult,
  type UserRiskScore,
  type UserRiskProfile,
  type AssetRiskScore,
  type ConnectorSummary,
  type EventDetail,
  type EventListResponse,
  type EventQueryParams,
  type MttdMetrics,
  type PipelineHealth,
  type AttackCoverageResult,
  type DetectionRule,
  type AuditLogEntry,
  type UsageSummary,
  type AiInvestigation,
  type AiInvestigationStats,
  type AssistantSuggestions,
  type ComplianceReportCatalog,
} from '@/lib/api'

type WithData<T, R = T> = R & { data: T }

function normalizeArrayData<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[]
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    if (Array.isArray(record.data)) {
      return record.data as T[]
    }

    if (Array.isArray(record.items)) {
      return record.items as T[]
    }

    if (Array.isArray(record.results)) {
      return record.results as T[]
    }
  }

  return []
}

// ─────────────────────────────────────────────
// QUERY KEYS (centralized to avoid typos)
// ─────────────────────────────────────────────

export const QK = {
  alerts:          (params?: AlertListParams) => ['alerts', params],
  alert:           (id: string)              => ['alert', id],
  riskSummary:                                  ['risk', 'summary'],
  riskUsers:       (cursor?: string)         => ['risk', 'users', cursor],
  riskUser:        (id: string)              => ['risk', 'user', id],
  riskAssets:                                   ['risk', 'assets'],
  riskAsset:       (id: string)              => ['risk', 'asset', id],
  mttd:                                         ['metrics', 'mttd'],
  connectors:                                   ['connectors'],
  events:          (params?: EventQueryParams)  => ['events', params],
  event:           (id: string)                 => ['events', id],
  pipelineHealth:                               ['health', 'pipeline'],
  attackCoverage:  (gapsOnly: boolean)       => ['compliance', 'attack', gapsOnly],
  auditLog:        (cursor?: string)         => ['compliance', 'audit', cursor],
  rules:                                        ['compliance', 'rules'],
  playbooks:                                    ['playbooks'],
  usage:                                        ['billing', 'usage'],
  subscription:                                 ['billing', 'subscription'],
  investigations: (limit?: number)           => ['ai', 'investigations', limit],
  investigation:  (id: string)               => ['ai', 'investigation', id],
  investigationStats:                           ['ai', 'investigation-stats'],
  assistantSuggestions:                         ['ai', 'assistant-suggestions'],
  reportCatalog:                                ['compliance', 'reports', 'catalog'],
} as const

// ─────────────────────────────────────────────
// ALERT QUERIES
// ─────────────────────────────────────────────

export function useAlerts(params?: AlertListParams) {
  return useQuery({
    queryKey: QK.alerts(params),
    queryFn:  async (): Promise<WithData<AlertSummary[], PaginatedResult<AlertSummary>>> => {
      const result = await api.alerts.list(params)
      return {
        ...result,
        data: result.items ?? [],
      }
    },
    staleTime: 10_000,
  })
}

export function useAlert(id: string) {
  return useQuery({
    queryKey: QK.alert(id),
    queryFn:  async (): Promise<WithData<AlertDetail, AlertDetail>> => {
      const alert = await api.alerts.get(id)
      return { ...alert, data: alert }
    },
    enabled:  !!id,
  })
}

export function useUpdateAlertStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, alertId, status, notes }: { id?: string; alertId?: string; status: string; notes?: string }) => {
      const targetId = id ?? alertId
      if (!targetId) throw new Error('Alert id is required')
      return api.alerts.updateStatus(targetId, status, notes)
    },
    onSuccess: (_, { id, alertId }) => {
      const targetId = id ?? alertId
      if (!targetId) return
      qc.invalidateQueries({ queryKey: QK.alert(targetId) })
      qc.invalidateQueries({ queryKey: ['alerts'] })
    },
  })
}

export function useAlertFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, alertId, verdict, notes }: { id?: string; alertId?: string; verdict: string; notes?: string }) => {
      const targetId = id ?? alertId
      if (!targetId) throw new Error('Alert id is required')
      return api.alerts.feedback(targetId, verdict, notes)
    },
    onSuccess: (_, { id, alertId }) => {
      const targetId = id ?? alertId
      if (!targetId) return
      qc.invalidateQueries({ queryKey: QK.alert(targetId) })
    },
  })
}

// ─────────────────────────────────────────────
// RISK QUERIES
// ─────────────────────────────────────────────

export function useRiskSummary() {
  return useQuery({
    queryKey: QK.riskSummary,
    queryFn:  async (): Promise<WithData<OrgPosture, OrgPosture>> => {
      const summary = await api.risk.summary()
      return { ...summary, data: summary }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,   // auto-refresh every minute
  })
}

export function useRiskUsers() {
  return useQuery({
    queryKey: QK.riskUsers(),
    queryFn:  async (): Promise<WithData<PaginatedResult<UserRiskScore>, PaginatedResult<UserRiskScore>>> => {
      const users = await api.risk.users({ limit: 50 })
      return { ...users, data: users }
    },
    staleTime: 30_000,
  })
}

export function useRiskUser(userId: string) {
  return useQuery({
    queryKey: QK.riskUser(userId),
    queryFn:  async (): Promise<WithData<UserRiskProfile, UserRiskProfile>> => {
      const profile = await api.risk.userProfile(userId)
      return { ...profile, data: profile }
    },
    enabled:  !!userId,
  })
}

export function useRiskAssets() {
  return useQuery({
    queryKey: QK.riskAssets,
    queryFn:  async (): Promise<WithData<PaginatedResult<AssetRiskScore>, PaginatedResult<AssetRiskScore>>> => {
      const assets = await api.risk.assets({ limit: 50 })
      return { ...assets, data: assets }
    },
    staleTime: 60_000,
  })
}

export function useMttd() {
  return useQuery({
    queryKey: QK.mttd,
    queryFn:  async (): Promise<WithData<Record<string, unknown> & { p50Minutes: number | null; p90Minutes: number | null; p99Minutes: number | null; trend30d: number | null }, Record<string, unknown>>> => {
      const raw = await api.risk.mttd() as MttdMetrics
      const primary = (raw['P1'] ?? raw['critical'] ?? raw[Object.keys(raw)[0] ?? ''] ?? {}) as { p50?: number; p95?: number; p90?: number; p99?: number; trend30d?: number }
      return {
        ...raw,
        data: {
          ...raw,
          p50Minutes: primary.p50 ?? null,
          p90Minutes: primary.p90 ?? primary.p95 ?? null,
          p99Minutes: primary.p99 ?? primary.p95 ?? null,
          trend30d: primary.trend30d ?? null,
        },
      }
    },
    staleTime: 300_000,
  })
}

// ─────────────────────────────────────────────
// CONNECTOR QUERIES
// ─────────────────────────────────────────────

export function useConnectors() {
  return useQuery({
    queryKey: QK.connectors,
    queryFn:  async (): Promise<WithData<ConnectorSummary[], ConnectorSummary[]>> => {
      const connectors = await api.connectors.list()
      return Object.assign(connectors, { data: connectors })
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useEvents(params?: EventQueryParams) {
  return useQuery({
    queryKey: QK.events(params),
    queryFn: async (): Promise<WithData<EventListResponse, EventListResponse>> => {
      const result = await api.events.list(params)
      return { ...result, data: result }
    },
    staleTime: 15_000,
  })
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: QK.event(id),
    queryFn: async (): Promise<WithData<EventDetail, EventDetail>> => {
      const result = await api.events.get(id)
      return { ...result, data: result }
    },
    enabled: !!id,
  })
}

export function useCreateConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateConnectorBody) => api.connectors.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.connectors })
      qc.invalidateQueries({ queryKey: QK.pipelineHealth })
    },
  })
}

export function useUpdateConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateConnectorBody }) => api.connectors.update(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.connectors })
      qc.invalidateQueries({ queryKey: QK.pipelineHealth })
    },
  })
}

export function useTestConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.connectors.test(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.connectors })
      qc.invalidateQueries({ queryKey: QK.pipelineHealth })
    },
  })
}

export function useDeleteConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.connectors.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.connectors })
      qc.invalidateQueries({ queryKey: QK.pipelineHealth })
    },
  })
}

export function usePipelineHealth() {
  return useQuery({
    queryKey: QK.pipelineHealth,
    queryFn:  async (): Promise<WithData<PipelineHealth & { overall: string }, PipelineHealth>> => {
      const health = await api.health.pipeline()
      return {
        ...health,
        data: {
          ...health,
          overall: health.summary?.overallStatus ?? 'unknown',
        },
      }
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

// ─────────────────────────────────────────────
// COMPLIANCE QUERIES
// ─────────────────────────────────────────────

export function useAttackCoverage(gapsOnly = false) {
  return useQuery({
    queryKey: QK.attackCoverage(gapsOnly),
    queryFn:  async (): Promise<WithData<AttackCoverageResult, AttackCoverageResult>> => {
      const coverage = await api.compliance.attackCoverage(gapsOnly)
      return { ...coverage, data: coverage }
    },
    staleTime: 300_000,
  })
}

export function useDetectionRules() {
  return useQuery({
    queryKey: QK.rules,
    queryFn:  async (): Promise<WithData<DetectionRule[], DetectionRule[]>> => {
      const rules = await api.compliance.rules()
      return Object.assign(rules, { data: rules })
    },
    staleTime: 300_000,
  })
}

export function useAuditLog(cursor?: string) {
  return useQuery({
    queryKey: QK.auditLog(cursor),
    queryFn:  async (): Promise<WithData<AuditLogEntry[], PaginatedResult<AuditLogEntry>>> => {
      const result = await api.compliance.auditLog({ limit: 100, cursor })
      return {
        ...result,
        data: result.items ?? [],
      }
    },
    staleTime: 60_000,
  })
}

// ─────────────────────────────────────────────
// BILLING QUERIES
// ─────────────────────────────────────────────

export function useUsage() {
  return useQuery({
    queryKey: QK.usage,
    queryFn:  async (): Promise<WithData<UsageSummary, UsageSummary>> => {
      const usage = await api.billing.usage()
      return { ...usage, data: usage }
    },
    staleTime: 300_000,
  })
}

// ─────────────────────────────────────────────
// AI + REPORT QUERIES
// ─────────────────────────────────────────────

export function useInvestigations(limit = 20) {
  return useQuery({
    queryKey: QK.investigations(limit),
    queryFn:  async (): Promise<WithData<AiInvestigation[], Record<string, unknown>>> => {
      const raw = await api.ai.investigations({ limit }) as unknown
      const investigations = normalizeArrayData<AiInvestigation>(raw)

      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return {
          ...(raw as Record<string, unknown>),
          data: investigations,
        }
      }

      return { data: investigations }
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
  })
}

export function useInvestigation(id: string) {
  return useQuery({
    queryKey: QK.investigation(id),
    queryFn:  async (): Promise<WithData<AiInvestigation, AiInvestigation>> => {
      const investigation = await api.ai.investigation(id)
      return { ...investigation, data: investigation }
    },
    enabled: !!id,
    staleTime: 10_000,
  })
}

export function useInvestigationStats() {
  return useQuery({
    queryKey: QK.investigationStats,
    queryFn:  async (): Promise<WithData<AiInvestigationStats, AiInvestigationStats>> => {
      const stats = await api.ai.investigationStats()
      return { ...stats, data: stats }
    },
    staleTime: 60_000,
  })
}

export function useAssistantSuggestions() {
  return useQuery({
    queryKey: QK.assistantSuggestions,
    queryFn:  async (): Promise<WithData<string[], AssistantSuggestions>> => {
      const suggestions = await api.ai.suggestions()
      return {
        ...suggestions,
        data: suggestions.suggestions ?? [],
      }
    },
    staleTime: 5 * 60_000,
  })
}

export function useReportCatalog() {
  return useQuery({
    queryKey: QK.reportCatalog,
    queryFn:  async (): Promise<WithData<ComplianceReportCatalog['reports'], ComplianceReportCatalog>> => {
      const catalog = await api.compliance.reportsList()
      return {
        ...catalog,
        data: catalog.reports ?? [],
      }
    },
    staleTime: 5 * 60_000,
  })
}

// Additional hooks referenced in pages
export const useSubmitFeedback   = useAlertFeedback
export const useMttdMetrics      = useMttd
