import {
  useQuery, useMutation, useQueryClient, type UseQueryResult,
} from '@tanstack/react-query'
import { api, type AlertListParams, type CreateConnectorBody } from '@/lib/api'

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
  pipelineHealth:                               ['health', 'pipeline'],
  attackCoverage:  (gapsOnly: boolean)       => ['compliance', 'attack', gapsOnly],
  auditLog:        (cursor?: string)         => ['compliance', 'audit', cursor],
  rules:                                        ['compliance', 'rules'],
  playbooks:                                    ['playbooks'],
  usage:                                        ['billing', 'usage'],
  subscription:                                 ['billing', 'subscription'],
} as const

// ─────────────────────────────────────────────
// ALERT QUERIES
// ─────────────────────────────────────────────

export function useAlerts(params?: AlertListParams) {
  return useQuery({
    queryKey: QK.alerts(params),
    queryFn:  () => api.alerts.list(params),
    staleTime: 10_000,
  })
}

export function useAlert(id: string) {
  return useQuery({
    queryKey: QK.alert(id),
    queryFn:  () => api.alerts.get(id),
    enabled:  !!id,
  })
}

export function useUpdateAlertStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      api.alerts.updateStatus(id, status, notes),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: QK.alert(id) })
      qc.invalidateQueries({ queryKey: ['alerts'] })
    },
  })
}

export function useAlertFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, verdict, notes }: { id: string; verdict: string; notes?: string }) =>
      api.alerts.feedback(id, verdict, notes),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: QK.alert(id) })
    },
  })
}

// ─────────────────────────────────────────────
// RISK QUERIES
// ─────────────────────────────────────────────

export function useRiskSummary() {
  return useQuery({
    queryKey: QK.riskSummary,
    queryFn:  api.risk.summary,
    staleTime: 30_000,
    refetchInterval: 60_000,   // auto-refresh every minute
  })
}

export function useRiskUsers() {
  return useQuery({
    queryKey: QK.riskUsers(),
    queryFn:  () => api.risk.users({ limit: 50 }),
    staleTime: 30_000,
  })
}

export function useRiskUser(userId: string) {
  return useQuery({
    queryKey: QK.riskUser(userId),
    queryFn:  () => api.risk.userProfile(userId),
    enabled:  !!userId,
  })
}

export function useRiskAssets() {
  return useQuery({
    queryKey: QK.riskAssets,
    queryFn:  () => api.risk.assets({ limit: 50 }),
    staleTime: 60_000,
  })
}

export function useMttd() {
  return useQuery({
    queryKey: QK.mttd,
    queryFn:  api.risk.mttd,
    staleTime: 300_000,
  })
}

// ─────────────────────────────────────────────
// CONNECTOR QUERIES
// ─────────────────────────────────────────────

export function useConnectors() {
  return useQuery({
    queryKey: QK.connectors,
    queryFn:  api.connectors.list,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useCreateConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateConnectorBody) => api.connectors.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.connectors })
    },
  })
}

export function usePipelineHealth() {
  return useQuery({
    queryKey: QK.pipelineHealth,
    queryFn:  api.health.pipeline,
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
    queryFn:  () => api.compliance.attackCoverage(gapsOnly),
    staleTime: 300_000,
  })
}

export function useDetectionRules() {
  return useQuery({
    queryKey: QK.rules,
    queryFn:  api.compliance.rules,
    staleTime: 300_000,
  })
}

export function useAuditLog(cursor?: string) {
  return useQuery({
    queryKey: QK.auditLog(cursor),
    queryFn:  () => api.compliance.auditLog({ limit: 100, cursor }),
    staleTime: 60_000,
  })
}

// ─────────────────────────────────────────────
// BILLING QUERIES
// ─────────────────────────────────────────────

export function useUsage() {
  return useQuery({
    queryKey: QK.usage,
    queryFn:  api.billing.usage,
    staleTime: 300_000,
  })
}

// Additional hooks referenced in pages
export const useSubmitFeedback   = useAlertFeedback
export const useMttdMetrics      = useMttd
