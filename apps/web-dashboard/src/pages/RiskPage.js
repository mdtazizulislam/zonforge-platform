import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { Link, useSearchParams } from 'react-router-dom';
import { useRiskSummary, useRiskUsers, useRiskUser, useMttdMetrics, } from '@/hooks/queries';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { PostureGauge } from '@/components/widgets/PostureGauge';
import { Badge, Card, Skeleton, EmptyState } from '@/components/shared/ui';
import { Users, Server, Shield, Clock, AlertTriangle, ChevronRight, } from 'lucide-react';
// ── Risk score bar ────────────────────────────
function RiskBar({ score }) {
    const pct = Math.min(score, 100);
    const color = score >= 70 ? 'bg-red-500' : score >= 50 ? 'bg-orange-500'
        : score >= 25 ? 'bg-yellow-500' : 'bg-green-500';
    return (_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("div", { className: "flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: clsx('h-full rounded-full transition-all duration-500', color), style: { width: `${pct}%` } }) }), _jsx("span", { className: "text-xs font-bold tabular-nums text-gray-300 w-8 text-right", children: score })] }));
}
// ── Entity row ────────────────────────────────
function EntityRow({ rank, entityId, score, severity, selected, onSelect }) {
    return (_jsx("button", { onClick: onSelect, className: clsx('w-full text-left px-5 py-4 border-b border-gray-800/60 transition-colors', selected ? 'bg-blue-500/8 border-l-2 border-l-blue-500' : 'hover:bg-gray-800/40'), children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: clsx('flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold', rank === 1 ? 'bg-red-500/20 text-red-300'
                        : rank === 2 ? 'bg-orange-500/20 text-orange-300'
                            : rank <= 3 ? 'bg-yellow-500/20 text-yellow-300'
                                : 'bg-gray-700 text-gray-400'), children: rank }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("p", { className: "text-sm font-mono text-gray-200 truncate", children: entityId.length > 22 ? `${entityId.slice(0, 22)}…` : entityId }), _jsx(Badge, { variant: severity, size: "xs", children: severity })] }), _jsx(RiskBar, { score: score })] }), _jsx(ChevronRight, { className: "h-4 w-4 text-gray-600 flex-shrink-0" })] }) }));
}
// ── Entity detail ─────────────────────────────
function EntityDetail({ userId }) {
    const { data: profile, isLoading } = useRiskUser(userId);
    const risk = profile?.riskScore;
    if (isLoading)
        return (_jsx("div", { className: "p-6 space-y-4", children: [...Array(4)].map((_, i) => _jsx(Skeleton, { className: "h-16 w-full" }, i)) }));
    if (!risk)
        return (_jsx(EmptyState, { icon: Users, title: "No risk data", description: "Insufficient signal history for scoring." }));
    const scoreColor = risk.score >= 70 ? 'text-red-400' : risk.score >= 50 ? 'text-orange-400'
        : risk.score >= 25 ? 'text-yellow-400' : 'text-green-400';
    const strokeColor = risk.score >= 70 ? '#ef4444' : risk.score >= 50 ? '#f97316'
        : risk.score >= 25 ? '#eab308' : '#22c55e';
    const circumference = 2 * Math.PI * 30;
    const strokeDash = (risk.score / 100) * circumference;
    return (_jsxs("div", { className: "p-5 space-y-5 overflow-y-auto h-full", children: [_jsxs("div", { className: "flex items-center gap-5", children: [_jsxs("div", { className: "relative flex-shrink-0", children: [_jsxs("svg", { width: "80", height: "80", viewBox: "0 0 80 80", children: [_jsx("circle", { cx: "40", cy: "40", r: "30", fill: "none", stroke: "#1f2937", strokeWidth: "6" }), _jsx("circle", { cx: "40", cy: "40", r: "30", fill: "none", stroke: strokeColor, strokeWidth: "6", strokeLinecap: "round", strokeDasharray: `${strokeDash} ${circumference}`, transform: "rotate(-90 40 40)" })] }), _jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: _jsx("span", { className: clsx('text-xl font-bold', scoreColor), children: risk.score }) })] }), _jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(Badge, { variant: risk.severity, children: risk.severity }), _jsxs("span", { className: "text-xs text-gray-600 capitalize", children: [risk.confidenceBand, " confidence"] })] }), _jsxs("p", { className: "text-xs font-mono text-gray-500", children: [userId.slice(0, 28), "\u2026"] }), _jsxs("p", { className: "text-xs text-gray-700 mt-1", children: ["Updated ", new Date(risk.calculatedAt).toLocaleString()] })] })] }), risk.contributingSignals?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Risk Drivers" }), _jsx("div", { className: "space-y-3", children: risk.contributingSignals.map((sig, i) => (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("span", { className: "text-xs text-gray-400 capitalize", children: sig.signalType.replace(/_/g, ' ') }), _jsxs("span", { className: "text-xs font-bold text-gray-300", children: ["+", sig.contribution?.toFixed(1)] })] }), _jsx("div", { className: "h-1.5 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-blue-500/70 rounded-full transition-all", style: { width: `${Math.min(sig.contribution ?? 0, 100)}%` } }) })] }, i))) })] })), profile?.recommendedActions && profile.recommendedActions.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5", children: "Recommended Actions" }), _jsx("ol", { className: "space-y-2", children: profile.recommendedActions.map((action, i) => (_jsxs("li", { className: "flex gap-2.5 text-xs", children: [_jsx("span", { className: "flex-shrink-0 h-4 w-4 rounded-full bg-gray-800 text-gray-500\n                                 flex items-center justify-center font-bold mt-0.5", children: i + 1 }), _jsx("span", { className: "text-gray-400 leading-relaxed", children: action })] }, i))) })] })), _jsxs(Link, { to: `/alerts?affectedUserId=${userId}`, className: "flex items-center justify-center gap-2 w-full py-2.5 rounded-lg\n                   border border-gray-700 text-sm text-gray-400 hover:text-gray-200\n                   hover:border-gray-600 transition-colors", children: [_jsx(AlertTriangle, { className: "h-4 w-4" }), "View related alerts"] })] }));
}
// ─────────────────────────────────────────────
// RISK PAGE
// ─────────────────────────────────────────────
export default function RiskPage() {
    const [searchParams] = useSearchParams();
    const [view, setView] = useState('users');
    const [selectedId, setId] = useState(searchParams.get('userId'));
    const { data: summary, isLoading: sumLoading } = useRiskSummary();
    const { data: usersData, isLoading: usersLoading } = useRiskUsers();
    const { data: mttd } = useMttdMetrics();
    const entities = usersData?.items ?? [];
    const mttdBucket = mttd
        ? (Object.values(mttd).find((v) => !!v && typeof v === 'object' && 'p50' in v) ?? null)
        : null;
    return (_jsx(AppShell, { title: "Risk Intelligence", children: _jsxs(PageContent, { children: [_jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6", children: [_jsxs(Card, { className: "flex flex-col items-center gap-2 py-3", children: [_jsx(PostureGauge, { score: summary?.postureScore ?? 0, loading: sumLoading, size: "sm" }), _jsx("p", { className: "text-xs text-gray-500", children: "Org Posture" })] }), _jsxs(Card, { className: "flex flex-col justify-center gap-1", children: [_jsx("p", { className: clsx('text-3xl font-bold tabular-nums', (summary?.openCriticalAlerts ?? 0) > 0 ? 'text-red-400' : 'text-gray-400'), children: sumLoading ? '—' : summary?.openCriticalAlerts ?? 0 }), _jsx("p", { className: "text-sm text-gray-400", children: "Open P1 Alerts" }), _jsxs("p", { className: "text-xs text-gray-600", children: [summary?.openHighAlerts ?? 0, " P2 (high)"] })] }), _jsxs(Card, { className: "flex flex-col justify-center gap-1", children: [_jsx("p", { className: clsx('text-3xl font-bold tabular-nums', (summary?.avgUserRiskScore ?? 0) >= 50 ? 'text-orange-400' : 'text-gray-300'), children: sumLoading ? '—' : summary?.avgUserRiskScore ?? 0 }), _jsx("p", { className: "text-sm text-gray-400", children: "Avg User Risk" }), _jsx("p", { className: "text-xs text-gray-600", children: "out of 100" })] }), _jsxs(Card, { className: "flex flex-col justify-center gap-1", children: [_jsx("p", { className: clsx('text-3xl font-bold tabular-nums', (summary?.connectorHealthScore ?? 100) < 80 ? 'text-orange-400' : 'text-green-400'), children: sumLoading ? '—' : `${summary?.connectorHealthScore ?? 100}%` }), _jsx("p", { className: "text-sm text-gray-400", children: "Connector Health" })] })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs(Card, { padding: "none", children: [_jsx("div", { className: "flex items-center gap-1 p-3 border-b border-gray-800", children: ['users', 'assets'].map(v => (_jsxs("button", { onClick: () => { setView(v); setId(null); }, className: clsx('flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-sm font-medium transition-colors', view === v ? 'bg-gray-800 text-gray-200' : 'text-gray-600 hover:text-gray-400'), children: [v === 'users' ? _jsx(Users, { className: "h-4 w-4" }) : _jsx(Server, { className: "h-4 w-4" }), v === 'users' ? 'Users' : 'Assets'] }, v))) }), _jsx("div", { className: "max-h-[520px] overflow-y-auto", children: usersLoading ? (_jsx("div", { className: "divide-y divide-gray-800", children: [...Array(6)].map((_, i) => (_jsxs("div", { className: "flex items-center gap-3 p-4", children: [_jsx(Skeleton, { className: "h-7 w-7 rounded-full" }), _jsxs("div", { className: "flex-1 space-y-1.5", children: [_jsx(Skeleton, { className: "h-3 w-32" }), _jsx(Skeleton, { className: "h-1.5 w-full" })] })] }, i))) })) : entities.length === 0 ? (_jsx(EmptyState, { icon: Shield, title: "No risk scores yet", description: "Risk scores are calculated as alerts are processed." })) : (entities.map((u, i) => (_jsx(EntityRow, { rank: i + 1, entityId: u.entityId, score: u.score, severity: u.severity, selected: selectedId === u.entityId, onSelect: () => setId(u.entityId) }, u.entityId)))) })] }), _jsxs("div", { className: "lg:col-span-2 space-y-6", children: [_jsx(Card, { padding: "none", className: "min-h-[300px]", children: selectedId
                                        ? _jsx(EntityDetail, { userId: selectedId })
                                        : _jsx(EmptyState, { icon: Shield, title: "Select an entity", description: "Click a user or asset to view their full risk profile." }) }), mttdBucket && (_jsxs(Card, { children: [_jsx("div", { className: "flex items-center justify-between mb-4", children: _jsxs("h3", { className: "text-sm font-semibold text-gray-200 flex items-center gap-2", children: [_jsx(Clock, { className: "h-4 w-4 text-gray-500" }), "Mean Time to Detect"] }) }), _jsx("div", { className: "grid grid-cols-3 gap-4", children: [
                                                { label: 'P50 (Median)', value: mttdBucket.p50, color: 'bg-blue-500' },
                                                { label: 'P75', value: mttdBucket.p75, color: 'bg-orange-500' },
                                                { label: 'P95 (Worst)', value: mttdBucket.p95, color: 'bg-red-500' },
                                            ].map(({ label, value, color }) => {
                                                const max = Math.max(mttdBucket.p95 ?? 1, 1);
                                                const pct = value != null ? (value / max) * 100 : 0;
                                                return (_jsxs("div", { className: "flex flex-col items-center gap-2", children: [_jsx("div", { className: "w-full h-16 bg-gray-800/40 rounded-lg flex items-end p-1", children: _jsx("div", { className: clsx('w-full rounded transition-all', color), style: { height: `${pct}%`, minHeight: '4px' } }) }), _jsx("p", { className: "text-xl font-bold text-gray-100 tabular-nums", children: value != null ? `${value}m` : 'N/A' }), _jsx("p", { className: "text-xs text-gray-500 text-center", children: label })] }, label));
                                            }) })] }))] })] })] }) }));
}
