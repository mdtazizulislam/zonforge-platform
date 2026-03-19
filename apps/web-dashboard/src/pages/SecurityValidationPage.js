import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card, Skeleton, EmptyState } from '@/components/shared/ui';
import { Play, Shield, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Zap, Activity, Lock, ArrowRight, FlaskConical, } from 'lucide-react';
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
    credential: { label: 'Credential Attacks', color: 'text-red-400 bg-red-500/10', icon: Lock },
    privilege_escalation: { label: 'Priv. Escalation', color: 'text-purple-400 bg-purple-500/10', icon: Shield },
    exfiltration: { label: 'Data Exfiltration', color: 'text-yellow-400 bg-yellow-500/10', icon: ArrowRight },
    lateral_movement: { label: 'Lateral Movement', color: 'text-orange-400 bg-orange-500/10', icon: Activity },
    oauth_abuse: { label: 'OAuth Abuse', color: 'text-blue-400 bg-blue-500/10', icon: Zap },
};
const EVAL_STYLES = {
    pass: { label: 'Detection PASS', dot: 'bg-green-400', badge: 'bg-green-500/10 text-green-400' },
    partial: { label: 'Partial Detection', dot: 'bg-yellow-400', badge: 'bg-yellow-500/10 text-yellow-400' },
    fail: { label: 'Detection FAIL', dot: 'bg-red-400', badge: 'bg-red-500/10 text-red-400' },
    timeout: { label: 'Timeout', dot: 'bg-gray-500', badge: 'bg-gray-700 text-gray-400' },
};
const GRADE_COLOR = {
    A: 'text-green-400', B: 'text-blue-400',
    C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400',
};
function TrendIcon({ trend }) {
    if (trend === 'improving')
        return _jsx(TrendingUp, { className: "h-3.5 w-3.5 text-green-400" });
    if (trend === 'degrading')
        return _jsx(TrendingDown, { className: "h-3.5 w-3.5 text-red-400" });
    return _jsx(Minus, { className: "h-3.5 w-3.5 text-gray-500" });
}
function DetectionBar({ pct }) {
    const color = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : pct >= 50 ? 'bg-orange-500' : 'bg-red-500';
    return (_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("div", { className: "flex-1 h-2 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: clsx('h-full rounded-full transition-all duration-700', color), style: { width: `${pct}%` } }) }), _jsxs("span", { className: "text-xs font-bold tabular-nums w-10 text-right", style: {
                    color: pct >= 90 ? '#22c55e' : pct >= 70 ? '#eab308' : pct >= 50 ? '#f97316' : '#ef4444',
                }, children: [pct, "%"] })] }));
}
// ─────────────────────────────────────────────
// SIMULATION RESULT ROW
// ─────────────────────────────────────────────
function SimResultRow({ result }) {
    const [open, setOpen] = useState(false);
    const ev = EVAL_STYLES[result.evaluationStatus] ?? EVAL_STYLES['timeout'];
    const catM = CAT_META[result.category] ?? { label: result.category, color: 'text-gray-400 bg-gray-800', icon: Shield };
    const Icon = catM.icon;
    return (_jsxs("div", { className: "border-b border-gray-800/50 last:border-0", children: [_jsxs("button", { onClick: () => setOpen(v => !v), className: "w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-800/20 transition-colors text-left", children: [_jsx("div", { className: clsx('h-2.5 w-2.5 rounded-full flex-shrink-0', ev.dot, result.status === 'running' && 'animate-pulse') }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsxs("span", { className: clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium', catM.color), children: [_jsx(Icon, { className: "h-3 w-3" }), catM.label] }), _jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-medium', ev.badge), children: ev.label })] }), _jsx("p", { className: "text-sm font-medium text-gray-200 truncate", children: result.scenarioName }), _jsx("p", { className: "text-xs text-gray-500 truncate", children: result.summary })] }), _jsx("div", { className: "w-32 flex-shrink-0", children: _jsx(DetectionBar, { pct: Number(result.detectionRatePct ?? 0) }) }), _jsx("span", { className: "text-xs text-gray-500 flex-shrink-0", children: new Date(result.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }), open ? _jsx(ChevronUp, { className: "h-4 w-4 text-gray-600" }) : _jsx(ChevronDown, { className: "h-4 w-4 text-gray-600" })] }), open && (_jsxs("div", { className: "px-5 pb-4 bg-gray-900/30 space-y-4", children: [_jsx("div", { className: "grid grid-cols-4 gap-3", children: [
                            { label: 'Events Injected', value: result.eventsInjected ?? 0 },
                            { label: 'Expected Rules', value: result.expectedRules?.length ?? 0 },
                            { label: 'Detections Found', value: result.detectionsFound ?? 0 },
                            { label: 'Duration', value: result.durationMs ? `${Math.round(result.durationMs / 1000)}s` : '—' },
                        ].map(s => (_jsxs("div", { className: "bg-gray-800/40 rounded-lg p-3 text-center", children: [_jsx("p", { className: "text-lg font-bold text-gray-100 tabular-nums", children: s.value }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: s.label })] }, s.label))) }), result.expectedRules?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2", children: "Expected Detections" }), _jsx("div", { className: "flex flex-wrap gap-2", children: result.expectedRules.map((r) => {
                                    const found = result.gapRules && !result.gapRules.includes(r);
                                    return (_jsxs("span", { className: clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium', found ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'), children: [found ? _jsx(CheckCircle2, { className: "h-3 w-3" }) : _jsx(XCircle, { className: "h-3 w-3" }), r] }, r));
                                }) })] })), result.mitreTechniques?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2", children: "MITRE ATT&CK" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: result.mitreTechniques.map((t) => (_jsx("span", { className: "text-xs font-mono text-gray-600 bg-gray-800 px-2 py-0.5 rounded border border-gray-700", children: t }, t))) })] })), result.gaps?.length > 0 && (_jsxs("div", { className: "p-3 rounded-lg bg-red-500/8 border border-red-500/20", children: [_jsx("p", { className: "text-xs font-semibold text-red-400 mb-2", children: "Detection Gaps" }), result.gaps.map((g, i) => (_jsxs("div", { className: "flex items-start gap-2 text-xs text-red-300 mb-1", children: [_jsx(XCircle, { className: "h-3 w-3 flex-shrink-0 mt-0.5" }), g] }, i)))] })), result.recommendations?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2", children: "Recommendations" }), result.recommendations.map((r, i) => (_jsxs("div", { className: "flex items-start gap-2 text-xs text-gray-400 mb-1.5", children: [_jsx(ArrowRight, { className: "h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" }), r] }, i)))] }))] }))] }));
}
// ─────────────────────────────────────────────
// SECURITY GRADE RING
// ─────────────────────────────────────────────
function GradeRing({ score, grade }) {
    const r = 54, c = 2 * Math.PI * r;
    const fill = (score / 100) * c;
    const colors = { A: '#22c55e', B: '#3b82f6', C: '#eab308', D: '#f97316', F: '#ef4444' };
    const color = colors[grade] ?? '#6b7280';
    return (_jsxs("div", { className: "relative inline-block", children: [_jsxs("svg", { width: "130", height: "130", viewBox: "0 0 130 130", children: [_jsx("circle", { cx: "65", cy: "65", r: r, fill: "none", stroke: "#1f2937", strokeWidth: "10" }), _jsx("circle", { cx: "65", cy: "65", r: r, fill: "none", stroke: color, strokeWidth: "10", strokeLinecap: "round", strokeDasharray: `${fill} ${c}`, transform: "rotate(-90 65 65)", style: { transition: 'stroke-dasharray .8s ease' } })] }), _jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [_jsx("span", { className: "text-4xl font-black", style: { color }, children: grade }), _jsxs("span", { className: "text-sm font-bold text-gray-400", children: [score, "/100"] })] })] }));
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function SecurityValidationPage() {
    const [runningId, setRunningId] = useState(null);
    const [tab, setTab] = useState('results');
    const qc = useQueryClient();
    const { data: scenariosData } = useQuery({
        queryKey: ['redteam', 'scenarios'],
        queryFn: () => fetch('/api/v1/redteam/scenarios', { headers: H() }).then(r => r.json()),
        staleTime: Infinity,
    });
    const { data: resultsData, isLoading: resLoad } = useQuery({
        queryKey: ['redteam', 'results'],
        queryFn: () => fetch('/api/v1/redteam/results?limit=30', { headers: H() }).then(r => r.json()),
        staleTime: 30_000,
        refetchInterval: 15_000,
    });
    const { data: scoreData } = useQuery({
        queryKey: ['redteam', 'score'],
        queryFn: () => fetch('/api/v1/redteam/security-score', { headers: H() }).then(r => r.json()),
        staleTime: 5 * 60_000,
        enabled: tab === 'score' || tab === 'results',
    });
    const { data: gapData } = useQuery({
        queryKey: ['redteam', 'gaps'],
        queryFn: () => fetch('/api/v1/redteam/gap-report', { headers: H() }).then(r => r.json()),
        staleTime: 5 * 60_000,
        enabled: tab === 'gaps',
    });
    const scenarios = scenariosData?.data ?? [];
    const results = resultsData?.data ?? [];
    const score = scoreData?.data;
    const gaps = gapData?.data;
    const passCount = results.filter((r) => r.evaluationStatus === 'pass').length;
    const failCount = results.filter((r) => r.evaluationStatus === 'fail').length;
    const runningCount = results.filter((r) => r.status === 'running').length;
    async function runScenario(scenarioId) {
        setRunningId(scenarioId ?? 'all');
        try {
            await fetch('/api/v1/redteam/run-simulation', {
                method: 'POST', headers: H(),
                body: JSON.stringify(scenarioId ? { scenarioId } : { runAll: false }),
            });
            await new Promise(r => setTimeout(r, 2000));
            qc.invalidateQueries({ queryKey: ['redteam', 'results'] });
            qc.invalidateQueries({ queryKey: ['redteam', 'score'] });
        }
        finally {
            setRunningId(null);
        }
    }
    return (_jsx(AppShell, { title: "Security Validation Lab", actions: _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold\n                          bg-green-500/10 text-green-400 border border-green-500/20", children: [_jsx(Lock, { className: "h-3.5 w-3.5" }), "Sandbox Mode \u00B7 No Real Actions"] }), _jsx(Button, { variant: "primary", size: "sm", icon: Play, disabled: !!runningId, onClick: () => runScenario(), children: runningId ? 'Running…' : 'Run Simulation' })] }), children: _jsxs(PageContent, { children: [_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6", children: [
                        { label: 'Scenarios Available', value: scenarios.length, icon: FlaskConical, color: 'text-blue-400' },
                        { label: 'Total Runs (30d)', value: results.length, icon: Activity, color: 'text-gray-200' },
                        { label: 'Passed', value: passCount, icon: CheckCircle2, color: 'text-green-400' },
                        { label: 'Failed / Gaps', value: failCount, icon: XCircle, color: failCount > 0 ? 'text-red-400' : 'text-gray-400' },
                        { label: 'Currently Running', value: runningCount, icon: RefreshCw, color: runningCount > 0 ? 'text-yellow-400 animate-pulse' : 'text-gray-500' },
                    ].map(k => (_jsxs(Card, { className: "flex items-center gap-3", children: [_jsx(k.icon, { className: clsx('h-5 w-5 flex-shrink-0', k.color) }), _jsxs("div", { children: [_jsx("p", { className: clsx('text-2xl font-bold tabular-nums', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500", children: k.label })] })] }, k.label))) }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "space-y-3", children: [_jsx("h3", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider", children: "Attack Scenarios" }), scenarios.length === 0
                                    ? _jsx("div", { className: "py-6 text-center text-xs text-gray-600", children: "Loading scenarios\u2026" })
                                    : scenarios.map((s) => {
                                        const catM = CAT_META[s.category] ?? { label: s.category, color: 'text-gray-400 bg-gray-800', icon: Shield };
                                        const Icon = catM.icon;
                                        return (_jsxs("div", { className: "rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("span", { className: clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium mb-2', catM.color), children: [_jsx(Icon, { className: "h-3 w-3" }), catM.label] }), _jsx("p", { className: "text-sm font-medium text-gray-200", children: s.name }), _jsxs("div", { className: "flex items-center gap-2 mt-1 text-xs text-gray-600", children: [_jsxs("span", { children: [s.stepCount, " steps"] }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { children: [s.totalEvents, " events"] }), _jsx("span", { children: "\u00B7" }), _jsx("span", { className: "font-mono", children: s.expectedRules?.[0] })] })] }), _jsxs("button", { onClick: () => runScenario(s.id), disabled: !!runningId, className: clsx('flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all', 'bg-blue-600 text-white hover:bg-blue-500', runningId && 'opacity-50 cursor-not-allowed'), children: [runningId === s.id
                                                                    ? _jsx(RefreshCw, { className: "h-3 w-3 animate-spin" })
                                                                    : _jsx(Play, { className: "h-3 w-3" }), "Run"] })] }), _jsx("div", { className: "flex gap-1 mt-2 flex-wrap", children: s.mitreTechniques?.map((t) => (_jsx("span", { className: "text-xs font-mono text-gray-700 bg-gray-800 px-1.5 py-0.5 rounded", children: t }, t))) })] }, s.id));
                                    })] }), _jsxs("div", { className: "lg:col-span-2 space-y-4", children: [score && (_jsx(Card, { children: _jsxs("div", { className: "flex items-center gap-6", children: [_jsx(GradeRing, { score: score.overallScore ?? 0, grade: score.overallGrade ?? 'F' }), _jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("h3", { className: "text-base font-bold text-gray-100", children: "Detection Coverage Score" }), _jsx(TrendIcon, { trend: score.trend })] }), _jsxs("p", { className: "text-xs text-gray-500 mb-3", children: ["Based on ", score.totalSimulations, " simulations \u00B7 ", score.passRate, "% pass rate"] }), _jsx("div", { className: "space-y-2", children: (score.categoryScores ?? []).map((c) => {
                                                            const m = CAT_META[c.category] ?? { label: c.category, color: 'text-gray-400', icon: Shield };
                                                            return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("span", { className: clsx('text-xs font-medium', m.color.split(' ')[0]), children: m.label }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(TrendIcon, { trend: c.trend }), _jsxs("span", { className: "text-xs text-gray-500", children: [c.trendDelta > 0 ? '+' : '', c.trendDelta, "%"] })] })] }), _jsx(DetectionBar, { pct: c.avgDetectionPct })] }, c.category));
                                                        }) }), score.criticalGaps?.length > 0 && (_jsxs("div", { className: "mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-red-500/8 border border-red-500/20", children: [_jsx(AlertTriangle, { className: "h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" }), _jsxs("p", { className: "text-xs text-red-400", children: [score.criticalGaps[0], score.criticalGaps.length > 1 && ` (+${score.criticalGaps.length - 1} more)`] })] }))] })] }) })), _jsx("div", { className: "flex items-center gap-1 border-b border-gray-800", children: [
                                        { id: 'results', label: 'Simulation History' },
                                        { id: 'gaps', label: 'Detection Gaps' },
                                    ].map(t => (_jsx("button", { onClick: () => setTab(t.id), className: clsx('px-4 py-2.5 text-sm font-medium border-b-2 transition-all', tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'), children: t.label }, t.id))) }), tab === 'results' && (_jsx(Card, { padding: "none", children: resLoad ? (_jsx("div", { className: "divide-y divide-gray-800", children: [...Array(4)].map((_, i) => (_jsxs("div", { className: "flex items-center gap-4 p-4", children: [_jsx("div", { className: "h-2.5 w-2.5 rounded-full bg-gray-800 animate-pulse flex-shrink-0" }), _jsxs("div", { className: "flex-1 space-y-1.5", children: [_jsx(Skeleton, { className: "h-4 w-40" }), _jsx(Skeleton, { className: "h-3 w-64" })] }), _jsx(Skeleton, { className: "h-2 w-32" })] }, i))) })) : results.length === 0 ? (_jsx(EmptyState, { icon: FlaskConical, title: "No simulations run yet", description: "Click 'Run Simulation' to start continuous security validation.", action: _jsx(Button, { variant: "primary", icon: Play, onClick: () => runScenario(), children: "Start First Simulation" }) })) : (results.map((r) => _jsx(SimResultRow, { result: r }, r.id))) })), tab === 'gaps' && (_jsx(Card, { children: !gaps ? (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx(RefreshCw, { className: "h-5 w-5 text-gray-600 animate-spin" }) })) : (_jsxs("div", { className: "space-y-5", children: [_jsx("div", { className: "grid grid-cols-3 gap-4", children: [
                                                    { label: 'Total Runs', value: gaps.totalRuns },
                                                    { label: 'Pass Rate', value: `${gaps.passRate}%`, color: gaps.passRate >= 80 ? 'text-green-400' : 'text-yellow-400' },
                                                    { label: 'Period', value: gaps.period },
                                                ].map(k => (_jsxs("div", { className: "bg-gray-800/40 rounded-lg p-3 text-center", children: [_jsx("p", { className: clsx('text-xl font-bold', k.color ?? 'text-gray-100'), children: k.value }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: k.label })] }, k.label))) }), gaps.topGapRules?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Rules with Most Gaps" }), gaps.topGapRules.map((r) => (_jsxs("div", { className: "flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(XCircle, { className: "h-3.5 w-3.5 text-red-400" }), _jsx("span", { className: "text-xs font-mono text-gray-300", children: r.rule })] }), _jsxs("span", { className: "text-xs text-red-400 font-bold", children: [r.failCount, "\u00D7 missed"] })] }, r.rule)))] })), gaps.scenariosWithGaps?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Detection Rate by Scenario" }), gaps.scenariosWithGaps.map((s) => (_jsxs("div", { className: "mb-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("span", { className: "text-xs text-gray-400", children: s.name }), _jsxs("span", { className: "text-xs text-gray-500", children: [s.count, "\u00D7 tested"] })] }), _jsx(DetectionBar, { pct: s.pct })] }, s.scenarioId)))] })), gaps.topGapRules?.length === 0 && gaps.scenariosWithGaps?.length === 0 && (_jsxs("div", { className: "text-center py-8", children: [_jsx(CheckCircle2, { className: "h-8 w-8 text-green-400 mx-auto mb-3" }), _jsx("p", { className: "text-sm text-gray-300 font-medium", children: "No detection gaps found" }), _jsx("p", { className: "text-xs text-gray-600 mt-1", children: "All simulated attacks were detected successfully" })] }))] })) }))] })] }), _jsxs("div", { className: "mt-6 flex items-start gap-3 p-4 rounded-xl bg-green-500/5 border border-green-500/15", children: [_jsx(Lock, { className: "h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-green-400 mb-1", children: "Sandbox Safety Guarantee" }), _jsxs("p", { className: "text-xs text-gray-500 leading-relaxed", children: ["All simulations use RFC 5737 TEST-NET IP addresses, synthetic ", _jsx("code", { className: "text-gray-400", children: "@sim.zonforge.internal" }), " identities, and are tagged with ", _jsx("code", { className: "text-gray-400", children: "_simulation:true" }), ". No real credentials are modified, no real data is accessed, and no real systems are contacted. Simulation events are automatically excluded from playbook auto-execution."] })] })] })] }) }));
}
