import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card, Skeleton, EmptyState } from '@/components/shared/ui';
import { Brain, CheckCircle2, AlertTriangle, Clock, Play, ChevronDown, ChevronUp, RefreshCw, Shield, Search, FileText, Wrench, Eye, TrendingUp, ArrowRight, Cpu, MessageSquare, } from 'lucide-react';
// ─────────────────────────────────────────────
const H = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
const VERDICT_META = {
    true_positive: { label: 'TRUE POSITIVE', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: AlertTriangle },
    false_positive: { label: 'FALSE POSITIVE', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', icon: CheckCircle2 },
    true_positive_benign: { label: 'AUTHORIZED', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Shield },
    insufficient_evidence: { label: 'INSUFFICIENT', color: 'text-gray-400', bg: 'bg-gray-800 border-gray-700', icon: Eye },
    escalate: { label: 'ESCALATE', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', icon: ArrowRight },
};
const STATUS_STYLE = {
    queued: 'bg-gray-700 text-gray-400',
    investigating: 'bg-blue-500/10 text-blue-400 animate-pulse',
    awaiting_approval: 'bg-yellow-500/10 text-yellow-400',
    completed: 'bg-green-500/10 text-green-400',
    failed: 'bg-red-500/10 text-red-400',
};
const THOUGHT_ICON = {
    hypothesis: Brain, tool_call: Wrench, observation: Eye,
    reasoning: MessageSquare, conclusion: CheckCircle2,
};
function ConfidenceMeter({ confidence }) {
    const color = confidence >= 85 ? '#22c55e' : confidence >= 70 ? '#3b82f6' : confidence >= 50 ? '#eab308' : '#ef4444';
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full transition-all duration-700", style: { width: `${confidence}%`, background: color } }) }), _jsxs("span", { className: "text-xs font-bold tabular-nums", style: { color }, children: [confidence, "%"] })] }));
}
function ThoughtStep({ thought, index }) {
    const [open, setOpen] = useState(thought.type === 'conclusion');
    const Icon = THOUGHT_ICON[thought.type] ?? Brain;
    const stepColors = {
        hypothesis: 'text-purple-400 bg-purple-500/10',
        tool_call: 'text-blue-400 bg-blue-500/10',
        observation: 'text-cyan-400 bg-cyan-500/10',
        reasoning: 'text-gray-400 bg-gray-800',
        conclusion: 'text-green-400 bg-green-500/10',
    };
    return (_jsxs("div", { className: "flex gap-3", children: [_jsxs("div", { className: "flex flex-col items-center", children: [_jsx("div", { className: clsx('h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0', stepColors[thought.type]), children: _jsx(Icon, { className: "h-3.5 w-3.5" }) }), index < 99 && _jsx("div", { className: "w-px h-full bg-gray-800 mt-1" })] }), _jsxs("div", { className: "flex-1 min-w-0 pb-4", children: [_jsxs("button", { onClick: () => setOpen(v => !v), className: "flex items-center gap-2 text-left w-full", children: [_jsx("span", { className: clsx('text-xs font-bold uppercase tracking-wider', stepColors[thought.type]?.split(' ')[0]), children: thought.type.replace('_', ' ') }), thought.toolName && (_jsx("span", { className: "text-xs font-mono text-gray-600 bg-gray-800 px-2 py-0.5 rounded", children: thought.toolName })), open ? _jsx(ChevronUp, { className: "h-3 w-3 text-gray-600 ml-auto" }) : _jsx(ChevronDown, { className: "h-3 w-3 text-gray-600 ml-auto" })] }), open && (_jsx("div", { className: "mt-2 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap", children: thought.content.length > 1000 ? `${thought.content.slice(0, 1000)}…` : thought.content }))] })] }));
}
function InvestigationCard({ inv, onView, onReview }) {
    const verdict = VERDICT_META[inv.verdict ?? ''];
    const VIcon = verdict?.icon ?? Brain;
    return (_jsxs("div", { className: "rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors", children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1 flex-wrap", children: [_jsx("span", { className: clsx('px-2.5 py-1 rounded text-xs font-medium capitalize', STATUS_STYLE[inv.status]), children: inv.status?.replace('_', ' ') }), verdict && (_jsxs("span", { className: clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-bold', verdict.bg, verdict.color), children: [_jsx(VIcon, { className: "h-3 w-3" }), verdict.label] }))] }), _jsx("p", { className: "text-sm font-semibold text-gray-200 truncate", children: inv.alertTitle || `Alert ${inv.alertId?.slice(0, 8)}` }), inv.executiveSummary && (_jsx("p", { className: "text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed", children: inv.executiveSummary }))] }), _jsx("div", { className: "text-right flex-shrink-0 text-xs text-gray-600", children: new Date(inv.createdAt).toLocaleString() })] }), inv.confidence > 0 && (_jsxs("div", { className: "mb-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("span", { className: "text-xs text-gray-500", children: "AI Confidence" }), _jsxs("span", { className: "text-xs text-gray-500", children: [inv.totalSteps, " steps \u00B7 ", inv.totalTokens?.toLocaleString(), " tokens"] })] }), _jsx(ConfidenceMeter, { confidence: inv.confidence })] })), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: () => onView(inv.id), className: "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium\n                     border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors", children: [_jsx(FileText, { className: "h-3 w-3" }), " View Report"] }), inv.status === 'awaiting_approval' && (_jsxs("button", { onClick: () => onReview(inv.id), className: "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold\n                       bg-yellow-600 text-white hover:bg-yellow-500 transition-colors", children: [_jsx(CheckCircle2, { className: "h-3 w-3" }), " Review"] }))] })] }));
}
function InvestigationDetail({ invId, onBack }) {
    const [reviewOpen, setReviewOpen] = useState(false);
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['investigation', invId],
        queryFn: () => fetch(`/api/v1/investigations/${invId}`, { headers: H() }).then(r => r.json()),
        staleTime: 10_000,
        refetchInterval: (q) => {
            const status = q.state.data?.data?.status;
            return ['queued', 'investigating'].includes(status) ? 5000 : false;
        },
    });
    const inv = data?.data;
    const verdict = VERDICT_META[inv?.verdict ?? ''];
    async function submitReview(v, notes) {
        await fetch('/api/v1/investigations/:id/review'.replace(':id', invId), {
            method: 'POST', headers: H(),
            body: JSON.stringify({ investigationId: invId, verdict: v, notes }),
        });
        qc.invalidateQueries({ queryKey: ['investigations'] });
        qc.invalidateQueries({ queryKey: ['investigation', invId] });
        setReviewOpen(false);
    }
    if (isLoading)
        return (_jsx("div", { className: "space-y-4", children: [...Array(4)].map((_, i) => _jsx(Skeleton, { className: "h-24 w-full" }, i)) }));
    if (!inv)
        return _jsx("div", { className: "text-gray-500 text-sm", children: "Investigation not found" });
    return (_jsxs("div", { className: "space-y-5", children: [_jsx("button", { onClick: onBack, className: "text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1", children: "\u2190 Back to investigations" }), _jsxs("div", { className: clsx('rounded-2xl border p-5', verdict?.bg ?? 'bg-gray-900 border-gray-800'), children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [verdict && (_jsx("span", { className: clsx('text-xl font-black', verdict.color), children: verdict.label })), _jsx("span", { className: clsx('px-2.5 py-1 rounded text-xs font-medium', STATUS_STYLE[inv.status]), children: inv.status?.replace('_', ' ') })] }), _jsx("h2", { className: "text-base font-bold text-gray-100", children: inv.alertTitle }), inv.executiveSummary && (_jsx("p", { className: "text-sm text-gray-400 mt-2 leading-relaxed", children: inv.executiveSummary }))] }), _jsxs("div", { className: "text-right flex-shrink-0", children: [_jsx("div", { className: "text-xs text-gray-500 mb-1", children: "AI Confidence" }), _jsxs("div", { className: clsx('text-3xl font-black', verdict?.color ?? 'text-gray-400'), children: [inv.confidence, "%"] })] })] }), inv.confidence > 0 && _jsx(ConfidenceMeter, { confidence: inv.confidence }), _jsxs("div", { className: "flex items-center gap-3 mt-3 text-xs text-gray-600", children: [_jsxs("span", { children: [inv.totalSteps, " reasoning steps"] }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { children: [inv.totalTokens?.toLocaleString(), " tokens"] }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: inv.durationMs ? `${Math.round(inv.durationMs / 1000)}s` : '—' }), _jsx("span", { children: "\u00B7" }), _jsx("span", { className: "font-mono", children: inv.agentModel })] })] }), ['queued', 'investigating'].includes(inv.status) && (_jsxs(Card, { className: "flex items-center gap-4 py-6", children: [_jsx(Brain, { className: "h-8 w-8 text-blue-400 animate-pulse flex-shrink-0" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-gray-200", children: inv.status === 'queued' ? 'Investigation queued…' : 'AI analyst investigating…' }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: "Gathering evidence, analyzing patterns, forming hypotheses" })] }), _jsx(RefreshCw, { className: "h-4 w-4 text-gray-600 animate-spin ml-auto" })] })), inv.status !== 'queued' && (_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-5", children: [_jsxs(Card, { children: [_jsxs("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4", children: ["Evidence Collected (", inv.evidence?.length ?? 0, ")"] }), _jsxs("div", { className: "space-y-3 max-h-80 overflow-y-auto", children: [(inv.evidence ?? []).map((e, i) => (_jsxs("div", { className: clsx('p-3 rounded-lg border', e.supportsTP ? 'border-red-500/20 bg-red-500/5' : e.supportsFP ? 'border-green-500/20 bg-green-500/5' : 'border-gray-800 bg-gray-800/20'), children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("span", { className: clsx('text-xs font-bold', e.supportsTP ? 'text-red-400' : e.supportsFP ? 'text-green-400' : 'text-gray-500'), children: e.supportsTP ? '↑TP' : e.supportsFP ? '↑FP' : '—' }), _jsx("span", { className: "text-xs font-medium text-gray-300 truncate", children: e.title })] }), _jsx("p", { className: "text-xs text-gray-500 leading-relaxed", children: e.description })] }, i))), (!inv.evidence || inv.evidence.length === 0) && (_jsx("p", { className: "text-xs text-gray-600", children: "No evidence collected yet" }))] })] }), _jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4", children: "Agent Reasoning Trace" }), _jsxs("div", { className: "max-h-80 overflow-y-auto", children: [(inv.thoughts ?? []).map((t, i) => (_jsx(ThoughtStep, { thought: t, index: i }, i))), (!inv.thoughts || inv.thoughts.length === 0) && (_jsx("p", { className: "text-xs text-gray-600", children: "Reasoning not yet available" }))] })] })] })), inv.detailedReport && (_jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4", children: "Full Investigation Report" }), _jsx("div", { className: "prose prose-invert prose-sm max-w-none text-gray-300 text-xs leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap font-mono", children: inv.detailedReport })] })), (inv.recommendations?.length > 0 || inv.iocList?.length > 0) && (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [inv.recommendations?.length > 0 && (_jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Recommendations" }), inv.recommendations.map((r, i) => (_jsxs("div", { className: "flex items-start gap-2 mb-2 text-xs text-gray-400", children: [_jsx(ArrowRight, { className: "h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" }), r] }, i)))] })), inv.iocList?.length > 0 && (_jsxs(Card, { children: [_jsxs("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: ["IOC List (", inv.iocList.length, ")"] }), inv.iocList.map((ioc, i) => (_jsx("div", { className: "text-xs font-mono text-gray-400 py-1 border-b border-gray-800 last:border-0", children: ioc }, i)))] }))] })), inv.status === 'awaiting_approval' && !reviewOpen && (_jsxs(Card, { className: "flex items-center justify-between gap-4 py-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-gray-200", children: "Human Review Required" }), _jsx("p", { className: "text-xs text-gray-500", children: "AI confidence below 85% \u2014 analyst confirmation requested" })] }), _jsx(Button, { variant: "primary", icon: CheckCircle2, onClick: () => setReviewOpen(true), children: "Submit Review" })] })), reviewOpen && (_jsxs(Card, { children: [_jsx("p", { className: "text-sm font-semibold text-gray-200 mb-4", children: "Analyst Review" }), _jsx("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-2 mb-4", children: Object.entries(VERDICT_META).map(([v, m]) => (_jsxs("button", { onClick: () => submitReview(v, ''), className: clsx('flex items-center gap-2 p-3 rounded-xl border text-left transition-all text-xs font-medium', m.bg, m.color), children: [_jsx(m.icon, { className: "h-3.5 w-3.5 flex-shrink-0" }), m.label] }, v))) }), _jsx("button", { onClick: () => setReviewOpen(false), className: "text-xs text-gray-500 hover:text-gray-300", children: "Cancel" })] }))] }));
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function AiSocAnalystPage() {
    const [selectedId, setSelectedId] = useState(null);
    const [reviewId, setReviewId] = useState(null);
    const { data: statsData } = useQuery({
        queryKey: ['investigation-stats'],
        queryFn: () => fetch('/api/v1/investigations/stats', { headers: H() }).then(r => r.json()),
        staleTime: 60_000,
    });
    const { data: listData, isLoading } = useQuery({
        queryKey: ['investigations'],
        queryFn: () => fetch('/api/v1/investigations?limit=30', { headers: H() }).then(r => r.json()),
        staleTime: 15_000,
        refetchInterval: 15_000,
    });
    const stats = statsData?.data;
    const list = listData?.data ?? [];
    const pending = list.filter((i) => i.status === 'awaiting_approval').length;
    if (selectedId) {
        return (_jsx(AppShell, { title: "AI SOC Analyst \u2014 Investigation", children: _jsx(PageContent, { children: _jsx(InvestigationDetail, { invId: selectedId, onBack: () => setSelectedId(null) }) }) }));
    }
    return (_jsx(AppShell, { title: "AI SOC Analyst", actions: _jsxs("div", { className: "flex items-center gap-2", children: [pending > 0 && (_jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20", children: [_jsx(AlertTriangle, { className: "h-3.5 w-3.5" }), pending, " awaiting review"] })), _jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20", children: [_jsx(Cpu, { className: "h-3.5 w-3.5" }), "claude-sonnet-4-6"] })] }), children: _jsxs(PageContent, { children: [_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6", children: [
                        { label: 'Total Investigations', value: stats?.totalInvestigations ?? '—', icon: Brain, color: 'text-blue-400' },
                        { label: 'True Positives', value: stats?.truePositives ?? '—', icon: AlertTriangle, color: 'text-red-400' },
                        { label: 'False Positives', value: stats?.falsePositives ?? '—', icon: CheckCircle2, color: 'text-green-400' },
                        { label: 'Pending Review', value: stats?.pendingReview ?? '—', icon: Clock, color: pending > 0 ? 'text-yellow-400' : 'text-gray-500' },
                        { label: 'TP Rate (30d)', value: stats ? `${stats.tpRate}%` : '—', icon: TrendingUp, color: 'text-gray-200' },
                    ].map(k => (_jsxs(Card, { className: "flex items-center gap-3", children: [_jsx(k.icon, { className: clsx('h-5 w-5 flex-shrink-0', k.color) }), _jsxs("div", { children: [_jsx("p", { className: clsx('text-2xl font-bold tabular-nums', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500", children: k.label })] })] }, k.label))) }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 text-center", children: [
                        { n: '1', label: 'Alert Received', desc: 'P1/P2 auto-triggered', icon: AlertTriangle },
                        { n: '2', label: 'Evidence Gathered', desc: '8 investigation tools', icon: Search },
                        { n: '3', label: 'AI Reasons', desc: 'Multi-step analysis', icon: Brain },
                        { n: '4', label: 'Verdict + Report', desc: 'Human review if <85%', icon: FileText },
                    ].map((s, i) => (_jsxs("div", { className: "relative flex items-center gap-2", children: [_jsxs("div", { className: "flex-1 rounded-xl border border-gray-800 p-3 bg-gray-900/50", children: [_jsx(s.icon, { className: "h-4 w-4 text-blue-400 mx-auto mb-1" }), _jsx("p", { className: "text-xs font-semibold text-gray-200", children: s.label }), _jsx("p", { className: "text-xs text-gray-600 mt-0.5", children: s.desc })] }), i < 3 && _jsx(ArrowRight, { className: "h-4 w-4 text-gray-700 flex-shrink-0" })] }, s.n))) }), isLoading ? (_jsx("div", { className: "space-y-3", children: [...Array(4)].map((_, i) => _jsx(Skeleton, { className: "h-28 w-full" }, i)) })) : list.length === 0 ? (_jsx(EmptyState, { icon: Brain, title: "No investigations yet", description: "Investigations auto-trigger on P1/P2 alerts, or manually from any alert detail page.", action: _jsx(Button, { variant: "primary", icon: Play, children: "Investigate from Alerts" }) })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: list.map((inv) => (_jsx(InvestigationCard, { inv: inv, onView: setSelectedId, onReview: setReviewId }, inv.id))) }))] }) }));
}
