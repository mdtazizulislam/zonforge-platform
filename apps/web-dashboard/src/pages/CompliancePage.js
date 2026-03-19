import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useAttackCoverage, useDetectionRules, useAuditLog } from '@/hooks/queries';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Badge, Card, Skeleton } from '@/components/shared/ui';
import { ShieldCheck, FileSearch, BookOpen, ExternalLink, CheckCircle2, XCircle, Filter, } from 'lucide-react';
// ─────────────────────────────────────────────
// MITRE ATT&CK TACTICS (ordered by attack lifecycle)
// ─────────────────────────────────────────────
const TACTICS = [
    { id: 'TA0001', name: 'Initial\nAccess', short: 'IA' },
    { id: 'TA0002', name: 'Execution', short: 'EX' },
    { id: 'TA0003', name: 'Persistence', short: 'PS' },
    { id: 'TA0004', name: 'Privilege\nEscalation', short: 'PE' },
    { id: 'TA0005', name: 'Defense\nEvasion', short: 'DE' },
    { id: 'TA0006', name: 'Credential\nAccess', short: 'CA' },
    { id: 'TA0007', name: 'Discovery', short: 'DI' },
    { id: 'TA0008', name: 'Lateral\nMovement', short: 'LM' },
    { id: 'TA0009', name: 'Collection', short: 'CO' },
    { id: 'TA0010', name: 'Exfiltration', short: 'EF' },
    { id: 'TA0011', name: 'C2', short: 'C2' },
    { id: 'TA0040', name: 'Impact', short: 'IM' },
];
// ─────────────────────────────────────────────
// ATT&CK HEATMAP CELL
// ─────────────────────────────────────────────
function HeatmapCell({ tacticId, covered, ruleCount, techniqueId, techniqueName, }) {
    const intensity = ruleCount >= 3 ? 'bg-green-500/80' : ruleCount >= 2 ? 'bg-green-500/50'
        : ruleCount >= 1 ? 'bg-green-500/25' : 'bg-gray-800/60';
    return (_jsx("div", { title: `${techniqueId}: ${techniqueName}\n${ruleCount} rule(s)`, className: clsx('rounded px-1.5 py-1 text-xs font-mono text-center transition-all cursor-default', 'border hover:scale-105', covered
            ? `${intensity} text-green-300 border-green-500/20`
            : 'text-gray-700 border-gray-800/40 hover:border-gray-700'), children: techniqueId.split('.')[0]?.replace('T', '') }));
}
// ─────────────────────────────────────────────
// DETECTION RULES TABLE
// ─────────────────────────────────────────────
function DetectionRulesTable({ rules }) {
    const [filter, setFilter] = useState('all');
    const filtered = rules.filter(r => filter === 'all' ? true
        : filter === 'enabled' ? r.enabled
            : !r.enabled);
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [['all', 'enabled', 'disabled'].map(f => (_jsx("button", { onClick: () => setFilter(f), className: clsx('px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors', filter === f
                            ? 'bg-gray-700 text-gray-200'
                            : 'text-gray-600 hover:text-gray-400'), children: f }, f))), _jsxs("span", { className: "ml-auto text-xs text-gray-600", children: [filtered.length, " rules"] })] }), _jsxs("div", { className: "rounded-xl border border-gray-800 overflow-hidden", children: [_jsxs("div", { className: "grid grid-cols-12 gap-4 px-4 py-2.5 text-xs font-medium\n                        text-gray-500 uppercase tracking-wider bg-gray-800/40", children: [_jsx("div", { className: "col-span-1", children: "Status" }), _jsx("div", { className: "col-span-4", children: "Rule" }), _jsx("div", { className: "col-span-2", children: "Severity" }), _jsx("div", { className: "col-span-3", children: "MITRE" }), _jsx("div", { className: "col-span-2 text-right", children: "Hits" })] }), filtered.length === 0 ? (_jsx("div", { className: "py-12 text-center text-gray-600 text-sm", children: "No rules match the filter" })) : (_jsx("div", { className: "divide-y divide-gray-800/60", children: filtered.map((rule) => (_jsxs("div", { className: "grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-gray-800/30 transition-colors", children: [_jsx("div", { className: "col-span-1", children: rule.enabled
                                        ? _jsx(CheckCircle2, { className: "h-4 w-4 text-green-500/70" })
                                        : _jsx(XCircle, { className: "h-4 w-4 text-gray-700" }) }), _jsxs("div", { className: "col-span-4 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-gray-200 truncate", children: rule.name }), _jsx("p", { className: "text-xs font-mono text-gray-600", children: rule.id })] }), _jsx("div", { className: "col-span-2", children: _jsx(Badge, { variant: rule.severity, size: "xs", children: rule.severity }) }), _jsx("div", { className: "col-span-3", children: _jsx("div", { className: "flex flex-wrap gap-1", children: rule.mitreTechniques?.slice(0, 2).map((t) => (_jsx("span", { className: "text-xs font-mono text-gray-600", children: t }, t))) }) }), _jsx("div", { className: "col-span-2 text-right", children: _jsx("span", { className: clsx('text-sm font-bold tabular-nums', (rule.hitCount ?? 0) > 0 ? 'text-blue-400' : 'text-gray-600'), children: rule.hitCount ?? 0 }) })] }, rule.id))) }))] })] }));
}
// ─────────────────────────────────────────────
// AUDIT LOG TABLE
// ─────────────────────────────────────────────
function AuditLogTable({ entries }) {
    return (_jsxs("div", { className: "rounded-xl border border-gray-800 overflow-hidden", children: [_jsxs("div", { className: "grid grid-cols-12 gap-4 px-4 py-2.5 text-xs font-medium\n                      text-gray-500 uppercase tracking-wider bg-gray-800/40", children: [_jsx("div", { className: "col-span-3", children: "Actor" }), _jsx("div", { className: "col-span-3", children: "Action" }), _jsx("div", { className: "col-span-3", children: "Resource" }), _jsx("div", { className: "col-span-3 text-right", children: "Time" })] }), _jsx("div", { className: "divide-y divide-gray-800/60 max-h-[400px] overflow-y-auto", children: entries.length === 0 ? (_jsx("div", { className: "py-12 text-center text-gray-600 text-sm", children: "No audit events" })) : (entries.map((entry) => (_jsxs("div", { className: "grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-800/30", children: [_jsxs("div", { className: "col-span-3 min-w-0", children: [_jsx("p", { className: "text-xs text-gray-400 truncate", children: entry.actorEmail ?? entry.actorId?.slice(0, 12) ?? 'System' }), _jsx("p", { className: "text-xs text-gray-600 capitalize", children: entry.actorRole ?? '' })] }), _jsx("div", { className: "col-span-3", children: _jsx("p", { className: "text-xs font-mono text-blue-400/80", children: entry.action }) }), _jsxs("div", { className: "col-span-3 min-w-0", children: [_jsx("p", { className: "text-xs text-gray-500 capitalize", children: entry.resourceType }), _jsxs("p", { className: "text-xs text-gray-700 font-mono truncate", children: [entry.resourceId?.slice(0, 12), "\u2026"] })] }), _jsx("div", { className: "col-span-3 text-right", children: _jsx("p", { className: "text-xs text-gray-500", children: new Date(entry.createdAt).toLocaleString() }) })] }, entry.id)))) })] }));
}
// ─────────────────────────────────────────────
// COMPLIANCE PAGE
// ─────────────────────────────────────────────
export default function CompliancePage() {
    const [activeTab, setTab] = useState('coverage');
    const [gapsOnly, setGapsOnly] = useState(false);
    const { data: coverageData, isLoading: covLoading } = useAttackCoverage(gapsOnly);
    const { data: rulesData, isLoading: rulesLoading } = useDetectionRules();
    const { data: auditData, isLoading: auditLoading } = useAuditLog();
    const coverage = coverageData?.data ?? {};
    const rules = rulesData?.data ?? [];
    const auditLog = auditData?.data ?? [];
    // Coverage stats
    const coveredCount = Object.values(coverage).filter((c) => c.covered).length;
    const totalTechniques = Object.keys(coverage).length;
    const coveragePct = totalTechniques > 0
        ? Math.round((coveredCount / totalTechniques) * 100)
        : 0;
    const tabs = [
        { id: 'coverage', label: 'ATT&CK Coverage', icon: ShieldCheck },
        { id: 'rules', label: 'Detection Rules', icon: FileSearch },
        { id: 'audit', label: 'Audit Log', icon: BookOpen },
    ];
    return (_jsx(AppShell, { title: "Compliance & Coverage", children: _jsxs(PageContent, { children: [_jsxs("div", { className: "grid grid-cols-3 gap-4 mb-6", children: [_jsxs(Card, { className: "flex flex-col justify-center gap-1", children: [_jsxs("p", { className: clsx('text-3xl font-bold tabular-nums', coveragePct >= 60 ? 'text-green-400' : coveragePct >= 40 ? 'text-yellow-400' : 'text-red-400'), children: [coveragePct, "%"] }), _jsx("p", { className: "text-sm text-gray-400", children: "ATT&CK Technique Coverage" }), _jsxs("p", { className: "text-xs text-gray-600", children: [coveredCount, " of ", totalTechniques, " techniques"] })] }), _jsxs(Card, { className: "flex flex-col justify-center gap-1", children: [_jsx("p", { className: "text-3xl font-bold text-blue-400 tabular-nums", children: rules.filter((r) => r.enabled).length }), _jsx("p", { className: "text-sm text-gray-400", children: "Active Detection Rules" }), _jsxs("p", { className: "text-xs text-gray-600", children: [rules.length, " total"] })] }), _jsxs(Card, { className: "flex flex-col justify-center gap-1", children: [_jsx("p", { className: "text-3xl font-bold text-gray-300 tabular-nums", children: auditLog.length }), _jsx("p", { className: "text-sm text-gray-400", children: "Audit Events (30 days)" }), _jsxs("p", { className: "text-xs text-gray-600 flex items-center gap-1", children: [_jsx(ShieldCheck, { className: "h-3 w-3 text-green-500" }), "Hash-chained log"] })] })] }), _jsx("div", { className: "flex items-center gap-1 border-b border-gray-800 mb-6", children: tabs.map(tab => (_jsxs("button", { onClick: () => setTab(tab.id), className: clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all', activeTab === tab.id
                            ? 'text-blue-400 border-blue-500'
                            : 'text-gray-500 border-transparent hover:text-gray-300'), children: [_jsx(tab.icon, { className: "h-4 w-4" }), tab.label] }, tab.id))) }), activeTab === 'coverage' && (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("p", { className: "text-sm text-gray-400", children: ["Coverage across MITRE ATT&CK tactics and techniques.", _jsxs("a", { href: "https://attack.mitre.org", target: "_blank", rel: "noopener noreferrer", className: "ml-2 text-blue-400 hover:underline inline-flex items-center gap-1", children: ["MITRE ATT&CK ", _jsx(ExternalLink, { className: "h-3 w-3" })] })] }), _jsxs("button", { onClick: () => setGapsOnly(v => !v), className: clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all', gapsOnly
                                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                        : 'text-gray-500 border-gray-700 hover:border-gray-600'), children: [_jsx(Filter, { className: "h-3 w-3" }), gapsOnly ? 'Showing gaps only' : 'Show gaps only'] })] }), covLoading ? (_jsx(Skeleton, { className: "h-48 w-full" })) : (_jsxs(Card, { children: [_jsx("div", { className: "grid grid-cols-12 gap-2 mb-3", children: TACTICS.map(t => (_jsx("div", { className: "text-center", children: _jsx("div", { className: clsx('text-xs font-bold px-1 py-1.5 rounded-t border-b', Object.values(coverage).some((c) => c.tacticId === t.id && c.covered)
                                                ? 'text-green-400 border-green-500/30 bg-green-500/5'
                                                : 'text-gray-700 border-gray-800 bg-gray-800/40'), children: t.short }) }, t.id))) }), _jsx("div", { className: "grid grid-cols-12 gap-2", children: TACTICS.map(tactic => {
                                        const techniques = Object.entries(coverage).filter(([, v]) => v.tacticId === tactic.id);
                                        return (_jsxs("div", { className: "flex flex-col gap-1", children: [techniques.slice(0, 8).map(([techId, tech]) => (_jsx(HeatmapCell, { tacticId: tactic.id, covered: tech.covered, ruleCount: tech.ruleCount ?? 0, techniqueId: techId, techniqueName: tech.techniqueName }, techId))), techniques.length > 8 && (_jsxs("div", { className: "text-xs text-gray-700 text-center", children: ["+", techniques.length - 8] }))] }, tactic.id));
                                    }) }), _jsxs("div", { className: "mt-4 flex items-center gap-4 text-xs text-gray-600", children: [_jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: "h-3 w-3 rounded bg-green-500/80" }), " 3+ rules"] }), _jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: "h-3 w-3 rounded bg-green-500/40" }), " 1\u20132 rules"] }), _jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: "h-3 w-3 rounded bg-gray-800/60 border border-gray-700" }), " No coverage"] })] })] }))] })), activeTab === 'rules' && (rulesLoading
                    ? _jsx(Skeleton, { className: "h-64 w-full" })
                    : _jsx(DetectionRulesTable, { rules: rules })), activeTab === 'audit' && (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-4 p-4 rounded-xl bg-green-500/5\n                            border border-green-500/15", children: [_jsx(ShieldCheck, { className: "h-4 w-4 text-green-400 flex-shrink-0" }), _jsx("p", { className: "text-xs text-gray-400", children: "Audit log entries are cryptographically hash-chained (SHA-256). Any tampering is detectable by verifying the hash chain." })] }), auditLoading
                            ? _jsx(Skeleton, { className: "h-64 w-full" })
                            : _jsx(AuditLogTable, { entries: auditLog })] }))] }) }));
}
