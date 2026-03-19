import { useQuery, useMutation, useQueryClient, } from '@tanstack/react-query';
import { api } from '@/lib/api';
// ─────────────────────────────────────────────
// QUERY KEYS (centralized to avoid typos)
// ─────────────────────────────────────────────
export const QK = {
    alerts: (params) => ['alerts', params],
    alert: (id) => ['alert', id],
    riskSummary: ['risk', 'summary'],
    riskUsers: (cursor) => ['risk', 'users', cursor],
    riskUser: (id) => ['risk', 'user', id],
    riskAssets: ['risk', 'assets'],
    riskAsset: (id) => ['risk', 'asset', id],
    mttd: ['metrics', 'mttd'],
    connectors: ['connectors'],
    pipelineHealth: ['health', 'pipeline'],
    attackCoverage: (gapsOnly) => ['compliance', 'attack', gapsOnly],
    auditLog: (cursor) => ['compliance', 'audit', cursor],
    rules: ['compliance', 'rules'],
    playbooks: ['playbooks'],
    usage: ['billing', 'usage'],
    subscription: ['billing', 'subscription'],
};
// ─────────────────────────────────────────────
// ALERT QUERIES
// ─────────────────────────────────────────────
export function useAlerts(params) {
    return useQuery({
        queryKey: QK.alerts(params),
        queryFn: () => api.alerts.list(params),
        staleTime: 10_000,
    });
}
export function useAlert(id) {
    return useQuery({
        queryKey: QK.alert(id),
        queryFn: () => api.alerts.get(id),
        enabled: !!id,
    });
}
export function useUpdateAlertStatus() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status, notes }) => api.alerts.updateStatus(id, status, notes),
        onSuccess: (_, { id }) => {
            qc.invalidateQueries({ queryKey: QK.alert(id) });
            qc.invalidateQueries({ queryKey: ['alerts'] });
        },
    });
}
export function useAlertFeedback() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, verdict, notes }) => api.alerts.feedback(id, verdict, notes),
        onSuccess: (_, { id }) => {
            qc.invalidateQueries({ queryKey: QK.alert(id) });
        },
    });
}
// ─────────────────────────────────────────────
// RISK QUERIES
// ─────────────────────────────────────────────
export function useRiskSummary() {
    return useQuery({
        queryKey: QK.riskSummary,
        queryFn: api.risk.summary,
        staleTime: 30_000,
        refetchInterval: 60_000, // auto-refresh every minute
    });
}
export function useRiskUsers() {
    return useQuery({
        queryKey: QK.riskUsers(),
        queryFn: () => api.risk.users({ limit: 50 }),
        staleTime: 30_000,
    });
}
export function useRiskUser(userId) {
    return useQuery({
        queryKey: QK.riskUser(userId),
        queryFn: () => api.risk.userProfile(userId),
        enabled: !!userId,
    });
}
export function useRiskAssets() {
    return useQuery({
        queryKey: QK.riskAssets,
        queryFn: () => api.risk.assets({ limit: 50 }),
        staleTime: 60_000,
    });
}
export function useMttd() {
    return useQuery({
        queryKey: QK.mttd,
        queryFn: api.risk.mttd,
        staleTime: 300_000,
    });
}
// ─────────────────────────────────────────────
// CONNECTOR QUERIES
// ─────────────────────────────────────────────
export function useConnectors() {
    return useQuery({
        queryKey: QK.connectors,
        queryFn: api.connectors.list,
        staleTime: 30_000,
        refetchInterval: 60_000,
    });
}
export function usePipelineHealth() {
    return useQuery({
        queryKey: QK.pipelineHealth,
        queryFn: api.health.pipeline,
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}
// ─────────────────────────────────────────────
// COMPLIANCE QUERIES
// ─────────────────────────────────────────────
export function useAttackCoverage(gapsOnly = false) {
    return useQuery({
        queryKey: QK.attackCoverage(gapsOnly),
        queryFn: () => api.compliance.attackCoverage(gapsOnly),
        staleTime: 300_000,
    });
}
export function useDetectionRules() {
    return useQuery({
        queryKey: QK.rules,
        queryFn: api.compliance.rules,
        staleTime: 300_000,
    });
}
// ─────────────────────────────────────────────
// BILLING QUERIES
// ─────────────────────────────────────────────
export function useUsage() {
    return useQuery({
        queryKey: QK.usage,
        queryFn: api.billing.usage,
        staleTime: 300_000,
    });
}
// Additional hooks referenced in pages
export const useSubmitFeedback = useAlertFeedback;
export const useMttdMetrics = useMttd;
