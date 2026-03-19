import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { clsx } from 'clsx';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card } from '@/components/shared/ui';
import { FileText, Download, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Shield, BarChart3, Zap, Upload, TrendingUp, TrendingDown, Minus, Clock, Server, ArrowRight, ChevronDown, ChevronUp, } from 'lucide-react';
// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────
const H = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
// ─────────────────────────────────────────────
// REPORT CARD
// ─────────────────────────────────────────────
function ReportCard({ icon: Icon, title, description, period, generating, onGenerate, lastGenerated, badge, }) {
    return (_jsx(Card, { className: "hover:border-gray-700 transition-colors", children: _jsxs("div", { className: "flex items-start gap-4", children: [_jsx("div", { className: "rounded-xl bg-gray-800 p-3 flex-shrink-0", children: _jsx(Icon, { className: "h-5 w-5 text-gray-400" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200", children: title }), badge && (_jsx("span", { className: "px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/10 text-green-400", children: badge }))] }), _jsx("p", { className: "text-xs text-gray-500 leading-relaxed mb-3", children: description }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("span", { className: "text-xs text-gray-600 flex items-center gap-1", children: [_jsx(Clock, { className: "h-3 w-3" }), " ", period] }), lastGenerated && (_jsxs("span", { className: "text-xs text-gray-700", children: ["Last: ", new Date(lastGenerated).toLocaleDateString()] }))] })] }), _jsx(Button, { variant: "primary", size: "sm", icon: generating ? RefreshCw : Download, onClick: onGenerate, disabled: generating, className: clsx('flex-shrink-0', generating && 'animate-pulse'), children: generating ? 'Generating…' : 'Generate' })] }) }));
}
// ─────────────────────────────────────────────
// SOC2 EVIDENCE VIEWER
// ─────────────────────────────────────────────
function Soc2Viewer({ pkg }) {
    const [expanded, setExpanded] = useState(null);
    const statusIcon = (s) => ({
        compliant: _jsx(CheckCircle2, { className: "h-4 w-4 text-green-400" }),
        partial: _jsx(AlertTriangle, { className: "h-4 w-4 text-yellow-400" }),
        gap: _jsx(XCircle, { className: "h-4 w-4 text-red-400" }),
    }[s] ?? null);
    const statusColor = (s) => ({
        compliant: 'bg-green-500/10 text-green-400 border-green-500/20',
        partial: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        gap: 'bg-red-500/10 text-red-400 border-red-500/20',
    }[s] ?? 'bg-gray-700 text-gray-400');
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "rounded-xl border border-gray-800 p-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-base font-bold text-gray-100", children: "SOC2 Type II Evidence Package" }), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: ["Tenant: ", pkg.tenantName, " \u00B7 Period: ", new Date(pkg.period.from).toLocaleDateString(), " \u2013", ' ', new Date(pkg.period.to).toLocaleDateString(), " \u00B7 Generated: ", new Date(pkg.generatedAt).toLocaleString()] })] }), _jsxs("div", { className: "text-right", children: [_jsxs("div", { className: clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border', pkg.summary.overallStatus === 'compliant' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                            pkg.summary.overallStatus === 'partial' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                                'bg-red-500/10 text-red-400 border-red-500/20'), children: [statusIcon(pkg.summary.overallStatus), pkg.summary.overallStatus === 'compliant' ? 'All Controls Compliant'
                                                : pkg.summary.overallStatus === 'partial' ? 'Partial Compliance'
                                                    : 'Non-Compliant'] }), _jsxs("div", { className: "flex items-center gap-2 mt-2 text-xs justify-end", children: [_jsxs("span", { className: "text-green-400", children: [pkg.summary.compliantControls, " compliant"] }), pkg.summary.partialControls > 0 && _jsxs("span", { className: "text-yellow-400", children: [pkg.summary.partialControls, " partial"] }), pkg.summary.gapControls > 0 && _jsxs("span", { className: "text-red-400", children: [pkg.summary.gapControls, " gaps"] })] })] })] }), pkg.downloadUrl && (_jsxs("a", { href: pkg.downloadUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1.5 mt-3 text-xs text-blue-400 hover:underline", children: [_jsx(Download, { className: "h-3 w-3" }), " Download Evidence Package (S3)"] }))] }), pkg.sections?.map((section) => (_jsxs("div", { className: "rounded-xl border border-gray-800 overflow-hidden", children: [_jsxs("button", { onClick: () => setExpanded(expanded === section.controlId ? null : section.controlId), className: "w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors text-left", children: [_jsxs("div", { className: "flex items-center gap-3", children: [statusIcon(section.status), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm font-bold text-gray-200", children: section.controlId }), _jsx("span", { className: "text-sm text-gray-400", children: section.controlName })] }), _jsx("p", { className: "text-xs text-gray-600", children: section.description })] })] }), _jsxs("div", { className: "flex items-center gap-3 flex-shrink-0", children: [_jsx("span", { className: clsx('px-2.5 py-1 rounded-lg text-xs font-medium border capitalize', statusColor(section.status)), children: section.status }), expanded === section.controlId ? _jsx(ChevronUp, { className: "h-4 w-4 text-gray-600" }) : _jsx(ChevronDown, { className: "h-4 w-4 text-gray-600" })] })] }), expanded === section.controlId && (_jsxs("div", { className: "px-4 pb-4 pt-0 border-t border-gray-800 space-y-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2", children: "Evidence" }), _jsx("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-2", children: Object.entries(section.evidence ?? {}).filter(([k]) => k !== 'sampleAuditEntries').map(([k, v]) => (_jsxs("div", { className: "bg-gray-800/40 rounded-lg p-2.5", children: [_jsx("p", { className: "text-xs text-gray-500 mb-0.5", children: k.replace(/([A-Z])/g, ' $1').trim() }), _jsx("p", { className: "text-sm font-medium text-gray-200 truncate", children: String(v) })] }, k))) })] }), section.gaps?.length > 0 && (_jsxs("div", { className: "p-3 rounded-lg bg-red-500/8 border border-red-500/20", children: [_jsx("p", { className: "text-xs font-semibold text-red-400 mb-2", children: "Gaps Identified" }), section.gaps.map((g, i) => (_jsxs("div", { className: "flex items-start gap-2 text-xs text-red-300", children: [_jsx(XCircle, { className: "h-3 w-3 flex-shrink-0 mt-0.5" }), g] }, i)))] })), section.remediation?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2", children: "Remediation" }), section.remediation.map((r, i) => (_jsxs("div", { className: "flex items-start gap-2 text-xs text-gray-400 mb-1.5", children: [_jsx(ArrowRight, { className: "h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" }), r] }, i)))] }))] }))] }, section.controlId)))] }));
}
// ─────────────────────────────────────────────
// EXECUTIVE REPORT VIEWER
// ─────────────────────────────────────────────
function ExecutiveViewer({ report }) {
    const deltaColor = report.headline.postureScoreDelta > 0 ? 'text-green-400'
        : report.headline.postureScoreDelta < 0 ? 'text-red-400' : 'text-gray-400';
    const DeltaIcon = report.headline.postureScoreDelta > 0 ? TrendingUp
        : report.headline.postureScoreDelta < 0 ? TrendingDown : Minus;
    return (_jsxs("div", { className: "space-y-5", children: [_jsx("div", { className: "flex items-start justify-between", children: _jsxs("div", { children: [_jsxs("h3", { className: "text-base font-bold text-gray-100", children: [report.period.label, " Executive Security Report"] }), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: [report.tenantName, " \u00B7", new Date(report.period.from).toLocaleDateString(), " \u2013", ' ', new Date(report.period.to).toLocaleDateString(), " \u00B7 Generated ", new Date(report.generatedAt).toLocaleString()] })] }) }), _jsx("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [
                    { label: 'Posture Score', value: report.headline.postureScore,
                        sub: _jsxs("span", { className: clsx('flex items-center gap-0.5 text-xs', deltaColor), children: [_jsx(DeltaIcon, { className: "h-3 w-3" }), Math.abs(report.headline.postureScoreDelta)] }) },
                    { label: 'Open Critical', value: report.headline.openCriticalAlerts,
                        color: report.headline.openCriticalAlerts > 0 ? 'text-red-400' : 'text-gray-400' },
                    { label: 'Incidents', value: report.headline.totalIncidents,
                        sub: _jsxs("span", { className: "text-xs text-gray-600", children: [report.headline.resolvedIncidents, " resolved"] }) },
                    { label: 'Resolution Rate', value: `${report.headline.resolutionRate}%`,
                        color: report.headline.resolutionRate >= 80 ? 'text-green-400' : 'text-yellow-400' },
                ].map((k, i) => (_jsxs("div", { className: "bg-gray-800/40 rounded-xl p-4", children: [_jsx("p", { className: "text-xs text-gray-500 mb-1", children: k.label }), _jsx("p", { className: clsx('text-2xl font-bold tabular-nums', k.color ?? 'text-gray-100'), children: k.value }), k.sub && _jsx("div", { className: "mt-1", children: k.sub })] }, i))) }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Detection Performance" }), [
                                { label: 'MTTD P50', value: `${report.detection.mttdP50Minutes}min` },
                                { label: 'MTTD P90', value: `${report.detection.mttdP90Minutes}min` },
                                { label: 'False Positive Rate', value: `${report.detection.falsePositiveRate}%` },
                            ].map(r => (_jsxs("div", { className: "flex items-center justify-between py-2 border-b border-gray-800 last:border-0", children: [_jsx("span", { className: "text-xs text-gray-500", children: r.label }), _jsx("span", { className: "text-sm font-bold text-gray-200", children: r.value })] }, r.label)))] }), _jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Risk Overview" }), [
                                { label: 'Avg User Risk', value: report.risk.avgUserRiskScore },
                                { label: 'High Risk Users', value: report.risk.highRiskUsers, color: report.risk.highRiskUsers > 0 ? 'text-orange-400' : 'text-gray-400' },
                                { label: 'Critical Risk Users', value: report.risk.criticalRiskUsers, color: report.risk.criticalRiskUsers > 0 ? 'text-red-400' : 'text-gray-400' },
                            ].map(r => (_jsxs("div", { className: "flex items-center justify-between py-2 border-b border-gray-800 last:border-0", children: [_jsx("span", { className: "text-xs text-gray-500", children: r.label }), _jsx("span", { className: clsx('text-sm font-bold', r.color ?? 'text-gray-200'), children: r.value })] }, r.label)))] })] }), report.recommendations?.length > 0 && (_jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Recommendations" }), report.recommendations.map((r, i) => (_jsxs("div", { className: "flex items-start gap-3 mb-3 last:mb-0", children: [_jsx("span", { className: "flex-shrink-0 h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold", children: i + 1 }), _jsx("p", { className: "text-sm text-gray-400 leading-relaxed", children: r })] }, i)))] }))] }));
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function ComplianceReportsPage() {
    const [tab, setTab] = useState('reports');
    const [generating, setGenerating] = useState(null);
    const [result, setResult] = useState(null);
    const [resultType, setResultType] = useState(null);
    const [siemTest, setSiemTest] = useState(null);
    const [vulnResult, setVulnResult] = useState(null);
    const [uploadError, setUploadError] = useState(null);
    const fileRef = useRef(null);
    // SIEM config state
    const [siemProvider, setSiemProvider] = useState('splunk');
    const [siemEnabled, setSiemEnabled] = useState(false);
    const [splunkUrl, setSplunkUrl] = useState('');
    const [splunkToken, setSplunkToken] = useState('');
    const [sentinelWs, setSentinelWs] = useState('');
    const [sentinelKey, setSentinelKey] = useState('');
    async function generateReport(type, days) {
        setGenerating(type);
        setResult(null);
        try {
            const endpoint = type === 'soc2' ? '/api/v1/compliance/reports/soc2' : '/api/v1/compliance/reports/executive';
            const r = await fetch(endpoint, { method: 'POST', headers: H(), body: JSON.stringify({ periodDays: days }) });
            const data = await r.json();
            if (data.success) {
                setResult(data.data);
                setResultType(type);
            }
        }
        finally {
            setGenerating(null);
        }
    }
    async function testSiem() {
        setSiemTest(null);
        const config = {
            provider: siemProvider,
            enabled: true,
            splunkHecUrl: splunkUrl,
            splunkHecToken: splunkToken,
            sentinelWorkspaceId: sentinelWs,
            sentinelSharedKey: sentinelKey,
        };
        const r = await fetch('/api/v1/compliance/siem/test', { method: 'POST', headers: H(), body: JSON.stringify(config) });
        const data = await r.json();
        setSiemTest(data.data);
    }
    async function handleFileUpload(file) {
        setVulnResult(null);
        setUploadError(null);
        const form = new FormData();
        form.append('file', file);
        const r = await fetch('/api/v1/compliance/vuln/upload', {
            method: 'POST',
            headers: { Authorization: H().Authorization },
            body: form,
        });
        const data = await r.json();
        if (data.success)
            setVulnResult(data.data);
        else
            setUploadError(data.error?.message ?? 'Upload failed');
    }
    return (_jsx(AppShell, { title: "Compliance & Reports", children: _jsxs(PageContent, { children: [_jsx("div", { className: "flex items-center gap-1 border-b border-gray-800 mb-6", children: [
                        { id: 'reports', label: 'Report Generation', icon: FileText },
                        { id: 'siem', label: 'SIEM Integration', icon: Server },
                        { id: 'vuln', label: 'Vulnerability Feed', icon: Shield },
                    ].map(t => (_jsxs("button", { onClick: () => setTab(t.id), className: clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all', tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'), children: [_jsx(t.icon, { className: "h-4 w-4" }), t.label] }, t.id))) }), tab === 'reports' && (_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-5 gap-6", children: [_jsxs("div", { className: "lg:col-span-2 space-y-4", children: [_jsx(ReportCard, { icon: Shield, title: "SOC2 Type II Evidence Package", description: "Automated evidence collection across CC6, CC7, CC8, and A1 trust service criteria. Includes audit trail, alert metrics, connector health, and gap analysis.", period: "90-day audit period", generating: generating === 'soc2', onGenerate: () => generateReport('soc2', 90), badge: "SOC2" }), _jsx(ReportCard, { icon: BarChart3, title: "Monthly Executive Report", description: "Non-technical summary for leadership: posture trend, incident summary, MTTD performance, top risk entities, and actionable recommendations.", period: "30-day rolling period", generating: generating === 'executive', onGenerate: () => generateReport('executive', 30), badge: "PDF" }), _jsx(ReportCard, { icon: FileText, title: "Weekly Security Digest", description: "Week-over-week change in alerts, risk scores, and connector health. Designed for security team standup.", period: "7-day period", generating: generating === 'weekly', onGenerate: () => generateReport('executive', 7) }), _jsx(ReportCard, { icon: Zap, title: "MTTD SLA Performance", description: "Detection time percentiles (P50/P90/P99), SLA breach analysis, and rule-by-rule detection latency breakdown.", period: "30-day period", generating: generating === 'mttd', onGenerate: () => generateReport('executive', 30) })] }), _jsxs("div", { className: "lg:col-span-3", children: [generating && (_jsxs(Card, { className: "flex flex-col items-center justify-center py-16", children: [_jsx(RefreshCw, { className: "h-10 w-10 text-blue-400 animate-spin mb-4" }), _jsx("p", { className: "text-sm text-gray-400", children: "Generating report\u2026" }), _jsx("p", { className: "text-xs text-gray-600 mt-1", children: "Querying security data, calculating metrics" })] })), !generating && !result && (_jsxs(Card, { className: "flex flex-col items-center justify-center py-16 h-full", children: [_jsx("div", { className: "rounded-2xl bg-gray-800/50 p-5 mb-4", children: _jsx(FileText, { className: "h-10 w-10 text-gray-600" }) }), _jsx("p", { className: "text-sm font-medium text-gray-400 mb-2", children: "No report generated yet" }), _jsx("p", { className: "text-xs text-gray-600 text-center max-w-xs", children: "Select a report type from the left and click Generate. Reports are produced in real-time from your security data." })] })), !generating && result && resultType === 'soc2' && _jsx(Soc2Viewer, { pkg: result }), !generating && result && resultType === 'executive' && _jsx(ExecutiveViewer, { report: result })] })] })), tab === 'siem' && (_jsxs("div", { className: "max-w-2xl", children: [_jsxs(Card, { children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200 mb-1", children: "SIEM Integration" }), _jsx("p", { className: "text-xs text-gray-500 mb-5 leading-relaxed", children: "Forward ZonForge alerts and signals to your SIEM in real-time. Supports Splunk HEC, Microsoft Sentinel, and generic webhooks." }), _jsxs("div", { className: "mb-5", children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Provider" }), _jsx("div", { className: "grid grid-cols-3 gap-2 mt-2", children: [
                                                { id: 'splunk', label: 'Splunk' },
                                                { id: 'sentinel', label: 'Microsoft Sentinel' },
                                                { id: 'generic_syslog', label: 'Webhook / Syslog' },
                                            ].map(p => (_jsx("button", { onClick: () => setSiemProvider(p.id), className: clsx('py-2.5 rounded-xl text-xs font-medium transition-all border', siemProvider === p.id ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600'), children: p.label }, p.id))) })] }), siemProvider === 'splunk' && (_jsx("div", { className: "space-y-3 mb-5", children: [
                                        { label: 'HEC URL', value: splunkUrl, set: setSplunkUrl, ph: 'https://your-splunk:8088/services/collector' },
                                        { label: 'HEC Token', value: splunkToken, set: setSplunkToken, ph: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                                    ].map(f => (_jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500", children: f.label }), _jsx("input", { type: "text", value: f.value, onChange: e => f.set(e.target.value), placeholder: f.ph, className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" })] }, f.label))) })), siemProvider === 'sentinel' && (_jsx("div", { className: "space-y-3 mb-5", children: [
                                        { label: 'Workspace ID', value: sentinelWs, set: setSentinelWs, ph: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                                        { label: 'Shared Key', value: sentinelKey, set: setSentinelKey, ph: 'base64-encoded-key' },
                                    ].map(f => (_jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500", children: f.label }), _jsx("input", { type: "text", value: f.value, onChange: e => f.set(e.target.value), placeholder: f.ph, className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" })] }, f.label))) })), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => setSiemEnabled(v => !v), className: clsx('relative h-6 w-11 rounded-full transition-colors', siemEnabled ? 'bg-blue-600' : 'bg-gray-700'), children: _jsx("div", { className: clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', siemEnabled ? 'translate-x-5.5' : 'translate-x-0.5') }) }), _jsx("span", { className: "text-sm text-gray-300", children: siemEnabled ? 'Enabled' : 'Disabled' }), _jsxs("div", { className: "flex gap-2 ml-auto", children: [_jsx(Button, { variant: "outline", size: "sm", onClick: testSiem, children: "Test Connection" }), _jsx(Button, { variant: "primary", size: "sm", onClick: () => { }, children: "Save Config" })] })] }), siemTest && (_jsxs("div", { className: clsx('mt-4 flex items-center gap-3 p-3 rounded-xl border', siemTest.testPassed ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20'), children: [siemTest.testPassed
                                            ? _jsx(CheckCircle2, { className: "h-4 w-4 text-green-400 flex-shrink-0" })
                                            : _jsx(XCircle, { className: "h-4 w-4 text-red-400 flex-shrink-0" }), _jsx("p", { className: clsx('text-xs font-medium', siemTest.testPassed ? 'text-green-400' : 'text-red-400'), children: siemTest.testPassed
                                                ? `Connection successful — test event forwarded`
                                                : `Connection failed — check credentials and URL` })] }))] }), _jsxs(Card, { className: "mt-4", children: [_jsx("h4", { className: "text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3", children: "What Gets Forwarded" }), _jsx("div", { className: "space-y-2", children: [
                                        ['Alerts', 'All P1/P2/P3 alerts on creation and status change'],
                                        ['Detection Signals', 'Raw rule hits before alert creation'],
                                        ['Risk Changes', 'When user/asset risk score crosses severity threshold'],
                                        ['Playbook Executions', 'Automated response action results'],
                                    ].map(([label, desc]) => (_jsxs("div", { className: "flex items-start gap-3", children: [_jsx(CheckCircle2, { className: "h-3.5 w-3.5 text-green-500/60 flex-shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("span", { className: "text-xs font-medium text-gray-300", children: label }), _jsx("span", { className: "text-xs text-gray-600 ml-2", children: desc })] })] }, label))) })] })] })), tab === 'vuln' && (_jsxs("div", { className: "max-w-2xl", children: [_jsxs(Card, { className: "mb-4", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200 mb-1", children: "Vulnerability Scanner Upload" }), _jsx("p", { className: "text-xs text-gray-500 mb-5 leading-relaxed", children: "Upload scan results from Tenable, Qualys, OpenVAS, or any CSV/JSON format. Findings are parsed, indexed, and merged into your asset risk scores." }), _jsxs("div", { onClick: () => fileRef.current?.click(), onDrop: e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f)
                                        handleFileUpload(f); }, onDragOver: e => e.preventDefault(), className: "border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer\n                           hover:border-blue-500/50 hover:bg-blue-500/3 transition-all", children: [_jsx(Upload, { className: "h-8 w-8 text-gray-600 mx-auto mb-3" }), _jsx("p", { className: "text-sm font-medium text-gray-400 mb-1", children: "Drop scan file here or click to upload" }), _jsx("p", { className: "text-xs text-gray-600", children: "Tenable .nessus \u00B7 Qualys XML \u00B7 OpenVAS \u00B7 CSV \u00B7 JSON \u00B7 Max 50MB" }), _jsx("input", { ref: fileRef, type: "file", className: "hidden", accept: ".json,.csv,.xml,.nessus", onChange: e => { const f = e.target.files?.[0]; if (f)
                                                handleFileUpload(f); } })] }), _jsx("div", { className: "mt-4 grid grid-cols-2 gap-2", children: ['Tenable / Nessus (.nessus, JSON)', 'Qualys VMDR (XML)', 'OpenVAS Report (XML)', 'Generic JSON array', 'CSV (header-based)', 'Any structured format'].map(f => (_jsxs("div", { className: "flex items-center gap-1.5 text-xs text-gray-600", children: [_jsx(CheckCircle2, { className: "h-3 w-3 text-green-500/60" }), f] }, f))) })] }), uploadError && (_jsxs("div", { className: "flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/20 mb-4", children: [_jsx(XCircle, { className: "h-4 w-4 text-red-400 flex-shrink-0" }), _jsx("p", { className: "text-xs text-red-400", children: uploadError })] })), vulnResult && (_jsxs(Card, { children: [_jsxs("div", { className: "flex items-center gap-2 mb-4", children: [_jsx(CheckCircle2, { className: "h-4 w-4 text-green-400" }), _jsx("span", { className: "text-sm font-semibold text-gray-200", children: "Upload Processed Successfully" }), _jsxs("span", { className: "text-xs text-gray-600 ml-auto font-mono", children: [vulnResult.uploadId?.slice(0, 8), "\u2026"] })] }), _jsx("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3 mb-4", children: [
                                        { label: 'Total Findings', value: vulnResult.totalFindings, color: 'text-gray-200' },
                                        { label: 'Critical', value: vulnResult.criticalCount, color: vulnResult.criticalCount > 0 ? 'text-red-400' : 'text-gray-400' },
                                        { label: 'High', value: vulnResult.highCount, color: vulnResult.highCount > 0 ? 'text-orange-400' : 'text-gray-400' },
                                        { label: 'Assets Affected', value: vulnResult.assetsAffected, color: 'text-gray-200' },
                                    ].map(k => (_jsxs("div", { className: "bg-gray-800/40 rounded-lg p-3 text-center", children: [_jsx("p", { className: clsx('text-xl font-bold tabular-nums', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: k.label })] }, k.label))) }), _jsxs("div", { className: "flex items-center justify-between text-xs", children: [_jsxs("span", { className: "text-gray-500", children: ["Format: ", _jsx("span", { className: "font-mono text-gray-300", children: vulnResult.format })] }), _jsxs("span", { className: "text-gray-500", children: ["Risk Impact: ", _jsx("span", { className: clsx('font-bold', vulnResult.riskScoreImpact === 'high' ? 'text-red-400' : vulnResult.riskScoreImpact === 'medium' ? 'text-yellow-400' : 'text-green-400'), children: vulnResult.riskScoreImpact })] }), _jsxs("span", { className: "text-gray-500", children: ["Processed in ", _jsxs("span", { className: "text-gray-300", children: [vulnResult.processingMs, "ms"] })] })] }), vulnResult.topCves?.length > 0 && (_jsxs("div", { className: "mt-3 pt-3 border-t border-gray-800", children: [_jsx("p", { className: "text-xs text-gray-500 mb-2", children: "Top CVEs Found" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: vulnResult.topCves.map((cve) => (_jsx("a", { href: `https://nvd.nist.gov/vuln/detail/${cve}`, target: "_blank", rel: "noopener noreferrer", className: "text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded hover:underline", children: cve }, cve))) })] }))] }))] }))] }) }));
}
