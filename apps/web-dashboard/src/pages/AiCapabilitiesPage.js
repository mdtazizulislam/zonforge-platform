import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card, Skeleton, EmptyState } from '@/components/shared/ui';
import { Brain, TrendingUp, MessageSquare, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, Send, User, Bot, Activity, Target, BarChart3, Eye, Cpu, } from 'lucide-react';
// ─────────────────────────────────────────────
const H = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
const THREAT_LEVEL_STYLE = {
    critical: 'text-red-400 bg-red-500/10 border-red-500/20',
    elevated: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    guarded: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    low: 'text-green-400 bg-green-500/10 border-green-500/20',
};
const CONFIDENCE_COLOR = {
    very_high: 'text-red-400', high: 'text-orange-400',
    medium: 'text-yellow-400', low: 'text-blue-400',
};
function ProbabilityBar({ value, label }) {
    const color = value >= 75 ? '#ef4444' : value >= 55 ? '#f97316' : value >= 35 ? '#eab308' : '#22c55e';
    return (_jsxs("div", { className: "flex items-center gap-2", children: [label && _jsx("span", { className: "text-xs text-gray-500 w-20 flex-shrink-0 truncate", children: label }), _jsx("div", { className: "flex-1 h-2 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full transition-all duration-700", style: { width: `${value}%`, background: color } }) }), _jsxs("span", { className: "text-xs font-bold tabular-nums w-10 text-right", style: { color }, children: [value, "%"] })] }));
}
// ─────────────────────────────────────────────
// TAB: BEHAVIORAL AI
// ─────────────────────────────────────────────
function BehavioralAiTab() {
    const [selectedUser, setSelectedUser] = useState(null);
    const [checkEmail, setCheckEmail] = useState('');
    const [checkResult, setCheckResult] = useState(null);
    const [checking, setChecking] = useState(false);
    const { data: profilesData, isLoading } = useQuery({
        queryKey: ['behavioral-profiles'],
        queryFn: () => fetch('/api/v1/behavioral/profiles?limit=20', { headers: H() }).then(r => r.json()),
        staleTime: 5 * 60_000,
        refetchInterval: 5 * 60_000,
    });
    const profiles = profilesData?.data ?? [];
    const anomalyCount = profiles.filter((p) => (p.currentAnomalyScore ?? 0) >= 50).length;
    async function checkDeviation() {
        if (!checkEmail.trim())
            return;
        setChecking(true);
        setCheckResult(null);
        const r = await fetch('/api/v1/behavioral/check-deviation', {
            method: 'POST', headers: H(),
            body: JSON.stringify({ userId: checkEmail, dimensions: ['login_time', 'file_access_volume', 'login_location'] }),
        });
        const data = await r.json();
        setCheckResult(data.data);
        setChecking(false);
    }
    async function buildProfile(userId) {
        await fetch('/api/v1/behavioral/profiles', {
            method: 'POST', headers: H(),
            body: JSON.stringify({ userId, lookbackDays: 30 }),
        });
    }
    return (_jsxs("div", { className: "space-y-5", children: [_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4", children: [
                    { label: 'Profiles Built', value: profiles.length, icon: Brain, color: 'text-blue-400' },
                    { label: 'Anomalies Active', value: anomalyCount, icon: AlertTriangle, color: anomalyCount > 0 ? 'text-red-400' : 'text-gray-500' },
                    { label: 'Avg Accuracy', value: '94%', icon: Target, color: 'text-green-400' },
                    { label: 'False Positive Cut', value: '~80%', icon: CheckCircle2, color: 'text-green-400' },
                ].map(k => (_jsxs(Card, { className: "flex items-center gap-3", children: [_jsx(k.icon, { className: clsx('h-5 w-5 flex-shrink-0', k.color) }), _jsxs("div", { children: [_jsx("p", { className: clsx('text-2xl font-bold tabular-nums', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500", children: k.label })] })] }, k.label))) }), _jsxs(Card, { children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(Brain, { className: "h-4 w-4 text-blue-400" }), _jsx("h3", { className: "text-sm font-semibold text-gray-200", children: "How Behavioral AI Works" })] }), _jsx("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-3 text-center text-xs", children: [
                            { icon: '📊', title: '30-day Window', desc: 'Learns each user\'s normal behavior from 30-day history' },
                            { icon: '📐', title: '10 Dimensions', desc: 'Login time, location, files, downloads, peers, and more' },
                            { icon: '📈', title: 'Z-score + IQR', desc: 'Statistical outlier detection per dimension' },
                            { icon: '👥', title: 'Peer Comparison', desc: 'Compare against cohort of similar users' },
                            { icon: '🔔', title: 'Explainable', desc: 'Shows exactly which dimension triggered and by how much' },
                        ].map(s => (_jsxs("div", { className: "bg-gray-800/30 rounded-lg p-3", children: [_jsx("div", { className: "text-2xl mb-1", children: s.icon }), _jsx("p", { className: "font-semibold text-gray-200 mb-0.5", children: s.title }), _jsx("p", { className: "text-gray-500", children: s.desc })] }, s.title))) })] }), _jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Real-time Deviation Check" }), _jsxs("div", { className: "flex gap-2 mb-3", children: [_jsx("input", { type: "text", value: checkEmail, onChange: e => setCheckEmail(e.target.value), onKeyDown: e => e.key === 'Enter' && checkDeviation(), placeholder: "user@acme.com or user ID", className: "flex-1 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" }), _jsx(Button, { variant: "primary", size: "sm", icon: checking ? RefreshCw : Eye, disabled: checking || !checkEmail.trim(), onClick: checkDeviation, children: checking ? 'Checking…' : 'Check' })] }), checkResult && (_jsxs("div", { className: clsx('p-4 rounded-xl border', (checkResult.deviationScore ?? 0) >= 70 ? 'bg-red-500/8 border-red-500/20' :
                            (checkResult.deviationScore ?? 0) >= 40 ? 'bg-yellow-500/8 border-yellow-500/20' :
                                'bg-green-500/5 border-green-500/15'), children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("p", { className: "text-sm font-semibold text-gray-200", children: checkResult.userId }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs text-gray-500", children: "Deviation Score" }), _jsx("span", { className: clsx('text-lg font-black', checkResult.deviationScore >= 70 ? 'text-red-400' :
                                                    checkResult.deviationScore >= 40 ? 'text-yellow-400' : 'text-green-400'), children: checkResult.deviationScore ?? 0 })] })] }), checkResult.dimensionScores?.length > 0 && (_jsx("div", { className: "space-y-2", children: checkResult.dimensionScores.slice(0, 5).map((d) => (_jsx(ProbabilityBar, { value: d.score ?? 0, label: d.dimension.replace(/_/g, ' ') }, d.dimension))) })), checkResult.explanation && (_jsx("p", { className: "mt-3 text-xs text-gray-400 leading-relaxed", children: checkResult.explanation }))] }))] }), profiles.length > 0 && (_jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider", children: ["User Behavioral Profiles (", profiles.length, ")"] }), _jsx("div", { className: "divide-y divide-gray-800/50", children: profiles.map((p) => (_jsxs("div", { className: "flex items-center gap-4 px-5 py-3.5", children: [_jsx("div", { className: "h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0", children: p.userId?.[0]?.toUpperCase() }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm text-gray-200 truncate", children: p.userId }), _jsxs("p", { className: "text-xs text-gray-600", children: [p.profileDays ?? 30, "d profile \u00B7 ", p.totalEventCount ?? 0, " events"] })] }), _jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [(p.currentAnomalyScore ?? 0) >= 50 && (_jsxs("span", { className: "text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded", children: ["anomaly ", p.currentAnomalyScore] })), _jsx("span", { className: "text-xs text-gray-600 font-mono", children: new Date(p.builtAt ?? p.updatedAt).toLocaleDateString() })] })] }, p.userId))) })] })), profiles.length === 0 && !isLoading && (_jsx(EmptyState, { icon: Brain, title: "No behavioral profiles yet", description: "Profiles are built automatically as users generate events. Initial profiles appear after 7-14 days of data.", action: _jsx(Button, { variant: "outline", size: "sm", onClick: () => buildProfile('alice@acme.com'), children: "Build Test Profile" }) }))] }));
}
// ─────────────────────────────────────────────
// TAB: PREDICTIVE INTEL
// ─────────────────────────────────────────────
function PredictiveTab() {
    const [expanded, setExpanded] = useState(null);
    const { data: forecastData, isLoading, refetch } = useQuery({
        queryKey: ['threat-forecast'],
        queryFn: () => fetch('/api/v1/predict/forecast?horizon=72h', { headers: H() }).then(r => r.json()),
        staleTime: 30 * 60_000,
        refetchInterval: 30 * 60_000,
    });
    const { data: campaignsData } = useQuery({
        queryKey: ['threat-campaigns'],
        queryFn: () => fetch('/api/v1/predict/campaigns', { headers: H() }).then(r => r.json()),
        staleTime: Infinity,
    });
    const forecast = forecastData?.data;
    const campaigns = campaignsData?.data ?? [];
    const THREAT_LEVEL_LABELS = {
        critical: '🔴 CRITICAL', elevated: '🟠 ELEVATED', guarded: '🟡 GUARDED', low: '🟢 LOW',
    };
    return (_jsxs("div", { className: "space-y-5", children: [forecast && (_jsxs("div", { className: clsx('flex items-center justify-between p-5 rounded-2xl border', THREAT_LEVEL_STYLE[forecast.overallThreatLevel]), children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wider mb-1", children: "Current Threat Level" }), _jsx("p", { className: clsx('text-3xl font-black', THREAT_LEVEL_STYLE[forecast.overallThreatLevel]?.split(' ')[0]), children: THREAT_LEVEL_LABELS[forecast.overallThreatLevel] }), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: ["Forecast window: next 72 hours \u00B7 ", forecast.predictions?.length ?? 0, " active predictions"] })] }), _jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-5xl font-black", style: { color: forecast.overallThreatLevel === 'critical' ? '#ef4444' : forecast.overallThreatLevel === 'elevated' ? '#f97316' : '#eab308' }, children: forecast.overallThreatScore }), _jsx("p", { className: "text-xs text-gray-500", children: "Threat Score" }), _jsxs("button", { onClick: () => refetch(), className: "mt-2 text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 ml-auto", children: [_jsx(RefreshCw, { className: "h-3 w-3" }), " Refresh"] })] })] })), isLoading ? (_jsx("div", { className: "space-y-3", children: [...Array(3)].map((_, i) => _jsx(Skeleton, { className: "h-24 rounded-xl" }, i)) })) : (_jsx("div", { className: "space-y-3", children: (forecast?.predictions ?? []).map((p) => (_jsxs("div", { className: "rounded-xl border border-gray-800 overflow-hidden", children: [_jsxs("button", { onClick: () => setExpanded(expanded === p.id ? null : p.id), className: "w-full flex items-center gap-4 p-4 hover:bg-gray-800/20 transition-colors text-left", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("span", { className: clsx('text-xs font-bold uppercase', CONFIDENCE_COLOR[p.confidence]), children: p.confidence?.replace('_', ' ') }), _jsxs("span", { className: "text-xs text-gray-600", children: [p.horizon, " window"] })] }), _jsx("p", { className: "text-sm font-semibold text-gray-200", children: p.title }), _jsx("div", { className: "flex flex-wrap gap-1 mt-1", children: p.mitreTechniques?.slice(0, 3).map((t) => (_jsx("span", { className: "text-xs font-mono text-gray-700 bg-gray-800 px-1.5 py-0.5 rounded", children: t }, t))) })] }), _jsx("div", { className: "w-28 flex-shrink-0", children: _jsx(ProbabilityBar, { value: p.probability }) }), expanded === p.id ? _jsx(ChevronUp, { className: "h-4 w-4 text-gray-600" }) : _jsx(ChevronDown, { className: "h-4 w-4 text-gray-600" })] }), expanded === p.id && (_jsxs("div", { className: "px-4 pb-4 space-y-3 bg-gray-900/30", children: [_jsx("p", { className: "text-xs text-gray-400 leading-relaxed", children: p.description }), p.reasoning?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-500 font-semibold mb-1.5", children: "Supporting Signals" }), p.reasoning.map((r, i) => (_jsxs("div", { className: "flex items-start gap-2 text-xs text-gray-500 mb-1", children: [_jsx("span", { className: "text-blue-400 flex-shrink-0", children: "\u2192" }), r] }, i)))] })), p.affectedAssets?.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-500 font-semibold mb-1.5", children: "Potentially Affected" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: p.affectedAssets.map((a) => (_jsx("span", { className: "text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded", children: a }, a))) })] })), p.recommendedActions?.length > 0 && (_jsxs("div", { className: "p-3 rounded-lg bg-blue-500/5 border border-blue-500/15", children: [_jsx("p", { className: "text-xs text-blue-400 font-semibold mb-2", children: "Recommended Actions" }), p.recommendedActions.map((a, i) => (_jsxs("div", { className: "flex items-start gap-2 text-xs text-gray-400 mb-1", children: [_jsxs("span", { className: "text-blue-400", children: [i + 1, "."] }), a] }, i)))] }))] }))] }, p.id))) })), campaigns.length > 0 && (_jsxs(Card, { children: [_jsxs("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4", children: ["Active Threat Campaigns (", campaigns.length, ")"] }), _jsx("div", { className: "space-y-3", children: campaigns.map((c) => (_jsxs("div", { className: "rounded-lg border border-gray-800 p-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-gray-200", children: c.name }), c.actor && _jsx("p", { className: "text-xs text-gray-500", children: c.actor })] }), _jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-bold flex-shrink-0', c.severity === 'critical' ? 'bg-red-500/15 text-red-400' : c.severity === 'high' ? 'bg-orange-500/15 text-orange-400' : 'bg-yellow-500/15 text-yellow-400'), children: c.severity })] }), _jsx("p", { className: "text-xs text-gray-500 leading-relaxed mb-2", children: c.description }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: c.techniques?.map((t) => (_jsx("span", { className: "text-xs font-mono text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded", children: t }, t))) })] }, c.id))) })] }))] }));
}
function SecurityAssistantTab() {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: '👋 I\'m your AI Security Assistant. I can help you investigate alerts, look up entity activity, explain threats, run hunt queries, and answer any security question about your environment.\n\nTry asking:\n• "What are our latest critical alerts?"\n• "What has alice@acme.com been doing this week?"\n• "Explain T1110 brute force attacks"\n• "What\'s our current risk posture?"',
            time: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    const QUICK_PROMPTS = [
        'Latest critical alerts',
        'Top risk users',
        'Explain brute force attack',
        'What should I investigate first?',
        'Run credential attack hunt',
    ];
    async function sendMessage(text) {
        if (!text.trim() || sending)
            return;
        setInput('');
        setSending(true);
        setMessages(m => [...m, { role: 'user', content: text, time: new Date() }]);
        try {
            const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
            const r = await fetch('/api/v1/assistant/chat', {
                method: 'POST', headers: H(),
                body: JSON.stringify({
                    message: text,
                    conversationHistory: history,
                }),
            });
            const data = await r.json();
            const reply = data.data?.message ?? data.error?.message ?? 'Sorry, I encountered an error.';
            setMessages(m => [...m, { role: 'assistant', content: reply, time: new Date() }]);
        }
        catch {
            setMessages(m => [...m, { role: 'assistant', content: 'Network error. Please try again.', time: new Date() }]);
        }
        finally {
            setSending(false);
        }
    }
    return (_jsxs("div", { className: "flex flex-col h-full", style: { minHeight: '600px' }, children: [_jsx("div", { className: "flex gap-2 mb-4 flex-wrap", children: [
                    { icon: AlertTriangle, label: 'Alert Investigation' },
                    { icon: Activity, label: 'Entity Lookup' },
                    { icon: BarChart3, label: 'Risk Posture' },
                    { icon: Target, label: 'Threat Hunting' },
                    { icon: Cpu, label: 'AI-Powered' },
                ].map(c => (_jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-gray-500 bg-gray-800/50", children: [_jsx(c.icon, { className: "h-3 w-3" }), c.label] }, c.label))) }), _jsx("div", { className: "flex gap-2 mb-4 flex-wrap", children: QUICK_PROMPTS.map(p => (_jsx("button", { onClick: () => sendMessage(p), disabled: sending, className: "px-3 py-1.5 rounded-full border border-gray-700 text-xs text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors", children: p }, p))) }), _jsxs("div", { className: "flex-1 overflow-y-auto space-y-4 mb-4 pr-1", style: { scrollbarWidth: 'thin', scrollbarColor: '#1f2937 transparent' }, children: [messages.map((m, i) => (_jsxs("div", { className: clsx('flex gap-3', m.role === 'user' && 'flex-row-reverse'), children: [_jsx("div", { className: clsx('h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold', m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-blue-400'), children: m.role === 'user' ? _jsx(User, { className: "h-3.5 w-3.5" }) : _jsx(Bot, { className: "h-3.5 w-3.5" }) }), _jsxs("div", { className: clsx('max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed', m.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-sm'
                                    : 'bg-gray-800 text-gray-200 rounded-tl-sm'), children: [_jsx("div", { className: "whitespace-pre-wrap", children: m.content }), _jsx("p", { className: "text-xs opacity-50 mt-1.5 text-right", children: m.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })] })] }, i))), sending && (_jsxs("div", { className: "flex gap-3", children: [_jsx("div", { className: "h-7 w-7 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0", children: _jsx(Bot, { className: "h-3.5 w-3.5 text-blue-400" }) }), _jsx("div", { className: "bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3", children: _jsx("div", { className: "flex gap-1", children: [...Array(3)].map((_, i) => (_jsx("div", { className: "h-1.5 w-1.5 rounded-full bg-gray-500 animate-bounce", style: { animationDelay: `${i * 0.15}s` } }, i))) }) })] })), _jsx("div", { ref: bottomRef })] }), _jsxs("div", { className: "flex gap-2 border-t border-gray-800 pt-4", children: [_jsx("input", { type: "text", value: input, onChange: e => setInput(e.target.value), onKeyDown: e => e.key === 'Enter' && !e.shiftKey && sendMessage(input), placeholder: "Ask anything about your security environment\u2026", className: "flex-1 px-4 py-2.5 rounded-xl border border-gray-700 bg-gray-800\n                     text-sm text-gray-200 placeholder-gray-600\n                     focus:outline-none focus:border-blue-500 transition-colors" }), _jsx("button", { onClick: () => sendMessage(input), disabled: sending || !input.trim(), className: clsx('px-4 py-2.5 rounded-xl font-medium text-sm transition-all', 'bg-blue-600 text-white hover:bg-blue-500', (sending || !input.trim()) && 'opacity-50 cursor-not-allowed'), children: _jsx(Send, { className: "h-4 w-4" }) })] })] }));
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function AiCapabilitiesPage() {
    const [tab, setTab] = useState('predictive');
    return (_jsx(AppShell, { title: "AI Capabilities", children: _jsxs(PageContent, { children: [_jsxs("div", { className: "mb-6", children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [_jsx("div", { className: "rounded-xl bg-blue-500/20 p-2.5", children: _jsx(Brain, { className: "h-6 w-6 text-blue-400" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-base font-bold text-gray-100", children: "AI-Powered Security Intelligence" }), _jsx("p", { className: "text-xs text-gray-500", children: "Three AI engines working together to protect your organization" })] })] }), _jsx("div", { className: "grid grid-cols-3 gap-3", children: [
                                { id: 'behavioral', icon: Activity, title: 'Behavioral AI', sub: 'Per-user baseline learning', color: 'blue' },
                                { id: 'predictive', icon: TrendingUp, title: 'Predictive Intel', sub: '72h threat forecasting', color: 'orange' },
                                { id: 'assistant', icon: MessageSquare, title: 'Security Assistant', sub: 'AI-powered chat + investigation', color: 'green' },
                            ].map(t => (_jsxs("button", { onClick: () => setTab(t.id), className: clsx('p-4 rounded-xl border text-left transition-all', tab === t.id
                                    ? t.color === 'blue' ? 'bg-blue-500/10 border-blue-500/30'
                                        : t.color === 'orange' ? 'bg-orange-500/10 border-orange-500/30'
                                            : 'bg-green-500/10 border-green-500/30'
                                    : 'bg-gray-900 border-gray-800 hover:border-gray-700'), children: [_jsx(t.icon, { className: clsx('h-5 w-5 mb-2', tab === t.id
                                            ? t.color === 'blue' ? 'text-blue-400' : t.color === 'orange' ? 'text-orange-400' : 'text-green-400'
                                            : 'text-gray-500') }), _jsx("p", { className: "text-sm font-semibold text-gray-200", children: t.title }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: t.sub })] }, t.id))) })] }), tab === 'behavioral' && _jsx(BehavioralAiTab, {}), tab === 'predictive' && _jsx(PredictiveTab, {}), tab === 'assistant' && _jsx(SecurityAssistantTab, {})] }) }));
}
