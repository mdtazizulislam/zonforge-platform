import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card, Skeleton } from '@/components/shared/ui';
import { Shield, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Play, ChevronDown, ChevronUp, Zap, Scale, Network, Eye, ArrowRight, Cpu, } from 'lucide-react';
// ─────────────────────────────────────────────
const H = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
const RISK_COLOR = {
    critical: 'text-red-400', high: 'text-orange-400',
    medium: 'text-yellow-400', low: 'text-blue-400', safe: 'text-green-400',
};
const STATUS_COLOR = {
    compliant: 'text-green-400 bg-green-500/10', partial: 'text-yellow-400 bg-yellow-500/10',
    non_compliant: 'text-red-400 bg-red-500/10', unknown: 'text-gray-400 bg-gray-800',
};
// ─────────────────────────────────────────────
// TAB: DECEPTION TECHNOLOGY
// ─────────────────────────────────────────────
function DeceptionTab() {
    const qc = useQueryClient();
    const [deploying, setDeploying] = useState(false);
    const { data: summaryData, isLoading } = useQuery({
        queryKey: ['deception-summary'],
        queryFn: () => fetch('/api/v1/deception/grid-summary', { headers: H() }).then(r => r.json()),
        staleTime: 60_000, refetchInterval: 30_000,
    });
    const { data: hpData } = useQuery({
        queryKey: ['deception-honeypots'],
        queryFn: () => fetch('/api/v1/deception/honeypots', { headers: H() }).then(r => r.json()),
        staleTime: 60_000,
    });
    const summary = summaryData?.data;
    const honeypots = hpData?.data ?? [];
    async function deployGrid() {
        setDeploying(true);
        await fetch('/api/v1/deception/deploy-grid', { method: 'POST', headers: H() });
        await new Promise(r => setTimeout(r, 1000));
        qc.invalidateQueries({ queryKey: ['deception-summary'] });
        qc.invalidateQueries({ queryKey: ['deception-honeypots'] });
        setDeploying(false);
    }
    const HONEYPOT_ICONS = {
        fake_credential: '🔑', fake_api_key: '🗝️', fake_s3_bucket: '🪣',
        fake_admin_account: '👤', fake_database_server: '🗄️', fake_ssh_key: '🔐',
        fake_webhook_url: '🌐', fake_internal_service: '🔧', canary_document: '📄', canary_email: '📧',
    };
    return (_jsxs("div", { className: "space-y-5", children: [(summary?.totalHoneypots ?? 0) === 0 && !isLoading && (_jsx(Card, { className: "border-blue-500/20 bg-blue-500/5", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "rounded-xl bg-blue-500/20 p-3", children: _jsx(Shield, { className: "h-6 w-6 text-blue-400" }) }), _jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "text-sm font-bold text-gray-100 mb-1", children: "Deploy Honeypot Grid" }), _jsx("p", { className: "text-xs text-gray-500 leading-relaxed", children: "10 strategic honeypots across credentials, cloud, documents, and email. Any touch = immediate high-confidence detection. Zero false positives by design." })] }), _jsx(Button, { variant: "primary", icon: Zap, disabled: deploying, onClick: deployGrid, children: deploying ? 'Deploying…' : 'Deploy 10 Honeypots' })] }) })), (summary?.totalHoneypots ?? 0) > 0 && (_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4", children: [
                    { label: 'Active Honeypots', value: summary?.activeCount ?? 0, icon: Shield, color: 'text-green-400' },
                    { label: 'Triggered (30d)', value: summary?.triggeredCount ?? 0, icon: AlertTriangle, color: summary?.triggeredCount > 0 ? 'text-red-400' : 'text-gray-500' },
                    { label: 'Touch Events', value: summary?.triggersLast30d ?? 0, icon: Eye, color: summary?.triggersLast30d > 0 ? 'text-orange-400' : 'text-gray-500' },
                    { label: 'False Positive Rate', value: '0%', icon: CheckCircle2, color: 'text-green-400' },
                ].map(k => (_jsxs(Card, { className: "flex items-center gap-3", children: [_jsx(k.icon, { className: clsx('h-5 w-5 flex-shrink-0', k.color) }), _jsxs("div", { children: [_jsx("p", { className: clsx('text-2xl font-bold tabular-nums', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500", children: k.label })] })] }, k.label))) })), summary?.riskSignals?.length > 0 && (_jsxs("div", { className: clsx('flex items-start gap-3 p-4 rounded-xl border', summary.triggersLast30d > 0 ? 'bg-red-500/8 border-red-500/20' : 'bg-green-500/5 border-green-500/15'), children: [summary.triggersLast30d > 0
                        ? _jsx(AlertTriangle, { className: "h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" })
                        : _jsx(CheckCircle2, { className: "h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" }), _jsx("p", { className: clsx('text-xs font-medium', summary.triggersLast30d > 0 ? 'text-red-400' : 'text-green-400'), children: summary.riskSignals[0] })] })), honeypots.length > 0 && (_jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between", children: [_jsxs("span", { children: ["Honeypot Grid (", honeypots.length, ")"] }), _jsx(Button, { variant: "outline", size: "sm", icon: Zap, onClick: deployGrid, disabled: deploying, children: "Add More" })] }), _jsx("div", { className: "divide-y divide-gray-800/50", children: honeypots.map((hp) => (_jsxs("div", { className: "flex items-center gap-4 px-5 py-3.5", children: [_jsx("span", { className: "text-xl flex-shrink-0", children: HONEYPOT_ICONS[hp.type] ?? '🍯' }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-gray-200 truncate", children: hp.name }), _jsxs("p", { className: "text-xs text-gray-600", children: [hp.placement, " \u00B7 ", hp.type] })] }), _jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [hp.triggerCount > 0 && (_jsxs("span", { className: "px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400", children: [hp.triggerCount, "\u00D7 triggered"] })), _jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-medium', hp.status === 'active' ? 'text-green-400 bg-green-500/10' : hp.status === 'triggered' ? 'text-red-400 bg-red-500/10' : 'text-gray-400 bg-gray-800'), children: hp.status }), _jsx("span", { className: clsx('text-xs font-bold', hp.alertSeverity === 'critical' ? 'text-red-400' : 'text-orange-400'), children: hp.alertSeverity })] })] }, hp.id))) })] }))] }));
}
// ─────────────────────────────────────────────
// TAB: REGULATORY AI
// ─────────────────────────────────────────────
function RegulatoryTab() {
    const [question, setQuestion] = useState('');
    const [framework, setFramework] = useState('soc2_type2');
    const [answer, setAnswer] = useState(null);
    const [asking, setAsking] = useState(false);
    const [assessing, setAssessing] = useState(null);
    const { data: frameworksData } = useQuery({
        queryKey: ['reg-frameworks'],
        queryFn: () => fetch('/api/v1/regulatory/frameworks', { headers: H() }).then(r => r.json()),
        staleTime: Infinity,
    });
    const { data: postureData, isLoading: postureLoading } = useQuery({
        queryKey: ['reg-posture'],
        queryFn: () => fetch('/api/v1/regulatory/posture', { headers: H() }).then(r => r.json()),
        staleTime: 5 * 60_000,
    });
    const frameworks = frameworksData?.data ?? [];
    const postures = postureData?.data ?? [];
    async function askAuditor() {
        if (!question.trim())
            return;
        setAsking(true);
        setAnswer(null);
        const r = await fetch('/api/v1/regulatory/ask-auditor', {
            method: 'POST', headers: H(),
            body: JSON.stringify({ framework, question }),
        });
        const data = await r.json();
        setAnswer(data.data);
        setAsking(false);
    }
    return (_jsxs("div", { className: "space-y-5", children: [_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-3 gap-4", children: postureLoading ? ([...Array(6)].map((_, i) => _jsx(Skeleton, { className: "h-32 rounded-xl" }, i))) : (postures.map((p) => {
                    const fw = frameworks.find((f) => f.id === p.framework);
                    return (_jsxs(Card, { className: clsx('hover:border-gray-700 transition-colors', p.overallStatus === 'non_compliant' && 'border-red-500/20'), children: [_jsxs("div", { className: "flex items-start justify-between mb-2", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-sm font-bold text-gray-200", children: fw?.name ?? p.framework }), _jsx("p", { className: "text-xs text-gray-600", children: fw?.full })] }), _jsxs("span", { className: clsx('px-2 py-0.5 rounded text-xs font-bold tabular-nums', p.overallScore >= 80 ? 'text-green-400' : p.overallScore >= 50 ? 'text-yellow-400' : 'text-red-400'), children: [p.overallScore, "%"] })] }), _jsx("div", { className: "h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3", children: _jsx("div", { className: "h-full rounded-full transition-all duration-700", style: { width: `${p.overallScore}%`, background: p.overallScore >= 80 ? '#22c55e' : p.overallScore >= 50 ? '#eab308' : '#ef4444' } }) }), _jsxs("div", { className: "flex items-center justify-between text-xs", children: [_jsx("span", { className: clsx('px-2 py-0.5 rounded font-medium', STATUS_COLOR[p.overallStatus]), children: p.overallStatus?.replace('_', ' ') }), _jsxs("span", { className: "text-gray-600", children: [p.compliantCount, "/", p.controlResults?.length, " controls"] })] }), p.criticalGaps?.length > 0 && (_jsxs("div", { className: "mt-2 text-xs text-red-400 truncate", children: ["\u26A0 ", p.criticalGaps[0]] }))] }, p.framework));
                })) }), _jsxs(Card, { children: [_jsxs("div", { className: "flex items-center gap-2 mb-4", children: [_jsx(Cpu, { className: "h-4 w-4 text-blue-400" }), _jsx("h3", { className: "text-sm font-semibold text-gray-200", children: "Ask the AI Compliance Advisor" }), _jsx("span", { className: "text-xs text-gray-600 ml-auto", children: "claude-sonnet-4-6" })] }), _jsxs("div", { className: "flex gap-3 mb-3", children: [_jsx("select", { value: framework, onChange: e => setFramework(e.target.value), className: "px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 focus:outline-none focus:border-blue-500", children: frameworks.map((f) => _jsx("option", { value: f.id, children: f.name }, f.id)) }), _jsx("input", { type: "text", value: question, onChange: e => setQuestion(e.target.value), onKeyDown: e => e.key === 'Enter' && askAuditor(), placeholder: "e.g. 'How do we meet CC7.1 monitoring requirements?'", className: "flex-1 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" }), _jsx(Button, { variant: "primary", size: "sm", icon: asking ? RefreshCw : Cpu, onClick: askAuditor, disabled: asking || !question.trim(), children: asking ? 'Thinking…' : 'Ask' })] }), asking && (_jsxs("div", { className: "flex items-center gap-2 py-4 text-sm text-gray-400", children: [_jsx(RefreshCw, { className: "h-4 w-4 animate-spin" }), " Analyzing compliance data and generating response\u2026"] })), answer && (_jsxs("div", { className: "p-4 rounded-xl bg-blue-500/5 border border-blue-500/15 mt-3", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx("span", { className: "text-xs text-blue-400 font-semibold uppercase tracking-wider", children: answer.framework?.replace('_', ' ').toUpperCase() }), _jsxs("span", { className: "text-xs text-gray-600", children: ["\u00B7 Confidence: ", answer.confidence, "%"] })] }), _jsx("p", { className: "text-sm text-gray-300 leading-relaxed whitespace-pre-wrap", children: answer.answer }), answer.evidenceCited?.length > 0 && (_jsxs("div", { className: "mt-3 pt-3 border-t border-blue-500/15", children: [_jsx("p", { className: "text-xs text-gray-500 mb-1", children: "Evidence cited:" }), answer.evidenceCited.map((e, i) => (_jsx("div", { className: "text-xs text-gray-600 font-mono", children: e }, i)))] }))] }))] })] }));
}
// ─────────────────────────────────────────────
// TAB: DIGITAL TWIN
// ─────────────────────────────────────────────
function DigitalTwinTab() {
    const qc = useQueryClient();
    const [building, setBuilding] = useState(false);
    const [simulating, setSimulating] = useState(null);
    const [lastResult, setLastResult] = useState(null);
    const [selectedPath, setSelectedPath] = useState(null);
    const { data: twinsData, isLoading } = useQuery({
        queryKey: ['digital-twins'],
        queryFn: () => fetch('/api/v1/twin/list', { headers: H() }).then(r => r.json()),
        staleTime: 60_000,
    });
    const twins = twinsData?.data ?? [];
    async function buildTwin() {
        setBuilding(true);
        await fetch('/api/v1/twin/build', { method: 'POST', headers: H(), body: JSON.stringify({ name: 'Production Environment Twin' }) });
        await new Promise(r => setTimeout(r, 500));
        qc.invalidateQueries({ queryKey: ['digital-twins'] });
        setBuilding(false);
    }
    async function simulate(twinId) {
        setSimulating(twinId);
        setLastResult(null);
        const r = await fetch('/api/v1/twin/simulate', {
            method: 'POST', headers: H(),
            body: JSON.stringify({ twinId, scenarios: ['credential_attack', 'lateral_movement', 'oauth_abuse'] }),
        });
        const data = await r.json();
        setLastResult(data.data);
        setSimulating(null);
    }
    const DEPLOY_STYLES = {
        safe: 'bg-green-500/10 text-green-400 border-green-500/20',
        risky: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        critical: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return (_jsxs("div", { className: "space-y-5", children: [twins.length === 0 && !isLoading && (_jsx(Card, { className: "border-purple-500/20 bg-purple-500/5", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "rounded-xl bg-purple-500/20 p-3", children: _jsx(Network, { className: "h-6 w-6 text-purple-400" }) }), _jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "text-sm font-bold text-gray-100 mb-1", children: "Build Digital Twin" }), _jsx("p", { className: "text-xs text-gray-500 leading-relaxed", children: "Automatically constructs a virtual replica of your infrastructure from existing connector data and risk scores. Simulates attack paths without touching production." })] }), _jsx(Button, { variant: "primary", icon: Network, disabled: building, onClick: buildTwin, children: building ? 'Building…' : 'Build Twin' })] }) })), twins.length > 0 && (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-300", children: "Infrastructure Twins" }), _jsx(Button, { variant: "outline", size: "sm", icon: Network, onClick: buildTwin, disabled: building, children: "Rebuild Twin" })] })), twins.map((twin) => (_jsxs(Card, { children: [_jsxs("div", { className: "flex items-start justify-between gap-4 mb-4", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-sm font-bold text-gray-200", children: twin.name }), _jsxs("p", { className: "text-xs text-gray-500 mt-0.5", children: [twin.nodeCount, " nodes \u00B7 ", twin.edgeCount, " edges \u00B7 Built ", new Date(twin.builtAt).toLocaleString()] })] }), _jsx(Button, { variant: "primary", size: "sm", icon: simulating === twin.id ? RefreshCw : Play, disabled: !!simulating, onClick: () => simulate(twin.id), children: simulating === twin.id ? 'Simulating…' : 'Simulate Attacks' })] }), simulating === twin.id && (_jsxs("div", { className: "flex items-center gap-3 py-4 text-sm text-gray-400", children: [_jsx(RefreshCw, { className: "h-4 w-4 animate-spin" }), "Modeling attack paths: credential attack, lateral movement, OAuth abuse\u2026"] })), lastResult && lastResult.twinId === twin.id && (_jsxs("div", { className: "space-y-4 mt-2", children: [_jsxs("div", { className: clsx('flex items-start gap-3 p-4 rounded-xl border', DEPLOY_STYLES[lastResult.deploymentRiskLevel]), children: [lastResult.deploymentRiskLevel === 'safe'
                                        ? _jsx(CheckCircle2, { className: "h-4 w-4 flex-shrink-0 mt-0.5" })
                                        : lastResult.deploymentRiskLevel === 'risky'
                                            ? _jsx(AlertTriangle, { className: "h-4 w-4 flex-shrink-0 mt-0.5" })
                                            : _jsx(XCircle, { className: "h-4 w-4 flex-shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wider", children: lastResult.deploymentRiskLevel }), _jsx("p", { className: "text-xs mt-0.5", children: lastResult.deploymentRecommendation })] })] }), _jsx("div", { className: "grid grid-cols-4 gap-3", children: [
                                    { label: 'Attack Paths', value: lastResult.attackPaths?.length ?? 0, color: 'text-gray-200' },
                                    { label: 'Critical Paths', value: lastResult.criticalPathCount ?? 0, color: lastResult.criticalPathCount > 0 ? 'text-red-400' : 'text-gray-400' },
                                    { label: 'Detection Coverage', value: `${lastResult.detectability}%`, color: lastResult.detectability >= 80 ? 'text-green-400' : 'text-yellow-400' },
                                    { label: 'Undetected Steps', value: lastResult.undetectedSteps ?? 0, color: lastResult.undetectedSteps > 0 ? 'text-red-400' : 'text-green-400' },
                                ].map(k => (_jsxs("div", { className: "bg-gray-800/40 rounded-lg p-3 text-center", children: [_jsx("p", { className: clsx('text-xl font-bold tabular-nums', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: k.label })] }, k.label))) }), lastResult.attackPaths?.map((path) => (_jsxs("div", { className: "rounded-xl border border-gray-800 overflow-hidden", children: [_jsxs("button", { onClick: () => setSelectedPath(selectedPath === path.id ? null : path.id), className: "w-full flex items-center gap-4 p-4 hover:bg-gray-800/20 text-left transition-colors", children: [_jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-bold uppercase flex-shrink-0', path.severity === 'critical' ? 'bg-red-500/15 text-red-400' : path.severity === 'high' ? 'bg-orange-500/15 text-orange-400' : 'bg-yellow-500/15 text-yellow-400'), children: path.severity }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-semibold text-gray-200", children: path.name }), _jsxs("p", { className: "text-xs text-gray-500", children: [path.steps?.length, " steps \u00B7 ", path.detectability, "% detectable \u00B7 likelihood: ", path.totalLikelihood, "%"] })] }), path.criticalGap && _jsx("span", { className: "text-xs text-red-400 font-bold flex-shrink-0", children: "\u26A0 GAP" }), selectedPath === path.id ? _jsx(ChevronUp, { className: "h-4 w-4 text-gray-600" }) : _jsx(ChevronDown, { className: "h-4 w-4 text-gray-600" })] }), selectedPath === path.id && (_jsx("div", { className: "px-4 pb-4 space-y-2 bg-gray-900/30", children: path.steps?.map((step) => (_jsxs("div", { className: "flex items-center gap-3 text-xs", children: [_jsx("span", { className: "w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 font-bold flex-shrink-0", children: step.stepNumber }), _jsx("span", { className: "font-mono text-gray-600 flex-shrink-0", children: step.technique }), _jsx("span", { className: "text-gray-400 flex-1", children: step.description }), step.detectable
                                                    ? _jsxs("span", { className: "text-green-400 flex-shrink-0", children: ["\u2713 ", step.detectionRule] })
                                                    : _jsx("span", { className: "text-red-400 flex-shrink-0", children: "\u2717 UNDETECTED" })] }, step.stepNumber))) }))] }, path.id))), lastResult.recommendedControls?.length > 0 && (_jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Recommended Security Controls" }), lastResult.recommendedControls.slice(0, 6).map((r, i) => (_jsxs("div", { className: "flex items-start gap-2 mb-2 text-xs text-gray-400", children: [_jsx(ArrowRight, { className: "h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" }), r] }, i)))] }))] }))] }, twin.id)))] }));
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function EnterpriseCapabilitiesPage() {
    const [tab, setTab] = useState('deception');
    return (_jsx(AppShell, { title: "Enterprise Capabilities", children: _jsxs(PageContent, { children: [_jsx("div", { className: "flex items-center gap-1 border-b border-gray-800 mb-6", children: [
                        { id: 'deception', label: 'Deception Grid', icon: Shield, sub: 'Honeypots' },
                        { id: 'regulatory', label: 'Regulatory AI', icon: Scale, sub: 'Compliance Autopilot' },
                        { id: 'twin', label: 'Digital Twin', icon: Network, sub: 'Attack Path Modeling' },
                    ].map(t => (_jsxs("button", { onClick: () => setTab(t.id), className: clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all', tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'), children: [_jsx(t.icon, { className: "h-4 w-4" }), t.label, _jsxs("span", { className: "text-xs text-gray-600 hidden md:inline", children: ["\u00B7 ", t.sub] })] }, t.id))) }), tab === 'deception' && _jsx(DeceptionTab, {}), tab === 'regulatory' && _jsx(RegulatoryTab, {}), tab === 'twin' && _jsx(DigitalTwinTab, {})] }) }));
}
