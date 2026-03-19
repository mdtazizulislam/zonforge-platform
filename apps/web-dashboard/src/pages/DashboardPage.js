import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useRiskSummary, useAlerts, useMttdMetrics, useConnectors, usePipelineHealth, } from '@/hooks/queries';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { PostureGauge } from '@/components/widgets/PostureGauge';
import { AlertTrendChart } from '@/components/charts/AlertTrendChart';
import { useAuthStore } from '@/stores/auth.store';
import { ShieldAlert, Users, Server, Clock, Activity, TrendingUp, TrendingDown, Minus, ArrowRight, AlertTriangle, CheckCircle2, Wifi, WifiOff, } from 'lucide-react';
// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function severityBadge(sev) {
    const map = {
        critical: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
        high: 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30',
        medium: 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30',
        low: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
        info: 'bg-gray-700 text-gray-400',
    };
    return map[sev] ?? map.info;
}
function priorityDot(priority) {
    const map = {
        P1: 'bg-red-500',
        P2: 'bg-orange-500',
        P3: 'bg-yellow-500',
        P4: 'bg-blue-500',
    };
    return map[priority] ?? 'bg-gray-500';
}
function scoreColor(score) {
    if (score >= 70)
        return 'text-red-400';
    if (score >= 50)
        return 'text-orange-400';
    if (score >= 25)
        return 'text-yellow-400';
    return 'text-green-400';
}
function scoreTrend(current, prev) {
    const delta = current - prev;
    if (Math.abs(delta) < 2)
        return { icon: Minus, color: 'text-gray-400', label: 'stable' };
    if (delta > 0)
        return { icon: TrendingUp, color: 'text-red-400', label: `+${delta}` };
    return { icon: TrendingDown, color: 'text-green-400', label: `${delta}` };
}
function StatCard({ label, value, subLabel, icon: Icon, iconColor, trend, href, loading, }) {
    const card = (_jsxs("div", { className: clsx('relative flex flex-col gap-3 rounded-xl border border-gray-800', 'bg-gray-900 p-5 transition-colors', href && 'hover:border-gray-700 hover:bg-gray-800/60 cursor-pointer'), children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsx("div", { className: clsx('rounded-lg p-2.5', iconColor), children: _jsx(Icon, { className: "h-5 w-5" }) }), trend && (_jsxs("div", { className: clsx('flex items-center gap-1 text-xs font-medium', trend.isGood ? 'text-green-400' : 'text-red-400'), children: [trend.direction === 'up' && _jsx(TrendingUp, { className: "h-3.5 w-3.5" }), trend.direction === 'down' && _jsx(TrendingDown, { className: "h-3.5 w-3.5" }), trend.direction === 'flat' && _jsx(Minus, { className: "h-3.5 w-3.5 text-gray-500" }), _jsx("span", { children: trend.value })] }))] }), _jsxs("div", { children: [loading ? (_jsx("div", { className: "h-8 w-24 rounded bg-gray-800 animate-pulse" })) : (_jsx("p", { className: "text-2xl font-bold text-gray-100 tabular-nums", children: value })), _jsx("p", { className: "mt-0.5 text-sm text-gray-400", children: label }), subLabel && _jsx("p", { className: "mt-1 text-xs text-gray-600", children: subLabel })] }), href && (_jsx(ArrowRight, { className: "absolute right-4 bottom-4 h-4 w-4 text-gray-600" }))] }));
    return href ? _jsx(Link, { to: href, children: card }) : card;
}
// ─────────────────────────────────────────────
// CONNECTOR STATUS ROW
// ─────────────────────────────────────────────
function ConnectorStatusRow({ connector }) {
    return (_jsxs("div", { className: "flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsx("div", { className: clsx('h-2 w-2 rounded-full flex-shrink-0', {
                            'bg-green-400': connector.status === 'active' && connector.isHealthy,
                            'bg-yellow-400': connector.status === 'active' && !connector.isHealthy,
                            'bg-red-400': connector.status === 'error',
                            'bg-gray-600': connector.status === 'paused' || connector.status === 'pending_auth',
                        }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-gray-200 truncate", children: connector.name }), _jsx("p", { className: "text-xs text-gray-500", children: connector.type.replace(/_/g, ' ') })] })] }), _jsxs("div", { className: "flex-shrink-0 text-right", children: [connector.lastEventAt ? (_jsx("p", { className: "text-xs text-gray-400", children: new Date(connector.lastEventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })) : (_jsx("p", { className: "text-xs text-gray-600", children: "No events" })), _jsx("p", { className: clsx('text-xs font-medium mt-0.5', {
                            'text-green-400': connector.status === 'active' && connector.isHealthy,
                            'text-yellow-400': connector.status === 'active' && !connector.isHealthy,
                            'text-red-400': connector.status === 'error',
                            'text-gray-500': connector.status === 'paused',
                        }), children: connector.status === 'active' && connector.isHealthy ? 'Healthy' :
                            connector.status === 'active' ? 'Lagging' :
                                connector.status === 'error' ? 'Error' :
                                    connector.status === 'paused' ? 'Paused' : 'Pending' })] })] }));
}
// ─────────────────────────────────────────────
// RECENT ALERT ROW
// ─────────────────────────────────────────────
function AlertRow({ alert }) {
    return (_jsxs(Link, { to: `/alerts/${alert.id}`, className: "flex items-start gap-3 py-3 border-b border-gray-800 last:border-0\n                 hover:bg-gray-800/50 -mx-4 px-4 rounded-lg transition-colors", children: [_jsx("div", { className: "flex-shrink-0 mt-0.5", children: _jsx("div", { className: clsx('h-2 w-2 rounded-full mt-1.5', priorityDot(alert.priority)) }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-gray-200 truncate", children: alert.title }), _jsxs("div", { className: "mt-1 flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: clsx('inline-flex px-1.5 py-0.5 rounded text-xs font-medium', severityBadge(alert.severity)), children: alert.severity }), alert.mitreTechniques.slice(0, 2).map(t => (_jsx("span", { className: "text-xs text-gray-600 font-mono", children: t }, t)))] })] }), _jsxs("div", { className: "flex-shrink-0 text-right", children: [_jsx("p", { className: "text-xs text-gray-500", children: new Date(alert.createdAt).toLocaleTimeString([], {
                            hour: '2-digit', minute: '2-digit',
                        }) }), _jsx("p", { className: clsx('text-xs mt-0.5 font-medium', {
                            'text-yellow-400': alert.status === 'investigating',
                            'text-gray-400': alert.status === 'open',
                            'text-green-400': alert.status === 'resolved',
                        }), children: alert.status })] })] }));
}
// ─────────────────────────────────────────────
// DASHBOARD PAGE
// ─────────────────────────────────────────────
export default function DashboardPage() {
    const user = useAuthStore(s => s.user);
    const { data: risk, isLoading: riskLoading } = useRiskSummary();
    const { data: alertsData, isLoading: alertsLoading } = useAlerts({
        status: ['open', 'investigating'],
        limit: 8,
    });
    const { data: mttd, isLoading: mttdLoading } = useMttdMetrics();
    const { data: connData, isLoading: connLoading } = useConnectors();
    const { data: pipeline } = usePipelineHealth();
    const alerts = alertsData?.data ?? [];
    const connectors = connData?.data ?? [];
    const openP1 = alerts.filter(a => a.priority === 'P1').length;
    const openP2 = alerts.filter(a => a.priority === 'P2').length;
    const healthyConn = connectors.filter((c) => c.isHealthy).length;
    // Greeting
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return (_jsx(AppShell, { title: "Executive Overview", actions: _jsx("div", { className: "flex items-center gap-2", children: _jsxs("div", { className: clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', pipeline?.data?.overall === 'healthy'
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'), children: [pipeline?.data?.overall === 'healthy'
                        ? _jsx(Wifi, { className: "h-3.5 w-3.5" })
                        : _jsx(WifiOff, { className: "h-3.5 w-3.5" }), "Pipeline ", pipeline?.data?.overall ?? 'checking…'] }) }), children: _jsxs(PageContent, { children: [_jsxs("div", { className: "mb-6", children: [_jsxs("h2", { className: "text-2xl font-bold text-gray-100", children: [greeting, ", ", user?.name?.split(' ')[0] ?? 'Analyst'] }), _jsxs("p", { className: "mt-1 text-sm text-gray-500", children: [new Date().toLocaleDateString('en-US', {
                                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                                }), " \u00B7 Tenant: ", user?.tenantId?.slice(0, 8), "\u2026"] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6", children: [_jsx(StatCard, { label: "Open Critical", value: riskLoading ? '—' : String(risk?.data?.openCriticalAlerts ?? 0), icon: AlertTriangle, iconColor: openP1 > 0 ? 'bg-red-500/15 text-red-400' : 'bg-gray-800 text-gray-500', href: "/alerts?priority=P1", loading: riskLoading, trend: openP1 > 0
                                ? { direction: 'up', value: `${openP1} P1`, isGood: false }
                                : { direction: 'flat', value: 'None', isGood: true } }), _jsx(StatCard, { label: "Org Posture Score", value: riskLoading ? '—' : `${risk?.data?.postureScore ?? 0}/100`, subLabel: risk?.data?.postureScore >= 80 ? 'Good'
                                : risk?.data?.postureScore >= 60 ? 'Fair' : 'Needs attention', icon: ShieldAlert, iconColor: (risk?.data?.postureScore ?? 0) >= 80 ? 'bg-green-500/15 text-green-400'
                                : (risk?.data?.postureScore ?? 0) >= 60 ? 'bg-yellow-500/15 text-yellow-400'
                                    : 'bg-red-500/15 text-red-400', href: "/risk", loading: riskLoading }), _jsx(StatCard, { label: "MTTD (P50)", value: mttdLoading ? '—'
                                : mttd?.data?.p50Minutes != null
                                    ? `${mttd.data.p50Minutes}m`
                                    : 'N/A', subLabel: "Median detection time", icon: Clock, iconColor: "bg-blue-500/15 text-blue-400", loading: mttdLoading }), _jsx(StatCard, { label: "Connectors", value: connLoading ? '—' : `${healthyConn}/${connectors.length}`, subLabel: "Healthy / Total", icon: Activity, iconColor: healthyConn === connectors.length ? 'bg-green-500/15 text-green-400'
                                : 'bg-orange-500/15 text-orange-400', href: "/connectors", loading: connLoading })] }), _jsxs("div", { className: "grid grid-cols-1 gap-6 lg:grid-cols-3", children: [_jsxs("div", { className: "flex flex-col gap-6", children: [_jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-5", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-300", children: "Security Posture" }), _jsxs(Link, { to: "/risk", className: "text-xs text-blue-400 hover:underline flex items-center gap-1", children: ["Details ", _jsx(ArrowRight, { className: "h-3 w-3" })] })] }), _jsx("div", { className: "flex justify-center py-2", children: _jsx(PostureGauge, { score: risk?.data?.postureScore ?? 0, loading: riskLoading }) }), _jsxs("div", { className: "mt-4 grid grid-cols-2 gap-3 text-center", children: [_jsxs("div", { className: "rounded-lg bg-gray-800/60 py-2 px-3", children: [_jsx("p", { className: "text-lg font-bold text-orange-400", children: risk?.data?.openHighAlerts ?? '—' }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: "High alerts" })] }), _jsxs("div", { className: "rounded-lg bg-gray-800/60 py-2 px-3", children: [_jsx("p", { className: "text-lg font-bold text-gray-200", children: risk?.data?.avgUserRiskScore ?? '—' }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: "Avg user risk" })] })] })] }), _jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-5 flex-1", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("h3", { className: "text-sm font-semibold text-gray-300", children: [_jsx(Users, { className: "inline h-4 w-4 mr-1.5 text-gray-500" }), "Top Risk Users"] }), _jsx(Link, { to: "/risk", className: "text-xs text-blue-400 hover:underline", children: "View all" })] }), riskLoading ? (_jsx("div", { className: "space-y-3", children: [...Array(4)].map((_, i) => (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-8 w-8 rounded-full bg-gray-800 animate-pulse" }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "h-3 w-28 rounded bg-gray-800 animate-pulse mb-1.5" }), _jsx("div", { className: "h-2 w-16 rounded bg-gray-800 animate-pulse" })] }), _jsx("div", { className: "h-6 w-10 rounded bg-gray-800 animate-pulse" })] }, i))) })) : (risk?.data?.topRiskUserIds ?? []).length > 0 ? (_jsx("div", { className: "space-y-1", children: (risk?.data?.topRiskUserIds ?? []).slice(0, 5).map((userId, idx) => (_jsxs(Link, { to: `/risk?userId=${userId}`, className: "flex items-center gap-3 py-2 rounded-lg\n                                 hover:bg-gray-800/60 -mx-2 px-2 transition-colors", children: [_jsx("div", { className: clsx('flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold', idx === 0 ? 'bg-red-500/20 text-red-400'
                                                            : idx === 1 ? 'bg-orange-500/20 text-orange-400'
                                                                : 'bg-gray-700 text-gray-400'), children: idx + 1 }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("p", { className: "text-sm text-gray-300 font-mono truncate", children: [userId.slice(0, 12), "\u2026"] }), _jsx("p", { className: "text-xs text-gray-600", children: "User" })] }), _jsx(ArrowRight, { className: "h-3.5 w-3.5 text-gray-600 flex-shrink-0" })] }, userId))) })) : (_jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-center", children: [_jsx(CheckCircle2, { className: "h-8 w-8 text-green-500/40 mb-2" }), _jsx("p", { className: "text-sm text-gray-500", children: "No high-risk users" })] }))] })] }), _jsxs("div", { className: "lg:col-span-1 flex flex-col gap-6", children: [_jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-5", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-300", children: "Alert Trend (30 days)" }), _jsxs(Link, { to: "/alerts", className: "text-xs text-blue-400 hover:underline flex items-center gap-1", children: ["All alerts ", _jsx(ArrowRight, { className: "h-3 w-3" })] })] }), _jsx(AlertTrendChart, { height: 180 })] }), _jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-5 flex-1", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsxs("h3", { className: "text-sm font-semibold text-gray-300", children: [_jsx(ShieldAlert, { className: "inline h-4 w-4 mr-1.5 text-gray-500" }), "Recent Alerts"] }), _jsx(Link, { to: "/alerts", className: "text-xs text-blue-400 hover:underline", children: "View all" })] }), alertsLoading ? (_jsx("div", { className: "space-y-3 mt-3", children: [...Array(4)].map((_, i) => (_jsxs("div", { className: "flex gap-3", children: [_jsx("div", { className: "h-2 w-2 mt-2 rounded-full bg-gray-800 animate-pulse flex-shrink-0" }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "h-3 w-full rounded bg-gray-800 animate-pulse mb-1.5" }), _jsx("div", { className: "h-2 w-24 rounded bg-gray-800 animate-pulse" })] })] }, i))) })) : alerts.length > 0 ? (_jsx("div", { children: alerts.slice(0, 6).map((alert) => (_jsx(AlertRow, { alert: alert }, alert.id))) })) : (_jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-center", children: [_jsx(CheckCircle2, { className: "h-10 w-10 text-green-500/30 mb-3" }), _jsx("p", { className: "text-sm font-medium text-gray-400", children: "No open alerts" }), _jsx("p", { className: "text-xs text-gray-600 mt-1", children: "All clear \u2014 keep monitoring" })] }))] })] }), _jsxs("div", { className: "flex flex-col gap-6", children: [_jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-5", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("h3", { className: "text-sm font-semibold text-gray-300", children: [_jsx(Activity, { className: "inline h-4 w-4 mr-1.5 text-gray-500" }), "Data Connectors"] }), _jsx(Link, { to: "/connectors", className: "text-xs text-blue-400 hover:underline", children: "Manage" })] }), connLoading ? (_jsx("div", { className: "space-y-3", children: [...Array(3)].map((_, i) => (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-2 w-2 rounded-full bg-gray-800 animate-pulse flex-shrink-0" }), _jsx("div", { className: "flex-1 h-3 rounded bg-gray-800 animate-pulse" }), _jsx("div", { className: "h-3 w-12 rounded bg-gray-800 animate-pulse" })] }, i))) })) : connectors.length > 0 ? (_jsx("div", { children: connectors.slice(0, 5).map((c) => (_jsx(ConnectorStatusRow, { connector: c }, c.id))) })) : (_jsxs("div", { className: "text-center py-6", children: [_jsx(WifiOff, { className: "h-8 w-8 text-gray-700 mx-auto mb-2" }), _jsx("p", { className: "text-sm text-gray-500", children: "No connectors configured" }), _jsx(Link, { to: "/connectors", className: "text-xs text-blue-400 mt-2 inline-block hover:underline", children: "Add connector \u2192" })] }))] }), _jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-5", children: [_jsx("div", { className: "flex items-center justify-between mb-4", children: _jsxs("h3", { className: "text-sm font-semibold text-gray-300", children: [_jsx(Clock, { className: "inline h-4 w-4 mr-1.5 text-gray-500" }), "Detection Time (MTTD)"] }) }), mttdLoading ? (_jsx("div", { className: "grid grid-cols-3 gap-3", children: [...Array(3)].map((_, i) => (_jsxs("div", { className: "rounded-lg bg-gray-800/60 p-3 text-center", children: [_jsx("div", { className: "h-6 w-10 rounded bg-gray-800 animate-pulse mx-auto mb-1" }), _jsx("div", { className: "h-2 w-8 rounded bg-gray-800 animate-pulse mx-auto" })] }, i))) })) : (_jsx("div", { className: "grid grid-cols-3 gap-3", children: [
                                                { label: 'P50', value: mttd?.data?.p50Minutes },
                                                { label: 'P90', value: mttd?.data?.p90Minutes },
                                                { label: 'P99', value: mttd?.data?.p99Minutes },
                                            ].map(({ label, value }) => (_jsxs("div", { className: "rounded-lg bg-gray-800/60 p-3 text-center", children: [_jsx("p", { className: "text-lg font-bold text-gray-100", children: value != null ? `${value}m` : 'N/A' }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: label })] }, label))) })), mttd?.data?.trend30d != null && (_jsxs("div", { className: clsx('mt-3 flex items-center gap-1.5 text-xs', mttd.data.trend30d < 0 ? 'text-green-400' : 'text-red-400'), children: [mttd.data.trend30d < 0
                                                    ? _jsx(TrendingDown, { className: "h-3.5 w-3.5" })
                                                    : _jsx(TrendingUp, { className: "h-3.5 w-3.5" }), _jsx("span", { children: mttd.data.trend30d < 0
                                                        ? `${Math.abs(mttd.data.trend30d)}% faster vs last month`
                                                        : `${mttd.data.trend30d}% slower vs last month` })] }))] }), _jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-5 flex-1", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("h3", { className: "text-sm font-semibold text-gray-300", children: [_jsx(Server, { className: "inline h-4 w-4 mr-1.5 text-gray-500" }), "Top Risk Assets"] }), _jsx(Link, { to: "/risk?view=assets", className: "text-xs text-blue-400 hover:underline", children: "View all" })] }), riskLoading ? (_jsx("div", { className: "space-y-2", children: [...Array(3)].map((_, i) => (_jsx("div", { className: "h-10 rounded-lg bg-gray-800 animate-pulse" }, i))) })) : (risk?.data?.topRiskAssetIds ?? []).length > 0 ? (_jsx("div", { className: "space-y-1", children: (risk?.data?.topRiskAssetIds ?? []).slice(0, 4).map((assetId, idx) => (_jsxs("div", { className: "flex items-center gap-3 py-2 rounded-lg", children: [_jsx("div", { className: clsx('flex h-7 w-7 items-center justify-center rounded text-xs font-bold', idx === 0 ? 'bg-red-500/20 text-red-400'
                                                            : idx === 1 ? 'bg-orange-500/20 text-orange-400'
                                                                : 'bg-gray-700 text-gray-400'), children: idx + 1 }), _jsxs("p", { className: "text-sm text-gray-300 font-mono truncate flex-1", children: [assetId.slice(0, 12), "\u2026"] })] }, assetId))) })) : (_jsxs("div", { className: "flex flex-col items-center justify-center py-6 text-center", children: [_jsx(CheckCircle2, { className: "h-8 w-8 text-green-500/40 mb-2" }), _jsx("p", { className: "text-sm text-gray-500", children: "No high-risk assets" })] }))] })] })] })] }) }));
}
