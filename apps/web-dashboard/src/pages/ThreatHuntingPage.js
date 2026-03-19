import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card, Skeleton } from '@/components/shared/ui';
import { Search, Play, Save, BookOpen, Target, Clock, AlertTriangle, TrendingUp, Shield, Zap, Check, X, RefreshCw, Copy, Terminal, ArrowUpRight, } from 'lucide-react';
// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────
const H = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const CAT_META = {
    credential: { label: 'Credential Attacks', color: 'text-red-400 bg-red-500/10', icon: Shield },
    lateral: { label: 'Lateral Movement', color: 'text-orange-400 bg-orange-500/10', icon: ArrowUpRight },
    exfiltration: { label: 'Exfiltration', color: 'text-yellow-400 bg-yellow-500/10', icon: TrendingUp },
    persistence: { label: 'Persistence', color: 'text-purple-400 bg-purple-500/10', icon: Target },
    execution: { label: 'Execution', color: 'text-pink-400 bg-pink-500/10', icon: Zap },
    discovery: { label: 'Discovery', color: 'text-blue-400 bg-blue-500/10', icon: Search },
};
const SEV_COLORS = {
    critical: 'text-red-400 bg-red-500/10',
    high: 'text-orange-400 bg-orange-500/10',
    medium: 'text-yellow-400 bg-yellow-500/10',
    low: 'text-blue-400 bg-blue-500/10',
};
function formatMs(ms) {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
// ─────────────────────────────────────────────
// QUERY EDITOR
// ─────────────────────────────────────────────
function QueryEditor({ value, onChange, onRun, loading }) {
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-b border-gray-800\n                      bg-gray-800/40 rounded-t-xl", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Terminal, { className: "h-3.5 w-3.5 text-gray-500" }), _jsx("span", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "ClickHouse SQL" }), _jsx("span", { className: "text-xs text-gray-700", children: "\u00B7 read-only \u00B7 tenant-isolated" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-xs text-gray-600 font-mono", children: [value.length, " chars"] }), _jsx("button", { onClick: onRun, disabled: loading || !value.trim(), className: clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all', 'bg-blue-600 text-white hover:bg-blue-500', (loading || !value.trim()) && 'opacity-50 cursor-not-allowed'), children: loading
                                    ? _jsxs(_Fragment, { children: [_jsx(RefreshCw, { className: "h-3 w-3 animate-spin" }), " Running\u2026"] })
                                    : _jsxs(_Fragment, { children: [_jsx(Play, { className: "h-3 w-3" }), " Run Hunt"] }) })] })] }), _jsx("textarea", { value: value, onChange: e => onChange(e.target.value), spellCheck: false, className: "flex-1 w-full px-4 py-3 bg-gray-950 text-gray-300 text-xs font-mono\n                   leading-relaxed resize-none focus:outline-none rounded-b-xl\n                   scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800", placeholder: "-- Write a ClickHouse SQL query\n-- Required: WHERE tenant_id = {tenant_id:UUID}\n-- Use {param_name:Type} for parameters\n\nSELECT\n  actor_user_id,\n  count() AS events,\n  max(event_time) AS last_seen\nFROM events\nWHERE tenant_id = {tenant_id:UUID}\n  AND event_time >= now() - INTERVAL 24 HOUR\nGROUP BY actor_user_id\nORDER BY events DESC\nLIMIT 100", style: { minHeight: '200px' } })] }));
}
// ─────────────────────────────────────────────
// RESULTS TABLE
// ─────────────────────────────────────────────
function ResultsTable({ result }) {
    const [copied, setCopied] = useState(false);
    function copyAsCsv() {
        const header = result.columns.join(',');
        const rows = result.rows.map((r) => result.columns.map((c) => {
            const v = String(r[c] ?? '');
            return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(','));
        navigator.clipboard.writeText([header, ...rows].join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-2.5 bg-gray-800/30\n                      border-b border-gray-800 rounded-t-xl", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: "h-2 w-2 rounded-full bg-green-400" }), _jsxs("span", { className: "text-xs font-medium text-gray-300", children: [result.rowCount.toLocaleString(), " rows"] })] }), result.truncated && (_jsxs("span", { className: "text-xs text-yellow-400 flex items-center gap-1", children: [_jsx(AlertTriangle, { className: "h-3 w-3" }), "Truncated at ", result.rowCount.toLocaleString()] })), _jsxs("span", { className: "text-xs text-gray-600 flex items-center gap-1", children: [_jsx(Clock, { className: "h-3 w-3" }), formatMs(result.executionMs)] }), _jsxs("span", { className: "text-xs font-mono text-gray-700", children: [result.queryId?.slice(0, 8), "\u2026"] })] }), _jsxs("button", { onClick: copyAsCsv, className: "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-gray-500\n                     hover:text-gray-300 border border-gray-700 hover:border-gray-600 transition-colors", children: [copied ? _jsx(Check, { className: "h-3 w-3 text-green-400" }) : _jsx(Copy, { className: "h-3 w-3" }), copied ? 'Copied!' : 'Copy CSV'] })] }), result.rowCount === 0 ? (_jsx("div", { className: "flex-1 flex items-center justify-center", children: _jsx("p", { className: "text-sm text-gray-500", children: "No results found. Try adjusting your parameters." }) })) : (_jsx("div", { className: "flex-1 overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800", children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { className: "sticky top-0 z-10", children: _jsx("tr", { className: "bg-gray-900 border-b border-gray-800", children: result.columns.map((col) => (_jsx("th", { className: "px-4 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wider\n                               whitespace-nowrap border-r border-gray-800 last:border-r-0", children: col }, col))) }) }), _jsx("tbody", { children: result.rows.map((row, i) => (_jsx("tr", { className: "border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors", children: result.columns.map((col) => (_jsx("td", { className: "px-4 py-2 text-gray-300 font-mono whitespace-nowrap\n                                 border-r border-gray-800/40 last:border-r-0 max-w-xs truncate", children: row[col] === null || row[col] === undefined ? (_jsx("span", { className: "text-gray-700", children: "null" })) : typeof row[col] === 'object' ? (_jsx("span", { className: "text-blue-400 text-xs", children: JSON.stringify(row[col]) })) : (String(row[col])) }, col))) }, i))) })] }) }))] }));
}
// ─────────────────────────────────────────────
// TEMPLATE CARD
// ─────────────────────────────────────────────
function TemplateCard({ template, onLoad }) {
    const catMeta = CAT_META[template.category] ?? CAT_META['discovery'];
    const Icon = catMeta.icon;
    return (_jsxs("button", { onClick: () => onLoad(template), className: "w-full text-left p-4 rounded-xl border border-gray-800\n                 hover:border-gray-700 hover:bg-gray-800/30 transition-all group", children: [_jsxs("div", { className: "flex items-start justify-between gap-2 mb-2", children: [_jsxs("span", { className: clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium', catMeta.color), children: [_jsx(Icon, { className: "h-3 w-3" }), catMeta.label] }), _jsx("span", { className: clsx('px-1.5 py-0.5 rounded text-xs font-bold capitalize', SEV_COLORS[template.severity]), children: template.severity })] }), _jsx("h4", { className: "text-sm font-semibold text-gray-200 mb-1 group-hover:text-white transition-colors", children: template.name }), _jsx("p", { className: "text-xs text-gray-500 leading-relaxed line-clamp-2 mb-2", children: template.description }), _jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "text-xs text-gray-700 font-mono", children: template.id }), template.mitreTechniques?.slice(0, 2).map((t) => (_jsx("span", { className: "text-xs font-mono text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded", children: t }, t))), (template.mitreTechniques?.length ?? 0) > 2 && (_jsxs("span", { className: "text-xs text-gray-700", children: ["+", template.mitreTechniques.length - 2] }))] })] }));
}
// ─────────────────────────────────────────────
// IOC PIVOT PANEL
// ─────────────────────────────────────────────
function IocPivotPanel({ onResult }) {
    const [type, setType] = useState('ip');
    const [value, setValue] = useState('');
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(false);
    async function runPivot() {
        if (!value.trim())
            return;
        setLoading(true);
        try {
            const r = await fetch('/api/v1/hunt/pivot', {
                method: 'POST', headers: H(),
                body: JSON.stringify({ type, value: value.trim(), lookbackDays: days }),
            });
            const data = await r.json();
            if (data.success)
                onResult(data.data);
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "grid grid-cols-4 gap-1", children: ['ip', 'user', 'domain', 'hash'].map(t => (_jsx("button", { onClick: () => setType(t), className: clsx('py-1.5 rounded-lg text-xs font-medium capitalize transition-colors', type === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'), children: t }, t))) }), _jsx("input", { type: "text", value: value, onChange: e => setValue(e.target.value), onKeyDown: e => e.key === 'Enter' && runPivot(), placeholder: type === 'ip' ? '45.33.32.156' :
                    type === 'user' ? 'alice@acme.com' :
                        type === 'domain' ? 'evil-c2.com' :
                            'sha256:abc123…', className: "w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800\n                   text-sm text-gray-200 placeholder-gray-600 font-mono\n                   focus:outline-none focus:border-blue-500" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-xs text-gray-600 flex-shrink-0", children: "Lookback:" }), _jsx("select", { value: days, onChange: e => setDays(Number(e.target.value)), className: "flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700\n                     text-xs text-gray-300 focus:outline-none focus:border-blue-500", children: [7, 14, 30, 60, 90].map(d => (_jsxs("option", { value: d, children: [d, " days"] }, d))) }), _jsxs("button", { onClick: runPivot, disabled: loading || !value.trim(), className: clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all', 'bg-orange-600 text-white hover:bg-orange-500', (loading || !value.trim()) && 'opacity-50 cursor-not-allowed'), children: [loading ? _jsx(RefreshCw, { className: "h-3 w-3 animate-spin" }) : _jsx(Target, { className: "h-3 w-3" }), "Pivot"] })] })] }));
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function ThreatHuntingPage() {
    const [query, setQuery] = useState('');
    const [activeView, setView] = useState('editor');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [running, setRunning] = useState(false);
    const [activePanel, setPanel] = useState('templates');
    const [catFilter, setCatFilter] = useState('all');
    const [saveModal, setSaveModal] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [promoteModal, setPromote] = useState(null);
    const qc = useQueryClient();
    const { data: templatesData } = useQuery({
        queryKey: ['hunt-templates', catFilter],
        queryFn: () => fetch(`/api/v1/hunt/templates${catFilter !== 'all' ? `?category=${catFilter}` : ''}`, { headers: H() }).then(r => r.json()),
        staleTime: Infinity,
    });
    const { data: savedData, isLoading: savedLoading } = useQuery({
        queryKey: ['hunt-saved'],
        queryFn: () => fetch('/api/v1/hunt/saved', { headers: H() }).then(r => r.json()),
        staleTime: 60_000,
        enabled: activePanel === 'saved',
    });
    const templates = templatesData?.data?.templates ?? [];
    const saved = savedData?.data ?? [];
    const categories = ['all', ...(templatesData?.data?.categories ?? [])];
    function loadTemplate(t) {
        setQuery(t.query);
        setPanel('templates');
        setResult(null);
        setError(null);
    }
    async function runQuery() {
        if (!query.trim())
            return;
        setRunning(true);
        setError(null);
        try {
            const r = await fetch('/api/v1/hunt/execute', {
                method: 'POST', headers: H(),
                body: JSON.stringify({ query, parameters: {} }),
            });
            const data = await r.json();
            if (data.success) {
                setResult(data.data);
            }
            else {
                setError(data.error?.message ?? 'Query failed');
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        }
        finally {
            setRunning(false);
        }
    }
    async function saveHunt() {
        if (!saveName.trim() || !query.trim())
            return;
        await fetch('/api/v1/hunt/saved', {
            method: 'POST', headers: H(),
            body: JSON.stringify({ name: saveName, description: '', query, parameters: {} }),
        });
        setSaveModal(false);
        setSaveName('');
        qc.invalidateQueries({ queryKey: ['hunt-saved'] });
    }
    async function deleteHunt(id) {
        await fetch(`/api/v1/hunt/saved/${id}`, { method: 'DELETE', headers: H() });
        qc.invalidateQueries({ queryKey: ['hunt-saved'] });
    }
    return (_jsx(AppShell, { title: "Threat Hunting", actions: _jsxs("div", { className: "flex items-center gap-2", children: [query && (_jsx(Button, { variant: "outline", size: "sm", icon: Save, onClick: () => setSaveModal(true), children: "Save Hunt" })), result && (_jsx(Button, { variant: "outline", size: "sm", icon: ArrowUpRight, onClick: () => setPromote(query), children: "Promote to Rule" }))] }), children: _jsxs(PageContent, { className: "h-full", children: [_jsxs("div", { className: "grid grid-cols-12 gap-4 h-full", style: { minHeight: 'calc(100vh - 130px)' }, children: [_jsxs("div", { className: "col-span-3 flex flex-col gap-3", children: [_jsx("div", { className: "flex gap-1 p-1 rounded-xl bg-gray-900 border border-gray-800", children: [
                                        { id: 'templates', label: 'Templates', icon: BookOpen },
                                        { id: 'saved', label: 'Saved', icon: Save },
                                        { id: 'pivot', label: 'IOC Pivot', icon: Target },
                                    ].map(p => (_jsxs("button", { onClick: () => setPanel(p.id), className: clsx('flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all', activePanel === p.id ? 'bg-gray-800 text-gray-200 shadow' : 'text-gray-600 hover:text-gray-400'), children: [_jsx(p.icon, { className: "h-3 w-3" }), p.label] }, p.id))) }), activePanel === 'templates' && (_jsxs("div", { className: "flex flex-col gap-2 flex-1 min-h-0", children: [_jsx("div", { className: "flex gap-1 flex-wrap", children: categories.map(cat => (_jsx("button", { onClick: () => setCatFilter(cat), className: clsx('px-2 py-1 rounded text-xs font-medium capitalize transition-colors', catFilter === cat ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'), children: cat }, cat))) }), _jsx("div", { className: "flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800", children: templates.length === 0
                                                ? _jsx("div", { className: "text-center py-8 text-xs text-gray-600", children: "Loading templates\u2026" })
                                                : templates.map((t) => (_jsx(TemplateCard, { template: t, onLoad: loadTemplate }, t.id))) })] })), activePanel === 'saved' && (_jsx("div", { className: "flex-1 overflow-y-auto space-y-2 min-h-0", children: savedLoading ? (_jsx("div", { className: "space-y-2", children: [...Array(4)].map((_, i) => _jsx(Skeleton, { className: "h-16 w-full" }, i)) })) : saved.length === 0 ? (_jsxs("div", { className: "py-8 text-center", children: [_jsx(Save, { className: "h-8 w-8 text-gray-700 mx-auto mb-2" }), _jsx("p", { className: "text-xs text-gray-600", children: "No saved hunts yet" })] })) : (saved.map((h) => (_jsx("div", { className: "p-3 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors", children: _jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("button", { onClick: () => { setQuery(h.query); setResult(null); setError(null); }, className: "text-left flex-1 min-w-0", children: [_jsx("p", { className: "text-xs font-medium text-gray-300 truncate", children: h.name }), _jsxs("p", { className: "text-xs text-gray-600 mt-0.5", children: ["Ran ", h.runCount, "\u00D7 \u00B7 ", new Date(h.createdAt).toLocaleDateString()] })] }), _jsx("button", { onClick: () => deleteHunt(h.id), className: "text-gray-700 hover:text-red-400 transition-colors flex-shrink-0", children: _jsx(X, { className: "h-3.5 w-3.5" }) })] }) }, h.id)))) })), activePanel === 'pivot' && (_jsx(IocPivotPanel, { onResult: (r) => { setResult(r); setError(null); } }))] }), _jsxs("div", { className: "col-span-9 flex flex-col gap-4 min-h-0", children: [_jsx(Card, { padding: "none", className: "flex-shrink-0", style: { minHeight: '240px', maxHeight: '280px' }, children: _jsx(QueryEditor, { value: query, onChange: setQuery, onRun: runQuery, loading: running }) }), error && (_jsxs("div", { className: "flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/20", children: [_jsx(X, { className: "h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-red-400 mb-1", children: "Query Error" }), _jsx("p", { className: "text-xs text-red-400/80 font-mono leading-relaxed", children: error })] })] })), result && !error && (_jsx(Card, { padding: "none", className: "flex-1 min-h-0 flex flex-col overflow-hidden", children: _jsx(ResultsTable, { result: result }) })), !result && !error && !running && (_jsx(Card, { className: "flex-1 flex items-center justify-center", children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "rounded-2xl bg-blue-500/10 p-5 w-16 h-16 flex items-center justify-center mx-auto mb-4", children: _jsx(Search, { className: "h-8 w-8 text-blue-400" }) }), _jsx("h3", { className: "text-base font-semibold text-gray-200 mb-2", children: "Start Hunting" }), _jsx("p", { className: "text-sm text-gray-500 max-w-sm mb-4 leading-relaxed", children: "Select a template from the left to load a pre-built query, or write your own ClickHouse SQL." }), _jsx("div", { className: "grid grid-cols-3 gap-2 text-xs text-gray-600", children: ['20 hunt templates', 'IOC pivot search', 'Hunt → rule promotion'].map(f => (_jsxs("div", { className: "flex items-center gap-1.5 p-2 rounded-lg bg-gray-800/40", children: [_jsx(Check, { className: "h-3 w-3 text-green-500 flex-shrink-0" }), f] }, f))) })] }) })), running && (_jsx(Card, { className: "flex-1 flex items-center justify-center", children: _jsxs("div", { className: "text-center", children: [_jsx(RefreshCw, { className: "h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" }), _jsx("p", { className: "text-sm text-gray-400", children: "Scanning events\u2026" }), _jsx("p", { className: "text-xs text-gray-600 mt-1", children: "ClickHouse query executing" })] }) }))] })] }), saveModal && (_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-gray-950/80 backdrop-blur-sm", onClick: () => setSaveModal(false) }), _jsxs(Card, { className: "relative w-full max-w-md mx-4 z-10", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h3", { className: "text-base font-bold text-gray-100", children: "Save Hunt" }), _jsx("button", { onClick: () => setSaveModal(false), className: "text-gray-500 hover:text-gray-300", children: "\u2715" })] }), _jsx("input", { type: "text", value: saveName, onChange: e => setSaveName(e.target.value), placeholder: "Hunt name\u2026", className: "w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800\n                           text-sm text-gray-200 placeholder-gray-600 mb-4\n                           focus:outline-none focus:border-blue-500", onKeyDown: e => e.key === 'Enter' && saveHunt() }), _jsxs("div", { className: "flex gap-3 justify-end", children: [_jsx(Button, { variant: "ghost", onClick: () => setSaveModal(false), children: "Cancel" }), _jsx(Button, { variant: "primary", icon: Save, onClick: saveHunt, disabled: !saveName.trim(), children: "Save" })] })] })] })), promoteModal && (_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-gray-950/80 backdrop-blur-sm", onClick: () => setPromote(null) }), _jsxs(Card, { className: "relative w-full max-w-md mx-4 z-10", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h3", { className: "text-base font-bold text-gray-100", children: "Promote to Detection Rule" }), _jsx("button", { onClick: () => setPromote(null), className: "text-gray-500 hover:text-gray-300", children: "\u2715" })] }), _jsx("p", { className: "text-xs text-gray-500 mb-4 leading-relaxed", children: "This query will be saved as a custom detection rule that runs automatically on every new event batch." }), _jsxs("div", { className: "space-y-3 mb-5", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs text-gray-500 uppercase tracking-wider", children: "Rule Name" }), _jsx("input", { type: "text", placeholder: "e.g. Custom Mass Download Detection", className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800\n                               text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs text-gray-500 uppercase tracking-wider", children: "Severity" }), _jsx("div", { className: "mt-2 flex gap-2", children: ['critical', 'high', 'medium', 'low'].map(s => (_jsx("button", { className: "px-3 py-1.5 rounded-lg border border-gray-700 text-xs capitalize text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors", children: s }, s))) })] })] }), _jsxs("div", { className: "flex gap-3 justify-end", children: [_jsx(Button, { variant: "ghost", onClick: () => setPromote(null), children: "Cancel" }), _jsx(Button, { variant: "primary", icon: ArrowUpRight, onClick: () => setPromote(null), children: "Promote to Rule" })] })] })] }))] }) }));
}
