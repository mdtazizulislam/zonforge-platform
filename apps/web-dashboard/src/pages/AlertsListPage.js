import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAlerts, useUpdateAlertStatus } from '@/hooks/queries';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { useUiStore } from '@/stores/auth.store';
import { ShieldAlert, Filter, RefreshCw, ArrowRight, Tag, } from 'lucide-react';
const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low'];
const STATUS_OPTIONS = ['open', 'investigating', 'resolved', 'false_positive', 'suppressed'];
const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'P4'];
function Badge({ children, color }) {
    return (_jsx("span", { className: clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', color), children: children }));
}
function severityColor(sev) {
    return {
        critical: 'bg-red-500/15 text-red-400',
        high: 'bg-orange-500/15 text-orange-400',
        medium: 'bg-yellow-500/15 text-yellow-400',
        low: 'bg-blue-500/15 text-blue-400',
        info: 'bg-gray-700 text-gray-400',
    }[sev] ?? 'bg-gray-700 text-gray-400';
}
function statusColor(status) {
    return {
        open: 'bg-red-500/10 text-red-400',
        investigating: 'bg-yellow-500/10 text-yellow-400',
        resolved: 'bg-green-500/10 text-green-400',
        false_positive: 'bg-gray-700 text-gray-500',
        suppressed: 'bg-gray-700 text-gray-500',
    }[status] ?? 'bg-gray-700 text-gray-400';
}
function priorityDot(p) {
    return { P1: 'bg-red-500', P2: 'bg-orange-500', P3: 'bg-yellow-500', P4: 'bg-blue-500' }[p] ?? 'bg-gray-500';
}
export default function AlertsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { alertFilters, setAlertFilter, clearAlertFilters } = useUiStore();
    // Merge URL params with store filters
    const urlPriority = searchParams.get('priority');
    const effectiveFilters = {
        ...alertFilters,
        priority: urlPriority ? [urlPriority] : alertFilters.priority,
    };
    const { data, isLoading, refetch, isFetching } = useAlerts({
        severity: effectiveFilters.severity,
        status: effectiveFilters.status,
        priority: effectiveFilters.priority,
        limit: 100,
    });
    const { mutate: updateStatus, isPending: updating } = useUpdateAlertStatus();
    const alerts = data?.data ?? [];
    // Filter toggle helpers
    function toggleFilter(key, value) {
        const current = key === 'priority' ? effectiveFilters.priority : alertFilters[key];
        const next = current.includes(value)
            ? current.filter(v => v !== value)
            : [...current, value];
        if (key === 'priority') {
            setSearchParams(next.length ? { priority: next[0] } : {});
        }
        else {
            setAlertFilter(key, next);
        }
    }
    const activeFilterCount = effectiveFilters.severity.length +
        effectiveFilters.priority.length +
        (effectiveFilters.status.length > 0 &&
            !(effectiveFilters.status.length === 2 &&
                effectiveFilters.status.includes('open') &&
                effectiveFilters.status.includes('investigating'))
            ? effectiveFilters.status.length : 0);
    return (_jsx(AppShell, { title: "Alert Center", actions: _jsxs("button", { onClick: () => refetch(), disabled: isFetching, className: "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm\n                     text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors", children: [_jsx(RefreshCw, { className: clsx('h-3.5 w-3.5', isFetching && 'animate-spin') }), "Refresh"] }), children: _jsxs(PageContent, { children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3 mb-6 p-4 rounded-xl\n                        border border-gray-800 bg-gray-900", children: [_jsxs("div", { className: "flex items-center gap-2 text-sm text-gray-400", children: [_jsx(Filter, { className: "h-4 w-4" }), _jsx("span", { className: "font-medium", children: "Filters" }), activeFilterCount > 0 && (_jsx("span", { className: "inline-flex h-5 w-5 items-center justify-center rounded-full\n                               bg-blue-500 text-xs text-white font-bold", children: activeFilterCount }))] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("div", { className: "flex items-center gap-1", children: SEVERITY_OPTIONS.map(sev => (_jsx("button", { onClick: () => toggleFilter('severity', sev), className: clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-all', effectiveFilters.severity.includes(sev)
                                            ? `${severityColor(sev)} border-transparent`
                                            : 'text-gray-500 border-gray-700 hover:border-gray-600'), children: sev }, sev))) }), _jsx("div", { className: "w-px h-5 bg-gray-700 self-center" }), _jsx("div", { className: "flex items-center gap-1", children: PRIORITY_OPTIONS.map(p => (_jsxs("button", { onClick: () => toggleFilter('priority', p), className: clsx('flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all', effectiveFilters.priority.includes(p)
                                            ? 'bg-gray-700 text-white border-gray-600'
                                            : 'text-gray-500 border-gray-700 hover:border-gray-600'), children: [_jsx("span", { className: clsx('h-1.5 w-1.5 rounded-full', priorityDot(p)) }), p] }, p))) }), _jsx("div", { className: "w-px h-5 bg-gray-700 self-center" }), _jsx("div", { className: "flex items-center gap-1", children: STATUS_OPTIONS.map(s => (_jsx("button", { onClick: () => toggleFilter('status', s), className: clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-all capitalize', effectiveFilters.status.includes(s)
                                            ? `${statusColor(s)} border-transparent`
                                            : 'text-gray-500 border-gray-700 hover:border-gray-600'), children: s.replace('_', ' ') }, s))) })] }), activeFilterCount > 0 && (_jsx("button", { onClick: () => { clearAlertFilters(); setSearchParams({}); }, className: "ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors", children: "Clear all" }))] }), _jsx("div", { className: "flex items-center justify-between mb-3", children: _jsx("p", { className: "text-sm text-gray-500", children: isLoading ? 'Loading…' : `${alerts.length} alerts` }) }), _jsx("div", { className: "rounded-xl border border-gray-800 bg-gray-900 overflow-hidden", children: isLoading ? (_jsx("div", { className: "divide-y divide-gray-800", children: [...Array(6)].map((_, i) => (_jsxs("div", { className: "flex items-center gap-4 p-4", children: [_jsx("div", { className: "h-2 w-2 rounded-full bg-gray-800 animate-pulse flex-shrink-0" }), _jsxs("div", { className: "flex-1 space-y-2", children: [_jsx("div", { className: "h-4 w-3/4 rounded bg-gray-800 animate-pulse" }), _jsx("div", { className: "h-3 w-1/2 rounded bg-gray-800 animate-pulse" })] }), _jsx("div", { className: "h-5 w-16 rounded-full bg-gray-800 animate-pulse" })] }, i))) })) : alerts.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-center", children: [_jsx(ShieldAlert, { className: "h-10 w-10 text-gray-700 mb-3" }), _jsx("p", { className: "text-gray-400 font-medium", children: "No alerts match the current filters" }), _jsx("p", { className: "text-sm text-gray-600 mt-1", children: "Try adjusting filters or refreshing" })] })) : (_jsxs("div", { className: "divide-y divide-gray-800", children: [_jsxs("div", { className: "grid grid-cols-12 gap-4 px-4 py-2.5 text-xs font-medium\n                              text-gray-500 uppercase tracking-wider bg-gray-800/40", children: [_jsx("div", { className: "col-span-1 flex items-center gap-1", children: "Pri" }), _jsx("div", { className: "col-span-5", children: "Title" }), _jsx("div", { className: "col-span-2", children: "Severity" }), _jsx("div", { className: "col-span-2", children: "Status" }), _jsx("div", { className: "col-span-2 text-right", children: "Time" })] }), alerts.map((alert) => (_jsxs(Link, { to: `/alerts/${alert.id}`, className: "grid grid-cols-12 gap-4 px-4 py-3.5 items-center\n                             hover:bg-gray-800/50 transition-colors group", children: [_jsxs("div", { className: "col-span-1 flex items-center", children: [_jsx("div", { className: clsx('h-2 w-2 rounded-full', priorityDot(alert.priority)) }), _jsx("span", { className: "ml-2 text-xs text-gray-500", children: alert.priority })] }), _jsxs("div", { className: "col-span-5 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-gray-200 truncate\n                                  group-hover:text-white transition-colors", children: alert.title }), alert.mitreTechniques?.length > 0 && (_jsxs("div", { className: "flex items-center gap-1.5 mt-0.5", children: [_jsx(Tag, { className: "h-3 w-3 text-gray-600" }), _jsx("span", { className: "text-xs text-gray-600 font-mono", children: alert.mitreTechniques.slice(0, 2).join(' · ') })] }))] }), _jsxs("div", { className: "col-span-2", children: [_jsx(Badge, { color: severityColor(alert.severity), children: alert.severity }), alert.mttdSlaBreached && (_jsx("span", { className: "ml-1.5 text-xs text-red-500 font-medium", children: "SLA!" }))] }), _jsx("div", { className: "col-span-2", children: _jsx(Badge, { color: statusColor(alert.status), children: alert.status.replace('_', ' ') }) }), _jsxs("div", { className: "col-span-2 flex items-center justify-end gap-1.5", children: [_jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-xs text-gray-400", children: new Date(alert.createdAt).toLocaleDateString() }), _jsx("p", { className: "text-xs text-gray-600", children: new Date(alert.createdAt).toLocaleTimeString([], {
                                                            hour: '2-digit', minute: '2-digit',
                                                        }) })] }), _jsx(ArrowRight, { className: "h-3.5 w-3.5 text-gray-600\n                                          group-hover:text-gray-400 transition-colors" })] })] }, alert.id)))] })) })] }) }));
}
