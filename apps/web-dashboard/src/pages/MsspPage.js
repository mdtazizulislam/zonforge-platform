import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Badge, Button, Card, EmptyState } from '@/components/shared/ui';
import { ShieldAlert, AlertTriangle, CheckCircle2, Search, RefreshCw, ExternalLink, DollarSign, Building2, MoreHorizontal, Eye, Ban, Clock, } from 'lucide-react';
// ─────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────
const authHeader = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
async function fetchMsspOverview() {
    const r = await fetch('/api/v1/mssp/overview', { headers: authHeader() });
    return r.json();
}
async function fetchMsspTenants(search) {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const r = await fetch(`/api/v1/mssp/tenants${params}`, { headers: authHeader() });
    return r.json();
}
async function fetchMsspAlerts() {
    const r = await fetch('/api/v1/mssp/alerts?limit=30', { headers: authHeader() });
    return r.json();
}
async function fetchRevenue() {
    const r = await fetch('/api/v1/mssp/revenue', { headers: authHeader() });
    return r.json();
}
// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const planColors = {
    starter: 'bg-gray-700 text-gray-300',
    growth: 'bg-blue-500/15 text-blue-400',
    business: 'bg-purple-500/15 text-purple-400',
    enterprise: 'bg-amber-500/15 text-amber-400',
    mssp: 'bg-green-500/15 text-green-400',
};
const statusColors = {
    active: 'bg-green-500/10 text-green-400',
    trial: 'bg-blue-500/10 text-blue-400',
    suspended: 'bg-red-500/10 text-red-400',
    cancelled: 'bg-gray-700 text-gray-500',
};
function formatMrr(cents) {
    if (cents === 0)
        return 'Free';
    return `$${Math.floor(cents / 100).toLocaleString()}/mo`;
}
function PostureBar({ score }) {
    const color = score >= 80 ? '#22c55e' : score >= 60 ? '#3b82f6' : score >= 40 ? '#eab308' : '#ef4444';
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full transition-all duration-500", style: { width: `${score}%`, background: color } }) }), _jsx("span", { className: "text-xs font-bold tabular-nums w-8 text-right", style: { color }, children: score })] }));
}
// ─────────────────────────────────────────────
// TENANT ROW
// ─────────────────────────────────────────────
function TenantRow({ tenant, onImpersonate, onSuspend, onViewDetail, }) {
    const [menuOpen, setMenuOpen] = useState(false);
    return (_jsxs("div", { className: "grid grid-cols-12 gap-4 px-5 py-3.5 items-center\n                    hover:bg-gray-800/30 transition-colors group border-b border-gray-800/50", children: [_jsx("div", { className: "col-span-3 min-w-0", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "h-7 w-7 rounded-lg bg-gray-800 flex items-center justify-center\n                          text-xs font-bold text-gray-400 flex-shrink-0", children: tenant.name?.[0]?.toUpperCase() }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-gray-200 truncate", children: tenant.name }), _jsx("p", { className: "text-xs text-gray-600 font-mono truncate", children: tenant.slug })] })] }) }), _jsxs("div", { className: "col-span-2 flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: clsx('px-2 py-0.5 rounded-full text-xs font-medium capitalize', planColors[tenant.planTier] ?? 'bg-gray-700 text-gray-400'), children: tenant.planTier }), _jsx("span", { className: clsx('px-2 py-0.5 rounded-full text-xs font-medium capitalize', statusColors[tenant.status] ?? 'bg-gray-700 text-gray-400'), children: tenant.status })] }), _jsx("div", { className: "col-span-2", children: _jsx(PostureBar, { score: tenant.postureScore ?? 75 }) }), _jsxs("div", { className: "col-span-2 flex items-center gap-2", children: [(tenant.openCritical ?? 0) > 0 && (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full\n                           text-xs font-bold bg-red-500/15 text-red-400", children: [_jsx(AlertTriangle, { className: "h-3 w-3" }), tenant.openCritical] })), (tenant.openHigh ?? 0) > 0 && (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full\n                           text-xs font-bold bg-orange-500/15 text-orange-400", children: [tenant.openHigh, "H"] })), !tenant.openCritical && !tenant.openHigh && (_jsx("span", { className: "text-xs text-gray-600", children: "Clean" }))] }), _jsxs("div", { className: "col-span-2 text-right", children: [_jsx("p", { className: "text-sm font-bold text-gray-300 tabular-nums", children: formatMrr(tenant.mrr ?? 0) }), _jsx("p", { className: "text-xs text-gray-600", children: new Date(tenant.createdAt).toLocaleDateString() })] }), _jsx("div", { className: "col-span-1 flex items-center justify-end", children: _jsxs("div", { className: "relative", children: [_jsx("button", { onClick: () => setMenuOpen(v => !v), className: "p-1.5 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-gray-800\n                       transition-colors opacity-0 group-hover:opacity-100", children: _jsx(MoreHorizontal, { className: "h-4 w-4" }) }), menuOpen && (_jsxs("div", { className: "absolute right-0 top-8 z-20 w-44 bg-gray-900 border border-gray-700\n                            rounded-xl shadow-2xl overflow-hidden", children: [_jsxs("button", { onClick: () => { onViewDetail(tenant.id); setMenuOpen(false); }, className: "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300\n                           hover:bg-gray-800 transition-colors", children: [_jsx(Eye, { className: "h-3.5 w-3.5" }), " View Details"] }), _jsxs("button", { onClick: () => { onImpersonate(tenant.id); setMenuOpen(false); }, className: "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300\n                           hover:bg-gray-800 transition-colors", children: [_jsx(ExternalLink, { className: "h-3.5 w-3.5" }), " Impersonate"] }), _jsx("div", { className: "h-px bg-gray-800" }), _jsxs("button", { onClick: () => { onSuspend(tenant.id); setMenuOpen(false); }, className: "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400\n                           hover:bg-red-500/10 transition-colors", children: [_jsx(Ban, { className: "h-3.5 w-3.5" }), " Suspend"] })] }))] }) })] }));
}
// ─────────────────────────────────────────────
// REVENUE CHART (simple horizontal bars)
// ─────────────────────────────────────────────
function RevenuePlanBreakdown({ byPlan }) {
    const entries = Object.entries(byPlan).sort(([, a], [, b]) => b.mrr - a.mrr);
    const maxMrr = Math.max(...entries.map(([, v]) => v.mrr), 1);
    return (_jsx("div", { className: "space-y-3", children: entries.map(([plan, data]) => (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-medium capitalize', planColors[plan] ?? 'bg-gray-700 text-gray-400'), children: plan }), _jsxs("span", { className: "text-xs text-gray-500", children: [data.count, " tenant", data.count !== 1 ? 's' : ''] })] }), _jsx("span", { className: "text-sm font-bold text-gray-200 tabular-nums", children: formatMrr(data.mrr) })] }), _jsx("div", { className: "h-2 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full bg-blue-500/60 transition-all duration-700", style: { width: `${(data.mrr / maxMrr) * 100}%` } }) })] }, plan))) }));
}
// ─────────────────────────────────────────────
// MSSP PAGE
// ─────────────────────────────────────────────
export default function MsspPage() {
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('tenants');
    const [selectedId, setSelectedId] = useState(null);
    const [impersonating, setImpersonating] = useState(null);
    const qc = useQueryClient();
    const { data: overview, isLoading: ovLoading } = useQuery({
        queryKey: ['mssp', 'overview'],
        queryFn: fetchMsspOverview,
        staleTime: 5 * 60_000,
        refetchInterval: 5 * 60_000,
    });
    const { data: tenants, isLoading: tenLoading, refetch } = useQuery({
        queryKey: ['mssp', 'tenants', search],
        queryFn: () => fetchMsspTenants(search || undefined),
        staleTime: 60_000,
    });
    const { data: alertData, isLoading: alertLoading } = useQuery({
        queryKey: ['mssp', 'alerts'],
        queryFn: fetchMsspAlerts,
        staleTime: 30_000,
        refetchInterval: 30_000,
        enabled: activeTab === 'alerts',
    });
    const { data: revenueData } = useQuery({
        queryKey: ['mssp', 'revenue'],
        queryFn: fetchRevenue,
        staleTime: 10 * 60_000,
        enabled: activeTab === 'revenue',
    });
    const ov = overview?.data;
    const tenList = tenants?.data ?? [];
    const alerts = alertData?.data ?? [];
    const revenue = revenueData?.data;
    async function handleImpersonate(tenantId) {
        setImpersonating(tenantId);
        try {
            const r = await fetch(`/api/v1/mssp/tenants/${tenantId}/impersonate`, {
                method: 'POST', headers: authHeader(),
            });
            const data = await r.json();
            if (data.data?.token) {
                // Open tenant dashboard in new tab with impersonation token
                const url = `${window.location.origin}/dashboard?impersonate=${data.data.token}`;
                window.open(url, '_blank');
            }
        }
        finally {
            setImpersonating(null);
        }
    }
    async function handleSuspend(tenantId) {
        if (!confirm('Suspend this tenant? All active sessions will be terminated.'))
            return;
        await fetch('/api/v1/mssp/tenants/bulk-suspend', {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({ tenantIds: [tenantId], reason: 'Suspended by MSSP admin' }),
        });
        qc.invalidateQueries({ queryKey: ['mssp'] });
    }
    return (_jsx(AppShell, { title: "MSSP Console", actions: _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium\n                          bg-amber-500/10 text-amber-400 border border-amber-500/20", children: [_jsx(Building2, { className: "h-3.5 w-3.5" }), "PLATFORM_ADMIN"] }), _jsx(Button, { variant: "ghost", size: "sm", icon: RefreshCw, onClick: () => qc.invalidateQueries({ queryKey: ['mssp'] }), children: "Refresh" })] }), children: _jsxs(PageContent, { children: [_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6", children: [
                        { label: 'Total Tenants', value: ov?.totalTenants, icon: Building2, color: 'text-gray-200' },
                        { label: 'Active', value: ov?.activeTenants, icon: CheckCircle2, color: 'text-green-400' },
                        { label: 'Trial', value: ov?.trialTenants, icon: Clock, color: 'text-blue-400' },
                        { label: 'Open Critical', value: ov?.totalOpenCritical, icon: AlertTriangle, color: (ov?.totalOpenCritical ?? 0) > 0 ? 'text-red-400' : 'text-gray-400' },
                        { label: 'Total MRR', value: ov ? formatMrr(ov.totalMrr) : '—', icon: DollarSign, color: 'text-green-400' },
                    ].map(k => (_jsxs(Card, { className: "flex flex-col gap-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(k.icon, { className: "h-4 w-4 text-gray-600" }), _jsx("span", { className: "text-xs text-gray-500", children: k.label })] }), ovLoading
                                ? _jsx("div", { className: "h-7 w-16 rounded bg-gray-800 animate-pulse" })
                                : _jsx("p", { className: clsx('text-2xl font-bold tabular-nums', k.color), children: k.value ?? '—' })] }, k.label))) }), _jsx("div", { className: "flex items-center gap-1 border-b border-gray-800 mb-5", children: [
                        { id: 'tenants', label: 'Tenants', icon: Building2, count: ov?.totalTenants },
                        { id: 'alerts', label: 'Cross-Tenant Alerts', icon: ShieldAlert, count: ov?.totalOpenCritical },
                        { id: 'revenue', label: 'Revenue', icon: DollarSign, count: null },
                    ].map(t => (_jsxs("button", { onClick: () => setActiveTab(t.id), className: clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all', activeTab === t.id
                            ? 'text-blue-400 border-blue-500'
                            : 'text-gray-500 border-transparent hover:text-gray-300'), children: [_jsx(t.icon, { className: "h-4 w-4" }), t.label, t.count != null && t.count > 0 && (_jsx("span", { className: clsx('text-xs px-1.5 rounded-full font-bold', t.id === 'alerts' && t.count > 0 ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-400'), children: t.count }))] }, t.id))) }), activeTab === 'tenants' && (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsxs("div", { className: "relative flex-1 max-w-xs", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" }), _jsx("input", { type: "text", placeholder: "Search tenants\u2026", value: search, onChange: e => setSearch(e.target.value), className: "w-full pl-9 pr-4 py-2 rounded-lg border border-gray-700 bg-gray-800\n                             text-sm text-gray-200 placeholder-gray-600\n                             focus:outline-none focus:border-blue-500" })] }), _jsxs("span", { className: "text-sm text-gray-500", children: [tenList.length, " tenants"] })] }), _jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "grid grid-cols-12 gap-4 px-5 py-2.5 text-xs font-medium text-gray-500\n                              uppercase tracking-wider bg-gray-800/40 border-b border-gray-800", children: [_jsx("div", { className: "col-span-3", children: "Tenant" }), _jsx("div", { className: "col-span-2", children: "Plan / Status" }), _jsx("div", { className: "col-span-2", children: "Posture" }), _jsx("div", { className: "col-span-2", children: "Alerts" }), _jsx("div", { className: "col-span-2 text-right", children: "MRR" }), _jsx("div", { className: "col-span-1" })] }), tenLoading ? (_jsx("div", { className: "divide-y divide-gray-800", children: [...Array(6)].map((_, i) => (_jsxs("div", { className: "flex items-center gap-4 px-5 py-4", children: [_jsx("div", { className: "h-7 w-7 rounded-lg bg-gray-800 animate-pulse" }), _jsxs("div", { className: "flex-1 space-y-1.5", children: [_jsx("div", { className: "h-3 w-40 rounded bg-gray-800 animate-pulse" }), _jsx("div", { className: "h-2 w-24 rounded bg-gray-800 animate-pulse" })] })] }, i))) })) : tenList.length === 0 ? (_jsx(EmptyState, { icon: Building2, title: "No tenants found", description: "No tenants match your search." })) : (tenList.map((t) => (_jsx(TenantRow, { tenant: t, onImpersonate: handleImpersonate, onSuspend: handleSuspend, onViewDetail: setSelectedId }, t.id))))] })] })), activeTab === 'alerts' && (_jsx("div", { children: _jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "grid grid-cols-12 gap-4 px-5 py-2.5 text-xs font-medium text-gray-500\n                              uppercase tracking-wider bg-gray-800/40 border-b border-gray-800", children: [_jsx("div", { className: "col-span-2", children: "Tenant" }), _jsx("div", { className: "col-span-5", children: "Alert" }), _jsx("div", { className: "col-span-2", children: "Severity" }), _jsx("div", { className: "col-span-2", children: "Status" }), _jsx("div", { className: "col-span-1 text-right", children: "Time" })] }), alertLoading ? (_jsx("div", { className: "divide-y divide-gray-800", children: [...Array(6)].map((_, i) => (_jsxs("div", { className: "flex gap-4 p-4", children: [_jsx("div", { className: "h-3 w-24 rounded bg-gray-800 animate-pulse" }), _jsx("div", { className: "flex-1 h-3 rounded bg-gray-800 animate-pulse" })] }, i))) })) : alerts.length === 0 ? (_jsx(EmptyState, { icon: ShieldAlert, title: "No critical alerts", description: "No P1/P2 open alerts across any tenant." })) : (_jsx("div", { className: "divide-y divide-gray-800/60", children: alerts.map((a) => (_jsxs("div", { className: "grid grid-cols-12 gap-4 px-5 py-3 items-center hover:bg-gray-800/30", children: [_jsx("div", { className: "col-span-2", children: _jsx("span", { className: "text-xs font-medium text-gray-400 truncate block", children: a.tenantName }) }), _jsxs("div", { className: "col-span-5 min-w-0", children: [_jsx("p", { className: "text-sm text-gray-200 truncate", children: a.title }), a.mttdSlaBreached && (_jsx("span", { className: "text-xs text-red-400 font-medium", children: "SLA Breach" }))] }), _jsx("div", { className: "col-span-2", children: _jsx(Badge, { variant: a.severity, size: "xs", children: a.severity }) }), _jsx("div", { className: "col-span-2", children: _jsx(Badge, { variant: a.priority, size: "xs", children: a.priority }) }), _jsx("div", { className: "col-span-1 text-right", children: _jsx("span", { className: "text-xs text-gray-500", children: new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) })] }, a.id))) }))] }) })), activeTab === 'revenue' && (_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsx("div", { className: "space-y-4", children: [
                                { label: 'Monthly Recurring Revenue', value: revenue ? formatMrr(revenue.totalMrr) : '—', color: 'text-green-400' },
                                { label: 'Annual Run Rate', value: revenue ? `$${Math.floor((revenue.totalArr ?? 0) / 100).toLocaleString()}/yr` : '—', color: 'text-blue-400' },
                                { label: 'New Tenants (30d)', value: revenue?.newThisPeriod ?? '—', color: 'text-gray-200' },
                                { label: 'Churned (30d)', value: revenue?.churnedThisPeriod ?? '—', color: (revenue?.churnedThisPeriod ?? 0) > 0 ? 'text-red-400' : 'text-gray-400' },
                            ].map(k => (_jsxs(Card, { className: "flex flex-col gap-1", children: [_jsx("span", { className: "text-xs text-gray-500 uppercase tracking-wider", children: k.label }), _jsx("span", { className: clsx('text-2xl font-bold tabular-nums', k.color), children: k.value })] }, k.label))) }), _jsx("div", { className: "lg:col-span-2", children: _jsxs(Card, { children: [_jsxs("div", { className: "flex items-center justify-between mb-5", children: [_jsxs("h3", { className: "text-sm font-semibold text-gray-200 flex items-center gap-2", children: [_jsx(DollarSign, { className: "h-4 w-4 text-gray-500" }), "MRR by Plan"] }), _jsxs("span", { className: "text-xs text-gray-600", children: ["Total: ", revenue ? formatMrr(revenue.totalMrr) : '—'] })] }), revenue?.byPlan
                                        ? _jsx(RevenuePlanBreakdown, { byPlan: revenue.byPlan })
                                        : _jsx("div", { className: "space-y-3", children: [...Array(4)].map((_, i) => (_jsx("div", { className: "h-8 rounded bg-gray-800 animate-pulse" }, i))) }), ov?.tenantsByPlan && (_jsxs("div", { className: "mt-5 pt-4 border-t border-gray-800", children: [_jsx("p", { className: "text-xs text-gray-500 mb-3 uppercase tracking-wider", children: "Tenant Distribution" }), _jsx("div", { className: "flex items-center gap-2 flex-wrap", children: Object.entries(ov.tenantsByPlan).map(([plan, count]) => (_jsxs("div", { className: clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium', planColors[plan] ?? 'bg-gray-700 text-gray-400'), children: [_jsx("span", { className: "capitalize", children: plan }), _jsx("span", { className: "font-bold", children: count })] }, plan))) })] }))] }) })] }))] }) }));
}
