import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';
import { useRiskUser, useAlerts } from '@/hooks/queries';
import { Badge, Skeleton } from '@/components/shared/ui';
import { Tag, ExternalLink, User, ChevronRight, Activity, Globe, } from 'lucide-react';
// ─────────────────────────────────────────────
// MITRE ATT&CK MAP
// ─────────────────────────────────────────────
const TACTIC_NAMES = {
    TA0001: 'Initial Access',
    TA0002: 'Execution',
    TA0003: 'Persistence',
    TA0004: 'Privilege Escalation',
    TA0005: 'Defense Evasion',
    TA0006: 'Credential Access',
    TA0007: 'Discovery',
    TA0008: 'Lateral Movement',
    TA0009: 'Collection',
    TA0010: 'Exfiltration',
    TA0011: 'Command & Control',
    TA0040: 'Impact',
};
const TACTIC_COLORS = {
    TA0001: 'bg-red-500/15 text-red-400 border-red-500/20',
    TA0002: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    TA0003: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    TA0004: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    TA0005: 'bg-lime-500/15 text-lime-400 border-lime-500/20',
    TA0006: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
    TA0007: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    TA0008: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    TA0009: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    TA0010: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    TA0011: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20',
    TA0040: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
};
// ─────────────────────────────────────────────
// RISK SCORE RING
// ─────────────────────────────────────────────
function RiskRing({ score, label }) {
    const r = 22;
    const circumference = 2 * Math.PI * r;
    const fraction = score / 100;
    const strokeDash = fraction * circumference;
    const color = score >= 70 ? '#ef4444'
        : score >= 50 ? '#f97316'
            : score >= 25 ? '#eab308'
                : '#22c55e';
    return (_jsxs("div", { className: "flex flex-col items-center", children: [_jsxs("div", { className: "relative", children: [_jsxs("svg", { width: "60", height: "60", viewBox: "0 0 60 60", children: [_jsx("circle", { cx: "30", cy: "30", r: r, fill: "none", stroke: "#1f2937", strokeWidth: "5" }), _jsx("circle", { cx: "30", cy: "30", r: r, fill: "none", stroke: color, strokeWidth: "5", strokeLinecap: "round", strokeDasharray: `${strokeDash} ${circumference}`, transform: "rotate(-90 30 30)", style: { transition: 'stroke-dasharray 0.6s ease' } })] }), _jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: _jsx("span", { className: "text-sm font-bold text-gray-200", children: score }) })] }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: label })] }));
}
export function AlertContextPanel({ alert }) {
    // Fetch entity risk score
    const { data: userRiskData, isLoading: riskLoading } = useRiskUser(alert.affectedUserId ?? '');
    const userRisk = userRiskData?.data;
    // Fetch related alerts (same user or IP in last 30 days)
    const { data: relatedData } = useAlerts({
        status: ['open', 'investigating', 'resolved'],
        limit: 20,
    });
    const relatedAlerts = (relatedData?.data ?? [])
        .filter((a) => a.id !== alert.id && ((alert.affectedUserId && a.affectedUserId === alert.affectedUserId) ||
        (alert.affectedIp && a.affectedIp === alert.affectedIp)))
        .slice(0, 5);
    return (_jsx("div", { className: "flex flex-col h-full overflow-y-auto", children: _jsxs("div", { className: "p-4 space-y-4", children: [(alert.mitreTactics?.length > 0 || alert.mitreTechniques?.length > 0) && (_jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(Tag, { className: "h-4 w-4 text-gray-500" }), _jsx("h3", { className: "text-xs font-semibold text-gray-300 uppercase tracking-wider", children: "MITRE ATT&CK" })] }), alert.mitreTactics?.length > 0 && (_jsxs("div", { className: "mb-3", children: [_jsx("p", { className: "text-xs text-gray-600 mb-2", children: "Tactics" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: alert.mitreTactics.map(t => (_jsxs("a", { href: `https://attack.mitre.org/tactics/${t}/`, target: "_blank", rel: "noopener noreferrer", className: clsx('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs', 'font-mono font-medium border transition-opacity hover:opacity-80', TACTIC_COLORS[t] ?? 'bg-gray-700 text-gray-400 border-gray-600'), children: [t, _jsx("span", { className: "text-xs opacity-60 ml-0.5", children: TACTIC_NAMES[t] ? `· ${TACTIC_NAMES[t]}` : '' }), _jsx(ExternalLink, { className: "h-2.5 w-2.5 opacity-50 flex-shrink-0" })] }, t))) })] })), alert.mitreTechniques?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-600 mb-2", children: "Techniques" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: alert.mitreTechniques.map(t => (_jsxs("a", { href: `https://attack.mitre.org/techniques/${t.replace('.', '/')}/`, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1 px-2 py-1 rounded text-xs\n                                 font-mono bg-gray-800 text-gray-400 border border-gray-700\n                                 hover:text-gray-200 transition-colors", children: [t, _jsx(ExternalLink, { className: "h-2.5 w-2.5 opacity-40" })] }, t))) })] }))] })), alert.affectedUserId && (_jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(User, { className: "h-4 w-4 text-gray-500" }), _jsx("h3", { className: "text-xs font-semibold text-gray-300 uppercase tracking-wider", children: "Affected User Risk" })] }), riskLoading ? (_jsxs("div", { className: "flex items-center gap-4", children: [_jsx(Skeleton, { className: "h-14 w-14 rounded-full" }), _jsxs("div", { className: "flex-1 space-y-2", children: [_jsx(Skeleton, { className: "h-3 w-24" }), _jsx(Skeleton, { className: "h-3 w-16" })] })] })) : userRisk ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx(RiskRing, { score: userRisk.score, label: "Risk" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Badge, { variant: userRisk.severity, size: "xs", children: userRisk.severity }), _jsxs("span", { className: "text-xs text-gray-500 capitalize", children: [userRisk.confidenceBand, " confidence"] })] }), _jsxs("p", { className: "text-xs text-gray-600 font-mono mt-1 truncate", children: [alert.affectedUserId.slice(0, 24), "\u2026"] }), _jsxs(Link, { to: `/risk?userId=${alert.affectedUserId}`, className: "text-xs text-blue-400 hover:underline mt-1 inline-flex items-center gap-1", children: ["Full profile ", _jsx(ChevronRight, { className: "h-3 w-3" })] })] })] }), userRisk.contributingSignals?.length > 0 && (_jsxs("div", { className: "mt-3 space-y-1.5", children: [_jsx("p", { className: "text-xs text-gray-600 uppercase tracking-wider", children: "Contributing Signals" }), userRisk.contributingSignals.slice(0, 3).map((sig, i) => (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-full bg-gray-800 rounded-full h-1.5 flex-1", children: _jsx("div", { className: "bg-blue-500 h-1.5 rounded-full", style: { width: `${Math.min(sig.contribution, 100)}%` } }) }), _jsx("span", { className: "text-xs text-gray-500 flex-shrink-0 w-16 truncate", children: sig.signalType })] }, i)))] }))] })) : (_jsxs("div", { className: "text-center py-3", children: [_jsx("p", { className: "text-xs text-gray-600", children: "No risk data available for this user" }), _jsx("p", { className: "text-xs text-gray-700 mt-0.5", children: "May need baseline data collection" })] }))] })), alert.affectedIp && (_jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(Globe, { className: "h-4 w-4 text-gray-500" }), _jsx("h3", { className: "text-xs font-semibold text-gray-300 uppercase tracking-wider", children: "Source IP Context" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-gray-500", children: "Address" }), _jsx("code", { className: "text-xs font-mono text-gray-300", children: alert.affectedIp })] }), _jsxs("div", { className: "pt-2 border-t border-gray-800", children: [_jsxs("a", { href: `https://www.shodan.io/host/${alert.affectedIp}`, target: "_blank", rel: "noopener noreferrer", className: "flex items-center gap-1.5 text-xs text-blue-400 hover:underline", children: [_jsx(ExternalLink, { className: "h-3 w-3" }), "Look up on Shodan"] }), _jsxs("a", { href: `https://www.virustotal.com/gui/ip-address/${alert.affectedIp}`, target: "_blank", rel: "noopener noreferrer", className: "flex items-center gap-1.5 text-xs text-blue-400 hover:underline mt-1.5", children: [_jsx(ExternalLink, { className: "h-3 w-3" }), "Check VirusTotal"] }), _jsxs("a", { href: `https://www.abuseipdb.com/check/${alert.affectedIp}`, target: "_blank", rel: "noopener noreferrer", className: "flex items-center gap-1.5 text-xs text-blue-400 hover:underline mt-1.5", children: [_jsx(ExternalLink, { className: "h-3 w-3" }), "AbuseIPDB Report"] })] })] })] })), relatedAlerts.length > 0 && (_jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(Activity, { className: "h-4 w-4 text-gray-500" }), _jsx("h3", { className: "text-xs font-semibold text-gray-300 uppercase tracking-wider", children: "Related Alerts" }), _jsxs("span", { className: "text-xs text-gray-600 ml-auto", children: ["Same ", alert.affectedUserId ? 'user' : 'IP'] })] }), _jsx("div", { className: "space-y-2", children: relatedAlerts.map((ra) => (_jsxs(Link, { to: `/alerts/${ra.id}`, className: "block rounded-lg border border-gray-800 bg-gray-800/40\n                             p-2.5 hover:bg-gray-800 transition-colors", children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsx(Badge, { variant: ra.priority, size: "xs", children: ra.priority }), _jsx("p", { className: "text-xs text-gray-300 leading-snug line-clamp-2 flex-1", children: ra.title })] }), _jsxs("div", { className: "flex items-center gap-2 mt-1.5", children: [_jsx(Badge, { variant: ra.severity, size: "xs", children: ra.severity }), _jsx("span", { className: "text-xs text-gray-600 ml-auto", children: new Date(ra.createdAt).toLocaleDateString() })] })] }, ra.id))) })] })), _jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-4", children: [_jsx("h3", { className: "text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3", children: "External Resources" }), _jsxs("div", { className: "space-y-2", children: [alert.mitreTechniques?.[0] && (_jsxs("a", { href: `https://attack.mitre.org/techniques/${alert.mitreTechniques[0].replace('.', '/')}/`, target: "_blank", rel: "noopener noreferrer", className: "flex items-center gap-2 text-xs text-blue-400 hover:underline", children: [_jsx(ExternalLink, { className: "h-3 w-3 flex-shrink-0" }), "MITRE ATT&CK: ", alert.mitreTechniques[0]] })), _jsxs("a", { href: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", target: "_blank", rel: "noopener noreferrer", className: "flex items-center gap-2 text-xs text-blue-400 hover:underline", children: [_jsx(ExternalLink, { className: "h-3 w-3 flex-shrink-0" }), "CISA KEV Catalog"] }), _jsxs("a", { href: "https://nvd.nist.gov/vuln/search", target: "_blank", rel: "noopener noreferrer", className: "flex items-center gap-2 text-xs text-blue-400 hover:underline", children: [_jsx(ExternalLink, { className: "h-3 w-3 flex-shrink-0" }), "NIST NVD Search"] })] })] })] }) }));
}
