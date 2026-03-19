import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Card, Skeleton } from '@/components/shared/ui';
import { Brain, TrendingUp, TrendingDown, Minus, BarChart3, Send, RefreshCw, Zap, CheckCircle2, ArrowUp, ArrowDown, Cpu, Target, Globe, Star, Eye, } from 'lucide-react';
// ─────────────────────────────────────────────
const H = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
const THREAT_LEVEL_STYLE = {
    critical: 'text-red-400 bg-red-500/10 border-red-500/30',
    elevated: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    moderate: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    low: 'text-green-400 bg-green-500/10 border-green-500/30',
};
const BENCH_STATUS = {
    above: { icon: ArrowUp, color: 'text-green-400' },
    at: { icon: Minus, color: 'text-yellow-400' },
    below: { icon: ArrowDown, color: 'text-red-400' },
};
function ThreatBar({ likelihood }) {
    const color = likelihood >= 75 ? '#ef4444' : likelihood >= 55 ? '#f97316' : likelihood >= 35 ? '#eab308' : '#22c55e';
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex-1 h-2 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full transition-all duration-700", style: { width: `${likelihood}%`, background: color } }) }), _jsxs("span", { className: "text-xs font-bold w-10 text-right tabular-nums", style: { color }, children: [likelihood, "%"] })] }));
}
function SecurityChatWidget() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const endRef = useRef(null);
    const { data: suggestionsData } = useQuery({
        queryKey: ['assistant-suggestions'],
        queryFn: () => fetch('/api/v1/assistant/suggestions', { headers: H() }).then(r => r.json()),
        staleTime: 5 * 60_000,
    });
    const suggestions = suggestionsData?.data?.suggestions ?? [];
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    async function sendMessage(text) {
        if (!text.trim() || loading)
            return;
        setInput('');
        const userMsg = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);
        try {
            const r = await fetch('/api/v1/assistant/chat', {
                method: 'POST', headers: H(),
                body: JSON.stringify({
                    sessionId,
                    messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
                }),
            });
            const data = await r.json();
            if (data.success) {
                setSessionId(data.data.sessionId);
                setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: data.data.message ?? 'No response',
                        toolsUsed: data.data.toolsUsed,
                    }]);
            }
        }
        catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex-1 overflow-y-auto space-y-4 p-4 min-h-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800", children: [messages.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center h-full py-8", children: [_jsx("div", { className: "rounded-2xl bg-blue-500/10 p-4 mb-4", children: _jsx(Brain, { className: "h-8 w-8 text-blue-400" }) }), _jsx("p", { className: "text-sm font-semibold text-gray-300 mb-2", children: "ZonForge Security AI" }), _jsx("p", { className: "text-xs text-gray-500 text-center max-w-xs mb-5", children: "Ask me anything about your security posture, specific users, IPs, or recent incidents." }), _jsx("div", { className: "w-full space-y-2", children: suggestions.slice(0, 4).map((s) => (_jsx("button", { onClick: () => sendMessage(s), className: "w-full text-left text-xs text-gray-400 px-3 py-2 rounded-xl\n                             border border-gray-800 hover:border-blue-500/40 hover:bg-blue-500/5\n                             transition-all truncate", children: s }, s))) })] })) : (messages.map((msg, i) => (_jsx("div", { className: clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start'), children: _jsxs("div", { className: clsx('max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed', msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : 'bg-gray-800 text-gray-200 rounded-bl-none'), children: [_jsx("div", { className: "whitespace-pre-wrap", children: msg.content }), msg.toolsUsed && msg.toolsUsed.length > 0 && (_jsx("div", { className: "flex gap-1 mt-2 flex-wrap", children: msg.toolsUsed.map(t => (_jsxs("span", { className: "text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded", children: ["\uD83D\uDD27 ", t] }, t))) }))] }) }, i)))), loading && (_jsx("div", { className: "flex justify-start", children: _jsxs("div", { className: "bg-gray-800 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2", children: [_jsx(RefreshCw, { className: "h-3.5 w-3.5 text-blue-400 animate-spin" }), _jsx("span", { className: "text-xs text-gray-400", children: "Analyzing\u2026" })] }) })), _jsx("div", { ref: endRef })] }), _jsxs("div", { className: "flex-shrink-0 p-3 border-t border-gray-800", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", value: input, onChange: e => setInput(e.target.value), onKeyDown: e => e.key === 'Enter' && sendMessage(input), placeholder: "Ask about security events, users, IPs\u2026", className: "flex-1 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-xs\n                       text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" }), _jsx("button", { onClick: () => sendMessage(input), disabled: loading || !input.trim(), className: clsx('p-2 rounded-xl bg-blue-600 text-white transition-all', (loading || !input.trim()) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'), children: _jsx(Send, { className: "h-4 w-4" }) })] }), _jsx("p", { className: "text-xs text-gray-600 mt-1.5 text-center", children: "Powered by claude-sonnet-4-6 \u00B7 Real-time data access" })] })] }));
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function AiIntelligencePage() {
    const [tab, setTab] = useState('forecast');
    const [expandedPath, setExpandedPath] = useState(null);
    const { data: forecastData, isLoading: fcLoad } = useQuery({
        queryKey: ['threat-forecast'],
        queryFn: () => fetch('/api/v1/ai/threat-forecast', { headers: H() }).then(r => r.json()),
        staleTime: 60 * 60_000,
        enabled: tab === 'forecast',
    });
    const { data: benchData, isLoading: bchLoad } = useQuery({
        queryKey: ['benchmark'],
        queryFn: () => fetch('/api/v1/ai/benchmark', { headers: H() }).then(r => r.json()),
        staleTime: 30 * 60_000,
        enabled: tab === 'benchmark',
    });
    const { data: behavioralData } = useQuery({
        queryKey: ['behavioral-stats'],
        queryFn: () => fetch('/api/v1/behavioral/stats', { headers: H() }).then(r => r.json()),
        staleTime: 5 * 60_000,
    });
    const { data: triageData } = useQuery({
        queryKey: ['triage-queue'],
        queryFn: () => fetch('/api/v1/triage/queue?limit=10', { headers: H() }).then(r => r.json()),
        staleTime: 30_000,
        refetchInterval: 30_000,
        enabled: tab === 'triage',
    });
    const forecast = forecastData?.data;
    const benchmark = benchData?.data;
    const bStats = behavioralData?.data;
    const triageQ = triageData?.data ?? [];
    return (_jsx(AppShell, { title: "AI Intelligence", actions: _jsx("div", { className: "flex items-center gap-2", children: _jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20", children: [_jsx(Cpu, { className: "h-3.5 w-3.5" }), "5 AI Systems Active"] }) }), children: _jsx(PageContent, { children: _jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-3 gap-6", style: { minHeight: 'calc(100vh - 160px)' }, children: [_jsxs("div", { className: "xl:col-span-2 flex flex-col gap-4", children: [_jsx("div", { className: "flex items-center gap-1 border-b border-gray-800", children: [
                                    { id: 'forecast', label: 'Threat Forecast', icon: Target },
                                    { id: 'triage', label: 'Smart Triage', icon: Zap },
                                    { id: 'behavioral', label: 'Behavioral AI', icon: Eye },
                                    { id: 'benchmark', label: 'Benchmarks', icon: BarChart3 },
                                ].map(t => (_jsxs("button", { onClick: () => setTab(t.id), className: clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all', tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'), children: [_jsx(t.icon, { className: "h-4 w-4" }), t.label] }, t.id))) }), tab === 'forecast' && (_jsx("div", { className: "space-y-4", children: fcLoad ? _jsx(Skeleton, { className: "h-64 w-full" }) : !forecast ? null : (_jsxs(_Fragment, { children: [_jsxs("div", { className: clsx('rounded-2xl border p-5', THREAT_LEVEL_STYLE[forecast.overallThreatLevel] ?? 'bg-gray-900 border-gray-800'), children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wider text-gray-400", children: "72-Hour Threat Forecast" }), _jsxs("h2", { className: "text-2xl font-black mt-1", children: [forecast.overallThreatLevel?.toUpperCase(), " THREAT LEVEL"] })] }), _jsx(Target, { className: "h-10 w-10 opacity-50" })] }), _jsx("div", { className: "flex flex-wrap gap-2", children: forecast.topRisks?.map((r, i) => (_jsx("span", { className: "text-xs bg-black/20 px-3 py-1 rounded-full", children: r }, i))) })] }), _jsx("div", { className: "space-y-3", children: forecast.categories?.map((cat) => (_jsxs(Card, { children: [_jsxs("div", { className: "flex items-start justify-between gap-4 mb-3", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200", children: cat.category }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: cat.recommendation })] }), _jsxs("div", { className: "flex items-center gap-1.5 flex-shrink-0", children: [cat.trend === 'increasing' ? _jsx(TrendingUp, { className: "h-4 w-4 text-red-400" })
                                                                        : cat.trend === 'decreasing' ? _jsx(TrendingDown, { className: "h-4 w-4 text-green-400" })
                                                                            : _jsx(Minus, { className: "h-4 w-4 text-gray-500" }), _jsx("span", { className: "text-xs text-gray-500 capitalize", children: cat.trend })] })] }), _jsx(ThreatBar, { likelihood: cat.likelihood }), cat.signals?.length > 0 && (_jsx("div", { className: "mt-3 space-y-1", children: cat.signals.slice(0, 2).map((s, i) => (_jsxs("div", { className: "text-xs text-gray-600 flex items-center gap-1.5", children: [_jsx("span", { className: "h-1 w-1 rounded-full bg-gray-600 flex-shrink-0" }), s] }, i))) }))] }, cat.category))) }), _jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Active Global Campaigns" }), forecast.activeGlobalCampaigns?.map((c, i) => (_jsxs("div", { className: "flex items-start gap-2 text-xs text-gray-400 mb-2", children: [_jsx(Globe, { className: "h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" }), c] }, i)))] })] })) })), tab === 'triage' && (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/15", children: [_jsx(Zap, { className: "h-4 w-4 text-blue-400 flex-shrink-0" }), _jsx("p", { className: "text-xs text-gray-400", children: "AI-sorted alert queue using asset criticality, threat intel, behavioral deviation, blast radius, and dwell time." })] }), _jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "px-5 py-2.5 border-b border-gray-800 grid text-xs font-semibold text-gray-500 uppercase tracking-wider", style: { gridTemplateColumns: '80px 1fr 100px 80px' }, children: [_jsx("span", { children: "AI Score" }), _jsx("span", { children: "Alert" }), _jsx("span", { children: "AI Priority" }), _jsx("span", { children: "Time" })] }), triageQ.length === 0 ? (_jsx("div", { className: "flex items-center justify-center py-10 text-xs text-gray-600", children: "No open alerts \u00B7 Queue clear" })) : (triageQ.map((a) => (_jsxs("div", { className: "grid items-center gap-4 px-5 py-3.5 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20", style: { gridTemplateColumns: '80px 1fr 100px 80px' }, children: [_jsx("div", { className: "flex items-center gap-2", children: _jsx("span", { className: "text-xl font-black tabular-nums", style: { color: a.aiUrgencyScore >= 75 ? '#ef4444' : a.aiUrgencyScore >= 55 ? '#f97316' : a.aiUrgencyScore >= 35 ? '#eab308' : '#22c55e' }, children: a.aiUrgencyScore }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm text-gray-200 truncate", children: a.title }), _jsx("p", { className: "text-xs text-gray-600 truncate", children: a.analystGuidance?.slice(0, 80) }), a.priorityChanged && (_jsxs("span", { className: "text-xs text-yellow-400", children: [a.priority, " \u2192 ", a.aiPriority, " (re-prioritized)"] }))] }), _jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-bold', a.aiPriority === 'P0' ? 'bg-red-600 text-white' :
                                                            a.aiPriority === 'P1' ? 'bg-red-500/15 text-red-400' :
                                                                a.aiPriority === 'P2' ? 'bg-orange-500/15 text-orange-400' :
                                                                    'bg-gray-700 text-gray-400'), children: a.aiPriority }), _jsx("span", { className: "text-xs text-gray-600", children: new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })] }, a.id))))] })] })), tab === 'behavioral' && (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "grid grid-cols-3 gap-4", children: [
                                            { label: 'User Profiles', value: bStats?.totalProfiles ?? '—', icon: Eye, color: 'text-blue-400' },
                                            { label: 'Stable Baselines', value: bStats?.stableProfiles ?? '—', icon: CheckCircle2, color: 'text-green-400' },
                                            { label: 'Avg Confidence', value: bStats ? `${bStats.avgConfidence}%` : '—', icon: Brain, color: 'text-purple-400' },
                                        ].map(k => (_jsxs(Card, { className: "text-center", children: [_jsx(k.icon, { className: clsx('h-5 w-5 mx-auto mb-2', k.color) }), _jsx("p", { className: clsx('text-2xl font-bold tabular-nums', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500", children: k.label })] }, k.label))) }), _jsxs(Card, { children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200 mb-4", children: "How Behavioral AI Works" }), _jsx("div", { className: "space-y-3", children: [
                                                    { step: '1', label: 'Profile Building', desc: '30-day rolling window per user — login times, locations, file access patterns, peer comparison' },
                                                    { step: '2', label: 'Real-Time Scoring', desc: 'Every event scored against baseline — z-score, IQR fence, peer percentile, location novelty' },
                                                    { step: '3', label: 'Anomaly Detection', desc: 'Deviations flagged with severity, z-score, and human-readable deviation explanation' },
                                                    { step: '4', label: 'Alert Enrichment', desc: 'Alert priority boosted when behavioral anomaly accompanies security event' },
                                                ].map(s => (_jsxs("div", { className: "flex gap-3", children: [_jsx("span", { className: "h-6 w-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0", children: s.step }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-300", children: s.label }), _jsx("p", { className: "text-xs text-gray-500 leading-relaxed", children: s.desc })] })] }, s.step))) })] }), _jsxs("div", { className: "p-4 rounded-xl bg-green-500/5 border border-green-500/15", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx(CheckCircle2, { className: "h-4 w-4 text-green-400" }), _jsx("p", { className: "text-xs font-semibold text-green-400", children: "Impact: 80% False Positive Reduction" })] }), _jsx("p", { className: "text-xs text-gray-500", children: "By establishing individual behavioral baselines, ZonForge reduces noise from generic threshold rules. Example: 100 file downloads at 2am by alice@acme.com (who always works nights) = NOT an alert. 100 downloads at 2am by bob@acme.com (who never works nights) = HIGH severity alert." })] })] })), tab === 'benchmark' && (_jsx("div", { className: "space-y-4", children: bchLoad ? _jsx(Skeleton, { className: "h-64 w-full" }) : !benchmark ? null : (_jsxs(_Fragment, { children: [_jsx(Card, { className: "text-center", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "text-left", children: [_jsx("p", { className: "text-xs text-gray-500 uppercase tracking-wider mb-1", children: "Your Security Ranking" }), _jsxs("p", { className: "text-4xl font-black text-blue-400", children: [benchmark.percentile, "th"] }), _jsx("p", { className: "text-sm text-gray-400", children: "percentile in your industry" }), benchmark.achievementBadges?.length > 0 && (_jsx("div", { className: "flex gap-2 mt-3 flex-wrap", children: benchmark.achievementBadges.map((b) => (_jsx("span", { className: "text-xs bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded-lg border border-yellow-500/20", children: b }, b))) }))] }), _jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-xs text-gray-500 mb-1", children: "Your Score" }), _jsx("p", { className: "text-3xl font-black text-gray-100", children: benchmark.overallScore }), _jsxs("p", { className: "text-xs text-gray-600", children: ["Industry median: ", benchmark.industryMedian] })] })] }) }), _jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "px-5 py-2.5 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider grid", style: { gridTemplateColumns: '1fr 80px 80px 100px' }, children: [_jsx("span", { children: "Dimension" }), _jsx("span", { className: "text-right", children: "Yours" }), _jsx("span", { className: "text-right", children: "Industry" }), _jsx("span", { className: "text-right", children: "Gap to Top 25%" })] }), benchmark.dimensions?.map((d) => {
                                                    const ST = BENCH_STATUS[d.status] ?? BENCH_STATUS['at'];
                                                    return (_jsxs("div", { className: "grid items-center gap-4 px-5 py-3.5 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20", style: { gridTemplateColumns: '1fr 80px 80px 100px' }, children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ST.icon, { className: clsx('h-3.5 w-3.5', ST.color) }), _jsx("p", { className: "text-sm text-gray-200", children: d.name })] }), d.status === 'below' && d.improvementSteps?.[0] && (_jsx("p", { className: "text-xs text-gray-600 mt-0.5 ml-5", children: d.improvementSteps[0] }))] }), _jsx("p", { className: clsx('text-sm font-bold text-right', ST.color), children: d.yourValue }), _jsx("p", { className: "text-sm text-gray-500 text-right", children: d.industryMedian }), _jsx("p", { className: clsx('text-xs text-right', d.status === 'above' ? 'text-green-400' : 'text-gray-500'), children: d.gapToTop25 })] }, d.name));
                                                })] }), benchmark.upgradeRecommendation && (_jsxs("div", { className: "p-4 rounded-xl bg-blue-500/8 border border-blue-500/20", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx(Star, { className: "h-4 w-4 text-blue-400" }), _jsx("p", { className: "text-xs font-bold text-blue-400", children: "Upgrade Recommendation" }), _jsxs("span", { className: "ml-auto text-xs text-gray-600", children: [benchmark.upgradeRecommendation.currentPlan, " \u2192 ", benchmark.upgradeRecommendation.recommendedPlan] })] }), _jsx("p", { className: "text-xs text-gray-400 mb-1", children: benchmark.upgradeRecommendation.reason }), _jsx("p", { className: "text-xs text-blue-400 font-medium", children: benchmark.upgradeRecommendation.estimatedValue })] }))] })) }))] }), _jsxs("div", { className: "flex flex-col", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(Brain, { className: "h-4 w-4 text-blue-400" }), _jsx("h3", { className: "text-sm font-semibold text-gray-200", children: "Security AI Assistant" }), _jsx("span", { className: "ml-auto text-xs text-gray-600", children: "claude-sonnet-4-6" })] }), _jsx(Card, { padding: "none", className: "flex-1 flex flex-col overflow-hidden", style: { minHeight: '600px' }, children: _jsx(SecurityChatWidget, {}) })] })] }) }) }));
}
