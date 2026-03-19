import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { Link, useParams } from 'react-router-dom';
import { useAlerts } from '@/hooks/queries';
import { Badge, Skeleton } from '@/components/shared/ui';
import { ShieldAlert, Clock, User, Tag, ChevronDown, ChevronUp, } from 'lucide-react';
const PRIORITY_LABELS = {
    P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low',
};
const PRIORITY_ORDER = ['P1', 'P2', 'P3', 'P4'];
export function AlertQueuePanel({ onSelectAlert }) {
    const { id: selectedId } = useParams();
    const [collapsed, setCollapsed] = useState(new Set());
    const [showResolved, setShowResolved] = useState(false);
    const { data, isLoading, isFetching, dataUpdatedAt } = useAlerts({
        status: showResolved
            ? ['open', 'investigating', 'resolved']
            : ['open', 'investigating'],
        limit: 200,
    });
    const alerts = data?.data ?? [];
    // Group by priority
    const grouped = useMemo(() => {
        const groups = {};
        for (const p of PRIORITY_ORDER)
            groups[p] = [];
        for (const a of alerts) {
            groups[a.priority]?.push(a);
        }
        return groups;
    }, [alerts]);
    function toggleCollapse(priority) {
        setCollapsed(prev => {
            const next = new Set(prev);
            next.has(priority) ? next.delete(priority) : next.add(priority);
            return next;
        });
    }
    const totalOpen = alerts.filter(a => a.status === 'open').length;
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-gray-800", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ShieldAlert, { className: "h-4 w-4 text-gray-500" }), _jsx("span", { className: "text-sm font-semibold text-gray-200", children: "Alert Queue" }), totalOpen > 0 && (_jsx("span", { className: "inline-flex h-5 min-w-5 items-center justify-center rounded-full\n                             bg-red-500 text-xs font-bold text-white px-1", children: totalOpen > 99 ? '99+' : totalOpen }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [isFetching && (_jsx("div", { className: "h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" })), _jsx("button", { onClick: () => setShowResolved(v => !v), className: clsx('text-xs transition-colors', showResolved ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'), children: showResolved ? 'Hide resolved' : 'Show resolved' })] })] }), dataUpdatedAt > 0 && (_jsx("div", { className: "px-4 py-1.5 border-b border-gray-800/50", children: _jsxs("p", { className: "text-xs text-gray-700", children: ["Updated ", new Date(dataUpdatedAt).toLocaleTimeString([], {
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })] }) })), _jsx("div", { className: "flex-1 overflow-y-auto", children: isLoading ? (_jsx("div", { className: "p-4 space-y-2", children: [...Array(8)].map((_, i) => (_jsx(Skeleton, { className: clsx('h-16 w-full', i % 3 === 0 && 'h-5 mt-4') }, i))) })) : alerts.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-center px-4", children: [_jsx("div", { className: "rounded-full bg-green-500/10 p-4 mb-3", children: _jsx(ShieldAlert, { className: "h-6 w-6 text-green-500/60" }) }), _jsx("p", { className: "text-sm font-medium text-gray-400", children: "Queue is clear" }), _jsx("p", { className: "text-xs text-gray-600 mt-1", children: "No open alerts right now" })] })) : (PRIORITY_ORDER.map(priority => {
                    const items = grouped[priority] ?? [];
                    if (items.length === 0)
                        return null;
                    const isCollapsed = collapsed.has(priority);
                    return (_jsxs("div", { children: [_jsxs("button", { onClick: () => toggleCollapse(priority), className: "w-full flex items-center justify-between px-4 py-2\n                             bg-gray-900/80 hover:bg-gray-800/60 border-b border-gray-800\n                             transition-colors group", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Badge, { variant: priority, size: "xs", children: priority }), _jsx("span", { className: "text-xs font-medium text-gray-400", children: PRIORITY_LABELS[priority] }), _jsxs("span", { className: "text-xs text-gray-600", children: ["(", items.length, ")"] })] }), isCollapsed
                                        ? _jsx(ChevronDown, { className: "h-3.5 w-3.5 text-gray-600" })
                                        : _jsx(ChevronUp, { className: "h-3.5 w-3.5 text-gray-600" })] }), !isCollapsed && items.map(alert => (_jsxs(Link, { to: `/alerts/${alert.id}`, onClick: () => onSelectAlert?.(alert.id), className: clsx('block border-b border-gray-800/60 px-4 py-3 transition-colors', alert.id === selectedId
                                    ? 'bg-blue-500/10 border-l-2 border-l-blue-500'
                                    : 'hover:bg-gray-800/50'), children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: clsx('mt-1 flex-shrink-0 h-1.5 w-1.5 rounded-full', alert.status === 'open' ? 'bg-red-400'
                                                    : alert.status === 'investigating' ? 'bg-yellow-400 animate-pulse'
                                                        : 'bg-green-400') }), _jsx("p", { className: clsx('text-sm leading-snug line-clamp-2 min-w-0', alert.id === selectedId ? 'text-white font-medium' : 'text-gray-300'), children: alert.title })] }), _jsxs("div", { className: "mt-1.5 ml-3.5 flex items-center gap-2 flex-wrap", children: [_jsx(Badge, { variant: alert.severity, size: "xs", children: alert.severity }), alert.mttdSlaBreached && (_jsx("span", { className: "text-xs text-red-400 font-medium", children: "SLA!" })), alert.affectedUserId && (_jsxs("span", { className: "flex items-center gap-1 text-xs text-gray-600", children: [_jsx(User, { className: "h-3 w-3" }), alert.affectedUserId.slice(0, 8), "\u2026"] })), alert.affectedIp && !alert.affectedUserId && (_jsx("span", { className: "flex items-center gap-1 text-xs text-gray-600 font-mono", children: alert.affectedIp })), _jsxs("span", { className: "ml-auto flex items-center gap-1 text-xs text-gray-700", children: [_jsx(Clock, { className: "h-2.5 w-2.5" }), formatRelativeTime(alert.createdAt)] })] }), alert.mitreTechniques?.length > 0 && (_jsxs("div", { className: "mt-1.5 ml-3.5 flex items-center gap-1", children: [_jsx(Tag, { className: "h-3 w-3 text-gray-700 flex-shrink-0" }), _jsx("span", { className: "text-xs text-gray-700 font-mono truncate", children: alert.mitreTechniques.slice(0, 2).join(' · ') })] }))] }, alert.id)))] }, priority));
                })) }), _jsx("div", { className: "border-t border-gray-800 px-4 py-2.5 bg-gray-900/50", children: _jsx("div", { className: "grid grid-cols-3 gap-2 text-center", children: [
                        { label: 'Open', count: alerts.filter(a => a.status === 'open').length, color: 'text-red-400' },
                        { label: 'Active', count: alerts.filter(a => a.status === 'investigating').length, color: 'text-yellow-400' },
                        { label: 'SLA', count: alerts.filter(a => a.mttdSlaBreached).length, color: 'text-orange-400' },
                    ].map(({ label, count, color }) => (_jsxs("div", { children: [_jsx("p", { className: clsx('text-sm font-bold tabular-nums', count > 0 ? color : 'text-gray-600'), children: count }), _jsx("p", { className: "text-xs text-gray-700", children: label })] }, label))) }) })] }));
}
// ── Helper ────────────────────────────────────
function formatRelativeTime(dateStr) {
    const delta = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(delta / 60_000);
    if (mins < 1)
        return 'just now';
    if (mins < 60)
        return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)
        return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
