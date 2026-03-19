import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card, Skeleton, EmptyState } from '@/components/shared/ui';
import { Lock, Users, CheckCircle2, Copy, ExternalLink, Plus, RefreshCw, Clock, Target, FileText, Building2, Zap, ArrowRight, Star, } from 'lucide-react';
// ─────────────────────────────────────────────
const H = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
const STATUS_STYLE = {
    pending_config: 'text-gray-400 bg-gray-800',
    testing: 'text-yellow-400 bg-yellow-500/10 animate-pulse',
    active: 'text-green-400 bg-green-500/10',
    disabled: 'text-gray-500 bg-gray-800',
    error: 'text-red-400 bg-red-500/10',
};
const POC_STATUS_STYLE = {
    draft: 'text-gray-400 bg-gray-800',
    active: 'text-blue-400 bg-blue-500/10',
    review: 'text-yellow-400 bg-yellow-500/10',
    won: 'text-green-400 bg-green-500/10',
    lost: 'text-red-400 bg-red-500/10',
    extended: 'text-purple-400 bg-purple-500/10',
};
const PROVIDER_COLORS = {
    okta: 'text-blue-400',
    azure_ad: 'text-blue-500',
    google_workspace: 'text-red-400',
    onelogin: 'text-red-500',
    custom_saml: 'text-gray-400',
    custom_oidc: 'text-gray-400',
};
// ─────────────────────────────────────────────
// SSO TAB
// ─────────────────────────────────────────────
function SsoTab() {
    const [setupStep, setSetupStep] = useState('select');
    const [provider, setProvider] = useState(null);
    const [protocol, setProtocol] = useState('saml2');
    const [connName, setConnName] = useState('');
    const [idpUrl, setIdpUrl] = useState('');
    const [cert, setCert] = useState('');
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState(null);
    const [copied, setCopied] = useState('');
    const qc = useQueryClient();
    const { data: providersData } = useQuery({
        queryKey: ['sso-providers'],
        queryFn: () => fetch('/api/v1/sso/providers', { headers: H() }).then(r => r.json()),
        staleTime: Infinity,
    });
    const { data: connectionsData, isLoading } = useQuery({
        queryKey: ['sso-connections'],
        queryFn: () => fetch('/api/v1/sso/connections', { headers: H() }).then(r => r.json()),
        staleTime: 30_000,
    });
    const { data: scimData } = useQuery({
        queryKey: ['scim-status'],
        queryFn: () => fetch('/api/v1/sso/scim/status', { headers: H() }).then(r => r.json()),
        staleTime: 60_000,
    });
    const providers = providersData?.data ?? [];
    const connections = connectionsData?.data ?? [];
    const scim = scimData?.data;
    function copyToClipboard(text, key) {
        navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(''), 2000);
    }
    async function createConnection() {
        if (!provider || !connName)
            return;
        setCreating(true);
        const selectedProvider = providers.find((p) => p.id === provider);
        const r = await fetch('/api/v1/sso/connections', {
            method: 'POST', headers: H(),
            body: JSON.stringify({
                name: connName, provider, protocol,
                samlConfig: protocol === 'saml2' ? {
                    idpEntityId: idpUrl,
                    idpSsoUrl: idpUrl,
                    idpCertificate: cert || '-----BEGIN CERTIFICATE-----\nPLACEHOLDER\n-----END CERTIFICATE-----',
                    signatureAlgorithm: 'rsa-sha256',
                    nameIdFormat: 'email',
                    attributeMap: selectedProvider?.commonAttrMap ?? { email: 'email' },
                    allowJitProvisioning: true,
                    defaultRole: 'SECURITY_ANALYST',
                    groupToRoleMapping: {},
                } : undefined,
            }),
        });
        const data = await r.json();
        if (data.success) {
            setCreated(data.data);
            setSetupStep('test');
        }
        setCreating(false);
        qc.invalidateQueries({ queryKey: ['sso-connections'] });
    }
    async function enableScim() {
        await fetch('/api/v1/sso/scim/enable', {
            method: 'POST', headers: H(),
            body: JSON.stringify({ syncUsers: true, syncGroups: true, deprovisionUsers: true }),
        });
        qc.invalidateQueries({ queryKey: ['scim-status'] });
    }
    return (_jsxs("div", { className: "space-y-5", children: [connections.length > 0 && (_jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider", children: ["SSO Connections (", connections.length, ")"] }), connections.map((conn) => (_jsxs("div", { className: "flex items-center gap-4 px-5 py-4 border-b border-gray-800/50 last:border-0", children: [_jsx("div", { className: clsx('text-2xl font-black flex-shrink-0', PROVIDER_COLORS[conn.provider] ?? 'text-gray-400'), children: conn.provider === 'okta' ? 'O' : conn.provider === 'azure_ad' ? '⊞' : conn.provider === 'google_workspace' ? 'G' : '🔐' }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-semibold text-gray-200", children: conn.name }), _jsxs("p", { className: "text-xs text-gray-500", children: [conn.provider, " \u00B7 ", conn.protocol, " \u00B7 ", conn.totalLogins, " logins \u00B7 ", conn.provisionedUsers, " users"] })] }), _jsx("span", { className: clsx('px-2.5 py-1 rounded text-xs font-medium', STATUS_STYLE[conn.status]), children: conn.status.replace('_', ' ') }), conn.status === 'active' && _jsx(CheckCircle2, { className: "h-4 w-4 text-green-400" })] }, conn.id)))] })), connections.length === 0 && (_jsxs("div", { children: [setupStep === 'select' && (_jsx("div", { className: "space-y-4", children: _jsxs(Card, { className: "border-blue-500/20 bg-blue-500/5", children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx(Lock, { className: "h-5 w-5 text-blue-400" }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-bold text-gray-100", children: "Configure SSO" }), _jsx("p", { className: "text-xs text-gray-500", children: "Connect your Identity Provider \u2014 no more separate passwords" })] })] }), _jsx("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3", children: providers.map((p) => (_jsxs("button", { onClick: () => { setProvider(p.id); setProtocol(p.protocol); setSetupStep('configure'); }, className: clsx('p-4 rounded-xl border text-left transition-all', provider === p.id ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'), children: [_jsx("div", { className: clsx('text-xl font-black mb-1', PROVIDER_COLORS[p.id] ?? 'text-gray-400'), children: p.id === 'okta' ? 'O' : p.id === 'azure_ad' ? '⊞' : p.id === 'google_workspace' ? 'G' : '🔐' }), _jsx("p", { className: "text-xs font-semibold text-gray-200", children: p.name }), _jsx("p", { className: "text-xs text-gray-600", children: p.protocol.toUpperCase() })] }, p.id))) })] }) })), setupStep === 'configure' && provider && (_jsxs(Card, { children: [_jsxs("div", { className: "flex items-center gap-2 mb-5", children: [_jsx("button", { onClick: () => setSetupStep('select'), className: "text-gray-500 hover:text-gray-300 text-xs", children: "\u2190 Back" }), _jsxs("span", { className: "text-sm font-bold text-gray-100", children: ["Configure ", providers.find((p) => p.id === provider)?.name] })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Connection Name" }), _jsx("input", { type: "text", value: connName, onChange: e => setConnName(e.target.value), placeholder: "e.g. Okta Production", className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" })] }), protocol === 'saml2' && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "IdP SSO URL" }), _jsx("input", { type: "url", value: idpUrl, onChange: e => setIdpUrl(e.target.value), placeholder: "https://your-idp.com/sso/saml", className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "IdP Certificate (PEM)" }), _jsx("textarea", { value: cert, onChange: e => setCert(e.target.value), placeholder: "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----", rows: 4, className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none" })] })] })), _jsx(Button, { variant: "primary", icon: creating ? RefreshCw : Lock, disabled: creating || !connName, onClick: createConnection, children: creating ? 'Creating…' : 'Create Connection' })] })] })), setupStep === 'test' && created && (_jsxs(Card, { className: "border-green-500/20 bg-green-500/5", children: [_jsxs("div", { className: "flex items-center gap-2 mb-4", children: [_jsx(CheckCircle2, { className: "h-5 w-5 text-green-400" }), _jsx("span", { className: "text-sm font-bold text-gray-100", children: "Connection Created \u2014 Configure Your IdP" })] }), _jsxs("div", { className: "space-y-3", children: [[
                                        { label: 'Entity ID (Audience URI)', value: created.spEntityId },
                                        { label: 'ACS URL (Reply URL)', value: created.acsUrl },
                                        { label: 'Metadata URL', value: created.metadataUrl },
                                    ].map(({ label, value }) => (_jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-500 mb-1", children: label }), _jsxs("div", { className: "flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2", children: [_jsx("code", { className: "flex-1 text-xs text-blue-400 font-mono truncate", children: value }), _jsx("button", { onClick: () => copyToClipboard(value, label), className: "text-gray-600 hover:text-gray-300 flex-shrink-0", children: copied === label ? _jsx(CheckCircle2, { className: "h-3.5 w-3.5 text-green-400" }) : _jsx(Copy, { className: "h-3.5 w-3.5" }) })] })] }, label))), _jsxs("div", { className: "pt-2", children: [_jsx("p", { className: "text-xs text-gray-500 font-medium mb-2", children: "Setup steps:" }), created.setupInstructions?.split('\n').map((s, i) => (_jsx("p", { className: "text-xs text-gray-400 mb-1", children: s }, i)))] }), _jsxs("a", { href: created.testUrl ?? '#', target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors", children: [_jsx(ExternalLink, { className: "h-3.5 w-3.5" }), " Test SSO Login"] })] })] }))] })), _jsxs(Card, { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Users, { className: "h-5 w-5 text-purple-400" }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200", children: "SCIM 2.0 Auto-Provisioning" }), _jsx("p", { className: "text-xs text-gray-500", children: "Users created/deactivated automatically from your IdP" })] })] }), scim?.enabled
                                ? _jsx("span", { className: "px-2.5 py-1 rounded text-xs font-medium text-green-400 bg-green-500/10", children: "Active" })
                                : _jsx(Button, { variant: "primary", size: "sm", icon: Zap, onClick: enableScim, children: "Enable SCIM" })] }), scim?.enabled && (_jsx("div", { className: "grid grid-cols-3 gap-3 text-center mt-3", children: [
                            { label: 'Users Provisioned', value: scim.usersProvisioned },
                            { label: 'Users Deprovisioned', value: scim.usersDeprovisioned },
                            { label: 'Last Sync', value: scim.lastSyncAt ? new Date(scim.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never' },
                        ].map(k => (_jsxs("div", { className: "bg-gray-800/40 rounded-lg p-3", children: [_jsx("p", { className: "text-lg font-bold text-gray-100", children: k.value }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: k.label })] }, k.label))) })), scim?.enabled && (_jsx("div", { className: "mt-3 space-y-2", children: [
                            { label: 'SCIM Base URL', value: scim.baseUrl },
                            { label: 'Bearer Token', value: scim.bearerToken },
                        ].map(({ label, value }) => (_jsxs("div", { className: "flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2", children: [_jsxs("span", { className: "text-xs text-gray-600 w-24 flex-shrink-0", children: [label, ":"] }), _jsx("code", { className: "flex-1 text-xs text-blue-400 font-mono truncate", children: value }), _jsx("button", { onClick: () => copyToClipboard(value, label), className: "text-gray-600 hover:text-gray-300 flex-shrink-0", children: copied === label ? _jsx(CheckCircle2, { className: "h-3.5 w-3.5 text-green-400" }) : _jsx(Copy, { className: "h-3.5 w-3.5" }) })] }, label))) }))] })] }));
}
// ─────────────────────────────────────────────
// POC MANAGEMENT TAB
// ─────────────────────────────────────────────
function PocTab() {
    const [creating, setCreating] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [report, setReport] = useState(null);
    const [generating, setGenerating] = useState(false);
    // Form state
    const [company, setCompany] = useState('');
    const [champion, setChampion] = useState('');
    const [email, setEmail] = useState('');
    const [title, setTitle] = useState('CISO');
    const [ae, setAe] = useState('');
    const [plan, setPlan] = useState('enterprise');
    const [mrr, setMrr] = useState(0);
    const [days, setDays] = useState(30);
    const qc = useQueryClient();
    const { data: statsData } = useQuery({
        queryKey: ['poc-stats'],
        queryFn: () => fetch('/api/v1/poc/stats', { headers: H() }).then(r => r.json()),
        staleTime: 60_000,
    });
    const { data: pocsData, isLoading } = useQuery({
        queryKey: ['pocs'],
        queryFn: () => fetch('/api/v1/poc', { headers: H() }).then(r => r.json()),
        staleTime: 30_000,
    });
    const { data: pocDetail } = useQuery({
        queryKey: ['poc', selectedId],
        queryFn: () => fetch(`/api/v1/poc/${selectedId}`, { headers: H() }).then(r => r.json()),
        staleTime: 30_000,
        enabled: !!selectedId,
    });
    const stats = statsData?.data;
    const pocs = pocsData?.data ?? [];
    const poc = pocDetail?.data;
    async function createPoc() {
        if (!company || !champion || !email || !ae)
            return;
        setCreating(true);
        const r = await fetch('/api/v1/poc', {
            method: 'POST', headers: H(),
            body: JSON.stringify({ companyName: company, championName: champion, championEmail: email, championTitle: title, dealOwner: ae, targetPlan: plan, targetMrr: mrr, durationDays: days }),
        });
        const data = await r.json();
        if (data.success) {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['pocs'] });
            qc.invalidateQueries({ queryKey: ['poc-stats'] });
        }
        setCreating(false);
    }
    async function generateReport(pocId) {
        setGenerating(true);
        setReport(null);
        const r = await fetch(`/api/v1/poc/${pocId}/roi-report`, { method: 'POST', headers: H() });
        const data = await r.json();
        setReport(data.data);
        setGenerating(false);
    }
    async function markCriteria(pocId, criteriaId, status) {
        await fetch(`/api/v1/poc/${pocId}/criteria`, {
            method: 'PATCH', headers: H(),
            body: JSON.stringify({ criteriaId, status }),
        });
        qc.invalidateQueries({ queryKey: ['poc', pocId] });
    }
    async function closePoc(pocId, outcome) {
        if (!confirm(`Mark this POC as ${outcome}?`))
            return;
        await fetch(`/api/v1/poc/${pocId}/close`, {
            method: 'POST', headers: H(),
            body: JSON.stringify({ outcome }),
        });
        qc.invalidateQueries({ queryKey: ['pocs'] });
        qc.invalidateQueries({ queryKey: ['poc-stats'] });
    }
    // ── POC Detail View ──────────────────────────
    if (selectedId && poc) {
        return (_jsxs("div", { className: "space-y-5", children: [_jsx("button", { onClick: () => { setSelectedId(null); setReport(null); }, className: "text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1", children: "\u2190 Back to POC list" }), _jsxs(Card, { children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("h2", { className: "text-base font-bold text-gray-100", children: poc.companyName }), _jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-medium', POC_STATUS_STYLE[poc.status]), children: poc.status })] }), _jsxs("p", { className: "text-xs text-gray-500", children: [poc.championName, " \u00B7 ", poc.championTitle, " \u00B7 ", poc.championEmail] }), _jsxs("p", { className: "text-xs text-gray-600 mt-1", children: ["AE: ", poc.dealOwner, " \u00B7 Target: ", poc.targetPlan, " $", poc.targetMrr, "/mo"] })] }), _jsxs("div", { className: "text-right", children: [_jsxs("div", { className: "text-3xl font-black text-blue-400", children: [poc.successScore, "%"] }), _jsx("p", { className: "text-xs text-gray-500", children: "success score" }), _jsxs("p", { className: "text-xs text-gray-600 mt-1", children: [poc.criteriaMetCount, "/", poc.criteriaTotalCount, " criteria met"] })] })] }), poc.engagement && (_jsx("div", { className: "grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-800", children: [
                                { l: 'Alerts Investigated', v: poc.engagement.alertsInvestigated },
                                { l: 'Connectors', v: poc.engagement.connectorsConfigured },
                                { l: 'Playbooks', v: poc.engagement.playbooksCreated },
                                { l: 'Engagement', v: `${poc.engagement.engagementScore}/100` },
                            ].map(k => (_jsxs("div", { className: "text-center bg-gray-800/30 rounded-lg p-2", children: [_jsx("p", { className: "text-lg font-bold text-gray-100", children: k.v }), _jsx("p", { className: "text-xs text-gray-600", children: k.l })] }, k.l))) })), _jsxs("div", { className: "flex gap-3 mt-4", children: [_jsx(Button, { variant: "outline", size: "sm", icon: FileText, disabled: generating, onClick: () => generateReport(poc.id), children: generating ? 'Generating…' : 'Generate ROI Report' }), poc.status === 'active' && _jsxs(_Fragment, { children: [_jsx(Button, { variant: "primary", size: "sm", icon: Star, onClick: () => closePoc(poc.id, 'won'), children: "Mark Won" }), _jsx(Button, { variant: "ghost", size: "sm", onClick: () => closePoc(poc.id, 'lost'), children: "Mark Lost" })] })] })] }), report && (_jsxs(Card, { children: [_jsxs("div", { className: "flex items-center gap-2 mb-4", children: [_jsx(FileText, { className: "h-4 w-4 text-blue-400" }), _jsx("p", { className: "text-xs font-semibold text-gray-200 uppercase tracking-wider", children: "AI-Generated ROI Report" }), _jsx("span", { className: "ml-auto text-xs text-gray-600", children: "claude-sonnet-4-6" })] }), _jsx("div", { className: "text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-mono max-h-96 overflow-y-auto", children: report.report })] })), _jsxs(Card, { padding: "none", children: [_jsx("div", { className: "px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider", children: "Success Criteria" }), poc.successCriteria.map((c) => (_jsxs("div", { className: "flex items-center gap-4 px-5 py-3.5 border-b border-gray-800/50 last:border-0", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm text-gray-200", children: c.title }), _jsxs("p", { className: "text-xs text-gray-500", children: ["Target: ", c.target] }), c.actual && _jsxs("p", { className: "text-xs text-blue-400", children: ["Actual: ", c.actual] })] }), _jsxs("select", { value: c.status, onChange: e => markCriteria(poc.id, c.id, e.target.value), className: "px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 focus:outline-none", children: [_jsx("option", { value: "not_started", children: "Not Started" }), _jsx("option", { value: "in_progress", children: "In Progress" }), _jsx("option", { value: "achieved", children: "\u2705 Achieved" }), _jsx("option", { value: "not_achieved", children: "\u274C Not Achieved" })] })] }, c.id)))] }), _jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4", children: "4-Week Milestone Plan" }), _jsx("div", { className: "space-y-4", children: poc.milestones.map((m) => {
                                const done = m.tasks.filter((t) => t.completed).length;
                                const pct = Math.round((done / m.tasks.length) * 100);
                                return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: clsx('h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', pct === 100 ? 'bg-green-500/20 text-green-400' : poc.currentWeek === m.week ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-500'), children: m.week }), _jsx("span", { className: "text-sm font-medium text-gray-200", children: m.title })] }), _jsxs("span", { className: "text-xs text-gray-500", children: [done, "/", m.tasks.length] })] }), _jsx("div", { className: "h-1.5 bg-gray-800 rounded-full overflow-hidden mb-2", children: _jsx("div", { className: "h-full bg-blue-500 rounded-full", style: { width: `${pct}%` } }) }), poc.currentWeek === m.week && (_jsx("div", { className: "space-y-1.5 ml-8", children: m.tasks.map((t) => (_jsxs("div", { className: "flex items-center gap-2 text-xs", children: [_jsx("span", { className: clsx('h-4 w-4 rounded flex items-center justify-center flex-shrink-0', t.completed ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-600'), children: t.completed ? '✓' : '○' }), _jsx("span", { className: clsx(t.completed ? 'text-gray-500 line-through' : 'text-gray-400'), children: t.title }), _jsx("span", { className: clsx('ml-auto text-xs flex-shrink-0', t.owner === 'zonforge' ? 'text-blue-500' : 'text-gray-600'), children: t.owner === 'zonforge' ? 'ZonForge' : 'Customer' })] }, t.id))) }))] }, m.id));
                            }) })] })] }));
    }
    return (_jsxs("div", { className: "space-y-5", children: [stats && (_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-5 gap-4", children: [
                    { l: 'Active POCs', v: stats.active, c: 'text-blue-400' },
                    { l: 'Won', v: stats.won, c: 'text-green-400' },
                    { l: 'Lost', v: stats.lost, c: 'text-red-400' },
                    { l: 'Pipeline MRR', v: `$${Math.round(stats.pipeline / 1000)}k`, c: 'text-yellow-400' },
                    { l: 'Win Rate', v: stats.winRate, c: stats.won > stats.lost ? 'text-green-400' : 'text-gray-400' },
                ].map(k => (_jsxs(Card, { className: "text-center py-3", children: [_jsx("p", { className: clsx('text-2xl font-bold tabular-nums', k.c), children: k.v }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: k.l })] }, k.l))) })), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-300", children: "Active POCs" }), _jsx(Button, { variant: "primary", size: "sm", icon: Plus, onClick: () => setShowForm(true), children: "New POC" })] }), showForm && (_jsxs(Card, { children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h3", { className: "text-sm font-bold text-gray-100", children: "Create New POC" }), _jsx("button", { onClick: () => setShowForm(false), className: "text-gray-500 hover:text-gray-300", children: "\u2715" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [[
                                { l: 'Company Name', v: company, set: setCompany, ph: 'Acme Corp' },
                                { l: 'Champion Name', v: champion, set: setChampion, ph: 'Jane Smith' },
                                { l: 'Champion Email', v: email, set: setEmail, ph: 'jane@acme.com' },
                                { l: 'Champion Title', v: title, set: setTitle, ph: 'CISO' },
                                { l: 'Account Executive', v: ae, set: setAe, ph: 'Your name' },
                            ].map(f => (_jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: f.l }), _jsx("input", { type: "text", value: f.v, onChange: e => f.set(e.target.value), placeholder: f.ph, className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" })] }, f.l))), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Target Plan + MRR" }), _jsxs("div", { className: "flex gap-2 mt-1.5", children: [_jsxs("select", { value: plan, onChange: e => setPlan(e.target.value), className: "flex-1 px-2 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-300 focus:outline-none", children: [_jsx("option", { value: "business", children: "Business" }), _jsx("option", { value: "enterprise", children: "Enterprise" })] }), _jsx("input", { type: "number", value: mrr, onChange: e => setMrr(Number(e.target.value)), placeholder: "$/mo", className: "w-24 px-2 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 focus:outline-none focus:border-blue-500" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Trial Duration" }), _jsx("select", { value: days, onChange: e => setDays(Number(e.target.value)), className: "mt-1.5 w-full px-2 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-300 focus:outline-none", children: [14, 21, 30, 45, 60].map(d => _jsxs("option", { value: d, children: [d, " days"] }, d)) })] })] }), _jsxs("div", { className: "flex gap-3 justify-end mt-4", children: [_jsx(Button, { variant: "ghost", onClick: () => setShowForm(false), children: "Cancel" }), _jsx(Button, { variant: "primary", icon: Target, disabled: creating || !company || !champion || !email || !ae, onClick: createPoc, children: creating ? 'Creating…' : 'Create POC' })] })] })), isLoading ? (_jsx("div", { className: "space-y-3", children: [...Array(3)].map((_, i) => _jsx(Skeleton, { className: "h-24 w-full" }, i)) })) : pocs.length === 0 ? (_jsx(EmptyState, { icon: Target, title: "No POCs yet", description: "Create your first POC to start managing enterprise trials.", action: _jsx(Button, { variant: "primary", icon: Plus, onClick: () => setShowForm(true), children: "Create First POC" }) })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: pocs.map((p) => {
                    const daysLeft = Math.max(0, Math.round((new Date(p.endDate).getTime() - Date.now()) / 86_400_000));
                    return (_jsxs("button", { onClick: () => setSelectedId(p.id), className: "text-left rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-all", children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-0.5", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200 truncate", children: p.companyName }), _jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-medium flex-shrink-0', POC_STATUS_STYLE[p.status]), children: p.status })] }), _jsxs("p", { className: "text-xs text-gray-500", children: [p.championName, " \u00B7 ", p.targetPlan, " $", p.targetMrr, "/mo"] })] }), _jsxs("div", { className: "text-right flex-shrink-0", children: [_jsxs("p", { className: "text-lg font-black text-blue-400", children: [p.successScore, "%"] }), _jsxs("p", { className: "text-xs text-gray-600", children: [p.criteriaMetCount, "/", p.criteriaTotalCount] })] })] }), _jsxs("div", { className: "flex items-center justify-between text-xs", children: [_jsxs("span", { className: "text-gray-500 flex items-center gap-1", children: [_jsx(Clock, { className: "h-3 w-3" }), p.status === 'active' ? `${daysLeft}d left` : p.status === 'won' ? 'Closed Won' : p.status === 'lost' ? 'Closed Lost' : '—'] }), _jsxs("span", { className: "text-gray-500", children: ["AE: ", p.dealOwner] }), _jsx(ArrowRight, { className: "h-3.5 w-3.5 text-gray-600" })] })] }, p.id));
                }) }))] }));
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function EnterpriseSetupPage() {
    const [tab, setTab] = useState('sso');
    return (_jsx(AppShell, { title: "Enterprise Setup", actions: _jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20", children: [_jsx(Building2, { className: "h-3.5 w-3.5" }), "Enterprise Features"] }), children: _jsxs(PageContent, { children: [_jsx("div", { className: "flex items-center gap-1 border-b border-gray-800 mb-6", children: [
                        { id: 'sso', label: 'SSO & SCIM', icon: Lock },
                        { id: 'poc', label: 'POC Management', icon: Target },
                        { id: 'contract', label: 'Contracts & Billing', icon: FileText },
                    ].map(t => (_jsxs("button", { onClick: () => setTab(t.id), className: clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all', tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'), children: [_jsx(t.icon, { className: "h-4 w-4" }), t.label] }, t.id))) }), tab === 'sso' && _jsx(SsoTab, {}), tab === 'poc' && _jsx(PocTab, {}), tab === 'contract' && (_jsx("div", { className: "max-w-lg", children: _jsxs(Card, { className: "border-blue-500/20 bg-blue-500/5", children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx(FileText, { className: "h-5 w-5 text-blue-400" }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-bold text-gray-100", children: "Enterprise Contracts & Custom Billing" }), _jsx("p", { className: "text-xs text-gray-500", children: "PO-based invoicing, multi-year discounts, custom terms" })] })] }), _jsx("div", { className: "space-y-3 mb-4", children: [
                                    'Custom quote generation (PDF)',
                                    'Net-30/60 invoice payment',
                                    'Purchase Order acceptance',
                                    'Multi-year pricing (3yr = 20% off)',
                                    'Custom MSA and DPA templates',
                                    'SOC2 Type II report sharing',
                                ].map(f => (_jsxs("div", { className: "flex items-center gap-2 text-xs text-gray-400", children: [_jsx(CheckCircle2, { className: "h-3.5 w-3.5 text-green-500/60" }), f] }, f))) }), _jsx("p", { className: "text-xs text-gray-600", children: "Contract management is handled via your CRM (Salesforce/HubSpot). ZonForge generates quotes and invoices \u2014 integration coming in the next release." })] }) }))] }) }));
}
