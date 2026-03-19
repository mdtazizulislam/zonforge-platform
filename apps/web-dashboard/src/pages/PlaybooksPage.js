import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui';
import { Play, Plus, CheckCircle2, XCircle, Clock, AlertTriangle, Shield, Zap, Mail, MessageSquare, Ticket, Users, FileText, ChevronDown, ChevronUp, } from 'lucide-react';
const H = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
const ACTION_META = {
    document_only: { label: 'Document Only', icon: FileText, color: 'text-gray-400' },
    disable_user_m365: { label: 'Disable M365 User', icon: Users, color: 'text-red-400' },
    disable_user_google: { label: 'Disable Google User', icon: Users, color: 'text-red-400' },
    block_ip_cloudflare: { label: 'Block IP (CF WAF)', icon: Shield, color: 'text-orange-400' },
    block_ip_aws_waf: { label: 'Block IP (AWS WAF)', icon: Shield, color: 'text-orange-400' },
    create_jira_ticket: { label: 'Create Jira Ticket', icon: Ticket, color: 'text-blue-400' },
    create_servicenow_incident: { label: 'ServiceNow Incident', icon: Ticket, color: 'text-purple-400' },
    notify_pagerduty: { label: 'Page On-Call (PD)', icon: Zap, color: 'text-yellow-400' },
    notify_email: { label: 'Send Email', icon: Mail, color: 'text-blue-400' },
    notify_slack: { label: 'Slack Alert', icon: MessageSquare, color: 'text-green-400' },
    require_mfa_reauthentication: { label: 'Force MFA Re-auth', icon: Shield, color: 'text-amber-400' },
};
const EXEC_STATUS = {
    completed: 'bg-green-500/10 text-green-400',
    running: 'bg-blue-500/10 text-blue-400 animate-pulse',
    pending_approval: 'bg-yellow-500/10 text-yellow-400',
    failed: 'bg-red-500/10 text-red-400',
    cancelled: 'bg-gray-700 text-gray-400',
};
const TEMPLATES = [
    { id: 't1', name: 'Account Takeover Response', severity: 'critical',
        actions: ['notify_pagerduty', 'disable_user_m365', 'require_mfa_reauthentication'],
        desc: 'Auto-page on-call, disable account, force MFA re-auth.', star: true },
    { id: 't2', name: 'IP Threat Containment', severity: 'high',
        actions: ['block_ip_cloudflare', 'block_ip_aws_waf', 'create_jira_ticket'],
        desc: 'Block IP across WAF layers, create tracking ticket.', star: false },
    { id: 't3', name: 'Incident Documentation', severity: 'medium',
        actions: ['create_servicenow_incident', 'notify_slack', 'document_only'],
        desc: 'Open ServiceNow ticket, notify team, document.', star: false },
    { id: 't4', name: 'P1 Escalation Chain', severity: 'critical',
        actions: ['notify_pagerduty', 'notify_email', 'create_jira_ticket'],
        desc: 'Full escalation: page on-call, email leadership, Jira P1.', star: false },
];
function ActionPill({ type }) {
    const meta = ACTION_META[type];
    if (!meta)
        return _jsx("span", { className: "text-xs font-mono text-gray-600", children: type });
    const Icon = meta.icon;
    return (_jsxs("span", { className: clsx('inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-gray-800', meta.color), children: [_jsx(Icon, { className: "h-3 w-3 flex-shrink-0" }), meta.label] }));
}
function ExecRow({ exec }) {
    const [open, setOpen] = useState(false);
    const qc = useQueryClient();
    async function approve() {
        await fetch(`/api/v1/playbook-executions/${exec.id}/approve`, { method: 'POST', headers: H() });
        qc.invalidateQueries({ queryKey: ['playbook-executions'] });
    }
    return (_jsxs("div", { className: "border-b border-gray-800/50 last:border-0", children: [_jsxs("div", { className: "flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/20 transition-colors", children: [_jsx("span", { className: clsx('flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium capitalize', EXEC_STATUS[exec.status] ?? 'bg-gray-700 text-gray-400'), children: exec.status?.replace(/_/g, ' ') }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("p", { className: "text-sm text-gray-300 truncate font-mono", children: [exec.playbookId?.slice(0, 12), "\u2026"] }), _jsxs("p", { className: "text-xs text-gray-600", children: ["Alert ", exec.alertId?.slice(0, 8), "\u2026 \u00B7 ", exec.triggeredBy === 'auto' ? 'Auto-triggered' : `By ${exec.triggeredBy?.slice(0, 8)}…`] })] }), _jsx("p", { className: "text-xs text-gray-500 flex-shrink-0", children: new Date(exec.createdAt).toLocaleString() }), exec.status === 'pending_approval' && (_jsx(Button, { variant: "primary", size: "sm", onClick: approve, children: "Approve" })), _jsx("button", { onClick: () => setOpen(v => !v), className: "text-gray-600 hover:text-gray-400", children: open ? _jsx(ChevronUp, { className: "h-4 w-4" }) : _jsx(ChevronDown, { className: "h-4 w-4" }) })] }), open && exec.actionsCompleted?.length > 0 && (_jsx("div", { className: "px-5 pb-3 space-y-1.5 bg-gray-900/40", children: exec.actionsCompleted.map((a, i) => (_jsxs("div", { className: "flex items-center gap-3 text-xs", children: [a.status === 'success'
                            ? _jsx(CheckCircle2, { className: "h-3.5 w-3.5 text-green-400" })
                            : a.status === 'pending_approval'
                                ? _jsx(Clock, { className: "h-3.5 w-3.5 text-yellow-400" })
                                : _jsx(XCircle, { className: "h-3.5 w-3.5 text-red-400" }), _jsx(ActionPill, { type: a.type }), _jsx("span", { className: "text-gray-500 truncate", children: a.message })] }, i))) }))] }));
}
export default function PlaybooksPage() {
    const [tab, setTab] = useState('playbooks');
    const [showNew, setNew] = useState(false);
    const qc = useQueryClient();
    const { data: pbData, isLoading: pbLoad } = useQuery({ queryKey: ['playbooks'], queryFn: () => fetch('/api/v1/playbooks', { headers: H() }).then(r => r.json()), staleTime: 60_000 });
    const { data: exData, isLoading: exLoad } = useQuery({ queryKey: ['playbook-executions'], queryFn: () => fetch('/api/v1/playbook-executions', { headers: H() }).then(r => r.json()), staleTime: 30_000, refetchInterval: 30_000, enabled: tab === 'executions' });
    const pbs = pbData?.data ?? [];
    const exes = exData?.data ?? [];
    const pendingApproval = exes.filter((e) => e.status === 'pending_approval').length;
    return (_jsx(AppShell, { title: "Automated Playbooks", actions: _jsxs("div", { className: "flex items-center gap-2", children: [pendingApproval > 0 && (_jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20", children: [_jsx(AlertTriangle, { className: "h-3.5 w-3.5" }), pendingApproval, " pending approval"] })), _jsx(Button, { variant: "primary", size: "sm", icon: Plus, onClick: () => setNew(true), children: "New Playbook" })] }), children: _jsxs(PageContent, { children: [_jsx("div", { className: "grid grid-cols-4 gap-4 mb-6", children: [
                        { label: 'Active Playbooks', value: pbs.filter((p) => p.enabled).length, icon: Play, color: 'text-blue-400' },
                        { label: 'Executions', value: exes.length, icon: Zap, color: 'text-green-400' },
                        { label: 'Pending Approval', value: pendingApproval, icon: Clock, color: pendingApproval > 0 ? 'text-yellow-400' : 'text-gray-500' },
                        { label: 'Failed', value: exes.filter((e) => e.status === 'failed').length, icon: XCircle, color: 'text-gray-500' },
                    ].map(k => (_jsxs(Card, { className: "flex items-center gap-3", children: [_jsx("div", { className: "rounded-lg bg-gray-800 p-2.5 flex-shrink-0", children: _jsx(k.icon, { className: clsx('h-4 w-4', k.color) }) }), _jsxs("div", { children: [_jsx("p", { className: clsx('text-2xl font-bold tabular-nums', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500", children: k.label })] })] }, k.label))) }), _jsx("div", { className: "flex items-center gap-1 border-b border-gray-800 mb-5", children: [
                        { id: 'playbooks', label: 'My Playbooks', count: null },
                        { id: 'executions', label: 'Execution Log', count: pendingApproval },
                        { id: 'templates', label: 'Platform Templates', count: null },
                    ].map(t => (_jsxs("button", { onClick: () => setTab(t.id), className: clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all', tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'), children: [t.label, (t.count ?? 0) > 0 && _jsx("span", { className: "px-1.5 rounded-full text-xs font-bold bg-yellow-500 text-black", children: t.count })] }, t.id))) }), tab === 'playbooks' && (pbLoad ? _jsx("div", { className: "space-y-3", children: [...Array(3)].map((_, i) => _jsx(Skeleton, { className: "h-24 w-full" }, i)) })
                    : pbs.length === 0
                        ? _jsx(EmptyState, { icon: Play, title: "No playbooks yet", description: "Create automated response playbooks to contain threats faster.", action: _jsx(Button, { variant: "primary", icon: Plus, onClick: () => setNew(true), children: "Create Playbook" }) })
                        : _jsx("div", { className: "space-y-3", children: pbs.map((pb) => (_jsx(Card, { className: "hover:border-gray-700 transition-colors", children: _jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200", children: pb.name }), _jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-medium', pb.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-500'), children: pb.enabled ? '● Active' : 'Disabled' })] }), _jsx("p", { className: "text-xs text-gray-500 mb-3", children: pb.description }), _jsx("div", { className: "flex flex-wrap gap-2", children: pb.actions?.map((a, i) => _jsx(ActionPill, { type: a.type }, i)) })] }), _jsxs("div", { className: "text-right flex-shrink-0", children: [_jsxs("p", { className: "text-xs text-gray-500 mb-2", children: ["Ran ", _jsx("span", { className: "text-gray-300 font-bold", children: pb.executionCount ?? 0 }), "\u00D7"] }), pb.triggerSeverities?.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1 justify-end", children: pb.triggerSeverities.map((s) => (_jsx(Badge, { variant: s, size: "xs", children: s }, s))) }))] })] }) }, pb.id))) })), tab === 'executions' && (_jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "grid px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-800/40 border-b border-gray-800", style: { gridTemplateColumns: '150px 1fr auto auto' }, children: [_jsx("span", { children: "Status" }), _jsx("span", { children: "Execution" }), _jsx("span", { children: "Time" }), _jsx("span", {})] }), exLoad
                            ? _jsx("div", { className: "divide-y divide-gray-800", children: [...Array(5)].map((_, i) => _jsxs("div", { className: "flex gap-4 p-4", children: [_jsx(Skeleton, { className: "h-5 w-24" }), _jsx(Skeleton, { className: "h-5 flex-1" })] }, i)) })
                            : exes.length === 0
                                ? _jsx(EmptyState, { icon: Zap, title: "No executions yet", description: "Executions appear here when playbooks are triggered." })
                                : exes.map((e) => _jsx(ExecRow, { exec: e }, e.id))] })), tab === 'templates' && (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: TEMPLATES.map(t => (_jsxs(Card, { className: clsx('hover:border-gray-700 transition-colors', t.star && 'border-blue-500/20 bg-blue-500/3'), children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-3", children: [_jsxs("div", { children: [t.star && _jsx("span", { className: "inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white mb-2", children: "\u2605 Recommended" }), _jsx("h3", { className: "text-sm font-semibold text-gray-200", children: t.name }), _jsx("p", { className: "text-xs text-gray-500 mt-1 leading-relaxed", children: t.desc })] }), _jsx(Badge, { variant: t.severity, size: "xs", children: t.severity })] }), _jsx("div", { className: "flex flex-wrap gap-2 mb-4", children: t.actions.map(a => _jsx(ActionPill, { type: a }, a)) }), _jsx(Button, { variant: "outline", size: "sm", icon: Plus, onClick: () => setNew(true), children: "Use Template" })] }, t.id))) })), showNew && (_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-gray-950/80 backdrop-blur-sm", onClick: () => setNew(false) }), _jsxs(Card, { className: "relative w-full max-w-lg mx-4 z-10 shadow-2xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-5", children: [_jsx("h2", { className: "text-base font-bold text-gray-100", children: "Create Playbook" }), _jsx("button", { onClick: () => setNew(false), className: "text-gray-500 hover:text-gray-300 text-lg", children: "\u00D7" })] }), _jsxs("div", { className: "space-y-4", children: [[['Name', 'e.g. Account Takeover Response'], ['Description', 'What this playbook does']].map(([l, ph]) => (_jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: l }), _jsx("input", { type: "text", placeholder: ph, className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" })] }, l))), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Trigger Severity" }), _jsx("div", { className: "mt-2 flex gap-2", children: ['critical', 'high', 'medium', 'low'].map(s => (_jsx("button", { className: "px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:border-blue-500 hover:text-blue-400 capitalize transition-colors", children: s }, s))) })] }), _jsx("p", { className: "text-xs text-gray-600 bg-gray-800/60 rounded-lg p-3", children: "Actions can be added after creation. Start with a document_only action for testing, then add automated actions." })] }), _jsxs("div", { className: "flex gap-3 justify-end mt-5", children: [_jsx(Button, { variant: "ghost", onClick: () => setNew(false), children: "Cancel" }), _jsx(Button, { variant: "primary", icon: Play, onClick: () => setNew(false), children: "Create Playbook" })] })] })] }))] }) }));
}
