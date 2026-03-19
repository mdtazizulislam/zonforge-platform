import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card, Skeleton, EmptyState } from '@/components/shared/ui';
import { Lock, FileText, FlaskConical, CheckCircle2, XCircle, RefreshCw, Copy, ExternalLink, AlertTriangle, Clock, Shield, Download, Plus, Check, } from 'lucide-react';
// ─────────────────────────────────────────────
const H = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
});
// ─────────────────────────────────────────────
// TAB: SSO CONFIGURATION
// ─────────────────────────────────────────────
function SsoTab() {
    const qc = useQueryClient();
    const [provider, setProvider] = useState('okta');
    const [form, setForm] = useState({
        idpEntityId: '', idpSsoUrl: '', idpCertificate: '',
        emailAttr: 'email', jitEnabled: true, jitDefaultRole: 'ANALYST',
    });
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [copied, setCopied] = useState(null);
    const { data: ssoData, isLoading } = useQuery({
        queryKey: ['sso-config'],
        queryFn: () => fetch('/api/v1/sso/config', { headers: H() }).then(r => r.json()),
        staleTime: 60_000,
    });
    const sso = ssoData?.data;
    function copyToClipboard(text, key) {
        navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    }
    async function saveSso() {
        setSaving(true);
        await fetch('/api/v1/sso/config', {
            method: 'POST', headers: H(),
            body: JSON.stringify({
                provider,
                idpEntityId: form.idpEntityId,
                idpSsoUrl: form.idpSsoUrl,
                idpCertificate: form.idpCertificate,
                attributeMap: { email: form.emailAttr },
                jitEnabled: form.jitEnabled,
                jitDefaultRole: form.jitDefaultRole,
                allowedDomains: [],
            }),
        });
        qc.invalidateQueries({ queryKey: ['sso-config'] });
        setSaving(false);
    }
    const PROVIDERS = [
        { id: 'okta', name: 'Okta', logo: '🔐' },
        { id: 'azure_ad', name: 'Microsoft Entra ID', logo: '🔷' },
        { id: 'google_workspace', name: 'Google Workspace', logo: '🟦' },
        { id: 'onelogin', name: 'OneLogin', logo: '🔑' },
        { id: 'custom_saml', name: 'Custom SAML', logo: '⚙️' },
    ];
    return (_jsxs("div", { className: "space-y-5 max-w-3xl", children: [isLoading ? _jsx(Skeleton, { className: "h-16 w-full" }) : (_jsx("div", { className: clsx('flex items-center gap-3 p-4 rounded-xl border', sso?.configured && sso?.enabled
                    ? 'bg-green-500/8 border-green-500/20'
                    : 'bg-yellow-500/8 border-yellow-500/20'), children: sso?.configured && sso?.enabled
                    ? _jsxs(_Fragment, { children: [_jsx(CheckCircle2, { className: "h-5 w-5 text-green-400 flex-shrink-0" }), _jsxs("div", { children: [_jsxs("p", { className: "text-sm font-semibold text-green-400", children: ["SSO Active \u2014 ", sso.provider] }), _jsxs("p", { className: "text-xs text-gray-500", children: [sso.loginCount, " SSO logins \u00B7 Last used: ", sso.lastUsedAt ? new Date(sso.lastUsedAt).toLocaleDateString() : 'Never'] })] })] })
                    : _jsxs(_Fragment, { children: [_jsx(AlertTriangle, { className: "h-5 w-5 text-yellow-400 flex-shrink-0" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-yellow-400", children: "SSO Not Configured" }), _jsx("p", { className: "text-xs text-gray-500", children: "Configure SSO to allow team login via your Identity Provider" })] })] }) })), sso?.spInfo && (_jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4", children: "Your Service Provider (SP) Values \u2014 Copy to IdP" }), _jsx("div", { className: "space-y-3", children: [
                            { label: 'ACS URL (Reply URL)', value: sso.spInfo.acsUrl },
                            { label: 'Entity ID (Audience)', value: sso.spInfo.entityId },
                            { label: 'Metadata URL', value: sso.spInfo.metadataUrl },
                        ].map(f => (_jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-500 mb-1", children: f.label }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("code", { className: "flex-1 text-xs bg-gray-900 text-blue-300 px-3 py-2 rounded-lg border border-gray-800 truncate", children: f.value }), _jsx("button", { onClick: () => copyToClipboard(f.value, f.label), className: "flex-shrink-0 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors", children: copied === f.label ? _jsx(Check, { className: "h-3.5 w-3.5 text-green-400" }) : _jsx(Copy, { className: "h-3.5 w-3.5" }) })] })] }, f.label))) })] })), _jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4", children: "Identity Provider" }), _jsx("div", { className: "grid grid-cols-5 gap-2 mb-5", children: PROVIDERS.map(p => (_jsxs("button", { onClick: () => setProvider(p.id), className: clsx('flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all', provider === p.id ? 'border-blue-500 bg-blue-500/10' : 'border-gray-800 hover:border-gray-700'), children: [_jsx("span", { className: "text-2xl", children: p.logo }), _jsx("span", { className: "text-xs text-gray-400 leading-tight", children: p.name })] }, p.id))) }), _jsxs("div", { className: "space-y-3", children: [[
                                { label: 'IdP Entity ID', key: 'idpEntityId', placeholder: 'https://your-idp.okta.com/exk...' },
                                { label: 'IdP SSO URL', key: 'idpSsoUrl', placeholder: 'https://your-idp.okta.com/app/...' },
                            ].map(f => (_jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500", children: f.label }), _jsx("input", { type: "text", placeholder: f.placeholder, value: form[f.key], onChange: e => setForm(prev => ({ ...prev, [f.key]: e.target.value })), className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800\n                           text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" })] }, f.key))), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500", children: "IdP Certificate (X.509)" }), _jsx("textarea", { rows: 3, placeholder: "-----BEGIN CERTIFICATE-----\nMIIDpDCCAoygAwIBAgIGAV...\n-----END CERTIFICATE-----", value: form.idpCertificate, onChange: e => setForm(prev => ({ ...prev, idpCertificate: e.target.value })), className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800\n                         text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono resize-none" })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => setForm(prev => ({ ...prev, jitEnabled: !prev.jitEnabled })), className: clsx('h-5 w-9 rounded-full transition-colors', form.jitEnabled ? 'bg-blue-600' : 'bg-gray-700'), children: _jsx("div", { className: clsx('h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5', form.jitEnabled ? 'translate-x-4' : 'translate-x-0') }) }), _jsx("span", { className: "text-xs text-gray-400", children: "JIT User Provisioning" })] }), _jsxs("select", { value: form.jitDefaultRole, onChange: e => setForm(prev => ({ ...prev, jitDefaultRole: e.target.value })), className: "px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 focus:outline-none", children: [_jsx("option", { value: "ANALYST", children: "Default: Analyst" }), _jsx("option", { value: "VIEWER", children: "Default: Viewer (read-only)" })] })] })] }), _jsxs("div", { className: "flex gap-3 mt-5", children: [_jsx(Button, { variant: "primary", icon: saving ? RefreshCw : Shield, onClick: saveSso, disabled: saving, children: saving ? 'Saving…' : 'Save SSO Configuration' }), sso?.spInfo?.initiateUrl && (_jsx("a", { href: sso.spInfo.initiateUrl, target: "_blank", rel: "noopener noreferrer", children: _jsx(Button, { variant: "outline", icon: ExternalLink, children: "Test SSO Login" }) }))] })] })] }));
}
// ─────────────────────────────────────────────
// TAB: BOARD REPORT
// ─────────────────────────────────────────────
function BoardReportTab() {
    const [generating, setGenerating] = useState(false);
    const [report, setReport] = useState(null);
    const [period, setPeriod] = useState(90);
    const iframeRef = useRef(null);
    async function generate() {
        setGenerating(true);
        setReport(null);
        const r = await fetch('/api/v1/board-report/generate', {
            method: 'POST', headers: H(),
            body: JSON.stringify({ periodDays: period, format: 'html' }),
        });
        const data = await r.json();
        setReport(data.data);
        setGenerating(false);
    }
    return (_jsxs("div", { className: "space-y-5", children: [_jsx(Card, { children: _jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-sm font-bold text-gray-200 mb-1", children: "Executive Security Report" }), _jsx("p", { className: "text-xs text-gray-500 leading-relaxed max-w-lg", children: "Board-ready PDF/HTML report covering security posture, incidents, compliance status, industry benchmark, and AI-written narrative. Ready to present to your Board of Directors." })] }), _jsxs("div", { className: "flex-shrink-0 text-right", children: [_jsxs("select", { value: period, onChange: e => setPeriod(Number(e.target.value)), className: "px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 focus:outline-none mb-3 block", children: [_jsx("option", { value: 30, children: "Monthly (30 days)" }), _jsx("option", { value: 90, children: "Quarterly (90 days)" }), _jsx("option", { value: 365, children: "Annual (365 days)" })] }), _jsx(Button, { variant: "primary", icon: generating ? RefreshCw : FileText, onClick: generate, disabled: generating, children: generating ? 'Generating…' : 'Generate Report' })] })] }) }), _jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Report Contents" }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                            'Security Posture Grade (A–F)',
                            '6-Month Trend Chart',
                            'Incident Summary Table',
                            'Compliance Status (SOC2/GDPR/ISO)',
                            'Industry Percentile Benchmark',
                            'Analyst Hours Saved',
                            'Attacks Prevented (estimated)',
                            'Board-Level Recommendations',
                        ].map(f => (_jsxs("div", { className: "flex items-center gap-2 text-xs text-gray-400", children: [_jsx(CheckCircle2, { className: "h-3.5 w-3.5 text-green-500/70 flex-shrink-0" }), f] }, f))) })] }), generating && (_jsxs(Card, { className: "flex items-center gap-3 py-6", children: [_jsx(RefreshCw, { className: "h-5 w-5 text-blue-400 animate-spin" }), _jsx("p", { className: "text-sm text-gray-400", children: "Collecting security metrics and generating report\u2026" })] })), report && (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "grid grid-cols-4 gap-3", children: [
                            { label: 'Posture Grade', value: report.summary?.postureGrade, color: 'text-blue-400' },
                            { label: 'Posture Score', value: report.summary?.postureScore, color: 'text-gray-200' },
                            { label: 'Incidents', value: report.summary?.totalIncidents, color: 'text-gray-200' },
                            { label: 'Industry Percentile', value: `${report.summary?.percentile}th`, color: 'text-green-400' },
                        ].map(k => (_jsxs(Card, { className: "text-center py-4", children: [_jsx("p", { className: clsx('text-2xl font-black', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: k.label })] }, k.label))) }), _jsxs("div", { className: "flex gap-3", children: [report.downloadUrl && (_jsx("a", { href: report.downloadUrl, target: "_blank", rel: "noopener noreferrer", children: _jsx(Button, { variant: "primary", icon: Download, children: "Download PDF" }) })), report.html && (_jsx("button", { onClick: () => {
                                    const w = window.open('', '_blank');
                                    if (w) {
                                        w.document.write(report.html);
                                        w.document.close();
                                    }
                                }, children: _jsx(Button, { variant: "outline", icon: ExternalLink, children: "View Full Report" }) })), _jsx(Button, { variant: "ghost", icon: RefreshCw, onClick: generate, children: "Regenerate" })] })] }))] }));
}
// ─────────────────────────────────────────────
// TAB: POC MANAGEMENT
// ─────────────────────────────────────────────
function PocTab() {
    const qc = useQueryClient();
    const [showNew, setShowNew] = useState(false);
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState({
        companyName: '', contactName: '', contactEmail: '',
        industry: 'Technology', companySize: '201-500',
        estimatedDealSize: 50000, trialDays: 30,
    });
    const [creating, setCreating] = useState(false);
    const { data: pocsData, isLoading } = useQuery({
        queryKey: ['pocs'],
        queryFn: () => fetch('/api/v1/poc', { headers: H() }).then(r => r.json()),
        staleTime: 60_000, refetchInterval: 60_000,
    });
    const { data: pocDetailData } = useQuery({
        queryKey: ['poc', selected],
        queryFn: () => fetch(`/api/v1/poc/${selected}`, { headers: H() }).then(r => r.json()),
        staleTime: 30_000,
        enabled: !!selected,
    });
    const pocs = pocsData?.data ?? [];
    const detail = pocDetailData?.data;
    async function createPoc() {
        setCreating(true);
        await fetch('/api/v1/poc', { method: 'POST', headers: H(), body: JSON.stringify(form) });
        qc.invalidateQueries({ queryKey: ['pocs'] });
        setShowNew(false);
        setCreating(false);
    }
    async function updateMilestone(pocId, milestoneId, status) {
        await fetch(`/api/v1/poc/${pocId}/milestone`, {
            method: 'PATCH', headers: H(),
            body: JSON.stringify({ milestoneId, status }),
        });
        qc.invalidateQueries({ queryKey: ['poc', pocId] });
    }
    const STATUS_COLOR = {
        active: 'text-blue-400 bg-blue-500/10',
        converting: 'text-yellow-400 bg-yellow-500/10',
        converted: 'text-green-400 bg-green-500/10',
        churned: 'text-red-400 bg-red-500/10',
        expired: 'text-gray-500 bg-gray-800',
    };
    const HEALTH_COLOR = (s) => s >= 70 ? 'text-green-400' : s >= 40 ? 'text-yellow-400' : 'text-red-400';
    const MS_STATUS = {
        completed: { icon: CheckCircle2, color: 'text-green-400' },
        in_progress: { icon: RefreshCw, color: 'text-blue-400' },
        blocked: { icon: XCircle, color: 'text-red-400' },
        pending: { icon: Clock, color: 'text-gray-500' },
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-5", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-300", children: "POC / Trial Engagements" }), _jsx(Button, { variant: "primary", size: "sm", icon: Plus, onClick: () => setShowNew(true), children: "New POC" })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-5", children: [_jsx("div", { className: "space-y-3", children: isLoading ? (_jsx("div", { className: "space-y-3", children: [...Array(3)].map((_, i) => _jsx(Skeleton, { className: "h-28 rounded-xl" }, i)) })) : pocs.length === 0 ? (_jsx(EmptyState, { icon: FlaskConical, title: "No POC engagements", description: "Start a POC to track enterprise trial milestones and ROI.", action: _jsx(Button, { variant: "primary", icon: Plus, onClick: () => setShowNew(true), children: "Start POC" }) })) : (pocs.map((poc) => (_jsxs("button", { onClick: () => setSelected(poc.id === selected ? null : poc.id), className: clsx('w-full text-left rounded-xl border p-4 transition-all hover:border-gray-700', selected === poc.id ? 'border-blue-500/40 bg-blue-500/5' : 'border-gray-800'), children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-gray-200", children: poc.companyName }), _jsxs("p", { className: "text-xs text-gray-500", children: [poc.contactName, " \u00B7 ", poc.contactTitle || poc.industry] })] }), _jsx("span", { className: clsx('px-2 py-0.5 rounded text-xs font-medium capitalize', STATUS_COLOR[poc.status] ?? STATUS_COLOR.active), children: poc.status })] }), _jsxs("div", { className: "grid grid-cols-3 gap-2 text-center", children: [_jsxs("div", { children: [_jsx("p", { className: clsx('text-lg font-bold', HEALTH_COLOR(poc.score ?? 80)), children: poc.score ?? 80 }), _jsx("p", { className: "text-xs text-gray-600", children: "Health" })] }), _jsxs("div", { children: [_jsx("p", { className: "text-lg font-bold text-gray-200", children: poc.daysLeft ?? poc.trialDays }), _jsx("p", { className: "text-xs text-gray-600", children: "Days left" })] }), _jsxs("div", { children: [_jsxs("p", { className: "text-lg font-bold text-green-400", children: ["$", Math.round((poc.estimatedDealSize ?? 0) / 1000), "k"] }), _jsx("p", { className: "text-xs text-gray-600", children: "Est. ARR" })] })] })] }, poc.id)))) }), _jsx("div", { children: !selected ? (_jsx(Card, { className: "flex items-center justify-center py-16 text-center", children: _jsxs("div", { children: [_jsx(FlaskConical, { className: "h-8 w-8 text-gray-700 mx-auto mb-3" }), _jsx("p", { className: "text-sm text-gray-500", children: "Select a POC to view milestones and ROI" })] }) })) : !detail ? (_jsx(Skeleton, { className: "h-96 rounded-xl" })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("p", { className: "text-sm font-bold text-gray-200", children: detail.companyName }), _jsxs("span", { className: "text-xs text-gray-500", children: [detail.progressPct, "% complete"] })] }), _jsx("div", { className: "h-2 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-blue-500 rounded-full transition-all", style: { width: `${detail.progressPct}%` } }) }), _jsxs("div", { className: "flex justify-between text-xs text-gray-600 mt-1.5", children: [_jsx("span", { children: "Day 0" }), _jsxs("span", { className: detail.daysLeft <= 5 ? 'text-red-400 font-bold' : '', children: [detail.daysLeft, " days left"] }), _jsxs("span", { children: ["Day ", detail.trialDays] })] })] }), detail.roi && (_jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Value Realized" }), _jsx("div", { className: "grid grid-cols-2 gap-3 mb-3", children: [
                                                { label: 'Analyst Hours Saved', value: detail.roi.analystHoursSaved },
                                                { label: 'ROI Multiple', value: `${detail.roi.estimatedRoiMultiple}×`, color: 'text-green-400' },
                                            ].map(k => (_jsxs("div", { className: "bg-gray-800/40 rounded-lg p-3 text-center", children: [_jsx("p", { className: clsx('text-xl font-bold', k.color ?? 'text-gray-100'), children: k.value }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: k.label })] }, k.label))) }), _jsx("p", { className: "text-xs text-gray-500 leading-relaxed", children: detail.roi.roiNarrative })] })), _jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider", children: ["Milestones (", detail.milestones?.filter((m) => m.status === 'completed').length, "/", detail.milestones?.length, ")"] }), _jsx("div", { className: "divide-y divide-gray-800/50 max-h-64 overflow-y-auto", children: (detail.milestones ?? []).map((m) => {
                                                const ST = MS_STATUS[m.status] ?? MS_STATUS.pending;
                                                return (_jsxs("div", { className: "flex items-center gap-3 px-4 py-3", children: [_jsx(ST.icon, { className: clsx('h-4 w-4 flex-shrink-0', ST.color) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-xs font-medium text-gray-300 truncate", children: m.name }), _jsxs("p", { className: "text-xs text-gray-600", children: ["Day ", m.dueDay] })] }), m.status === 'pending' && (_jsx("button", { onClick: () => updateMilestone(detail.id, m.id, 'completed'), className: "text-xs text-blue-400 hover:text-blue-300 flex-shrink-0 px-2 py-1 rounded border border-blue-500/30 hover:bg-blue-500/10 transition-colors", children: "Mark done" }))] }, m.id));
                                            }) })] }), detail.status === 'active' && (_jsx(Button, { variant: "primary", className: "w-full", onClick: async () => {
                                        await fetch(`/api/v1/poc/${detail.id}/convert`, { method: 'POST', headers: H() });
                                        qc.invalidateQueries({ queryKey: ['pocs'] });
                                        setSelected(null);
                                    }, children: "\uD83C\uDF89 Mark as Converted" }))] })) })] }), showNew && (_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-gray-950/80 backdrop-blur-sm", onClick: () => setShowNew(false) }), _jsxs(Card, { className: "relative w-full max-w-lg mx-4 z-10", children: [_jsxs("div", { className: "flex items-center justify-between mb-5", children: [_jsx("h3", { className: "text-base font-bold text-gray-100", children: "Start New POC" }), _jsx("button", { onClick: () => setShowNew(false), className: "text-gray-500 hover:text-gray-300 text-lg", children: "\u00D7" })] }), _jsxs("div", { className: "space-y-3 mb-5", children: [[
                                        { label: 'Company Name', key: 'companyName', ph: 'Acme Corporation' },
                                        { label: 'Contact Name', key: 'contactName', ph: 'Jane Smith' },
                                        { label: 'Contact Email', key: 'contactEmail', ph: 'jane@acme.com' },
                                    ].map(f => (_jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: f.label }), _jsx("input", { type: "text", placeholder: f.ph, value: form[f.key], onChange: e => setForm(prev => ({ ...prev, [f.key]: e.target.value })), className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800\n                               text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" })] }, f.key))), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Est. Deal (USD/yr)" }), _jsx("input", { type: "number", value: form.estimatedDealSize, onChange: e => setForm(prev => ({ ...prev, estimatedDealSize: Number(e.target.value) })), className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 focus:outline-none focus:border-blue-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Trial Duration" }), _jsxs("select", { value: form.trialDays, onChange: e => setForm(prev => ({ ...prev, trialDays: Number(e.target.value) })), className: "mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-300 focus:outline-none", children: [_jsx("option", { value: 14, children: "14 days" }), _jsx("option", { value: 30, children: "30 days" }), _jsx("option", { value: 60, children: "60 days" })] })] })] })] }), _jsxs("div", { className: "flex gap-3 justify-end", children: [_jsx(Button, { variant: "ghost", onClick: () => setShowNew(false), children: "Cancel" }), _jsx(Button, { variant: "primary", icon: creating ? RefreshCw : FlaskConical, onClick: createPoc, disabled: creating || !form.companyName || !form.contactEmail, children: creating ? 'Creating…' : 'Start POC' })] })] })] }))] }));
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function EnterpriseSalesPage() {
    const [tab, setTab] = useState('sso');
    return (_jsx(AppShell, { title: "Enterprise Sales", actions: _jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20", children: [_jsx(Shield, { className: "h-3.5 w-3.5" }), "Enterprise Tier Features"] }), children: _jsxs(PageContent, { children: [_jsx("div", { className: "flex items-center gap-1 border-b border-gray-800 mb-6", children: [
                        { id: 'sso', label: 'SSO / SCIM', icon: Lock, desc: 'Enterprise identity' },
                        { id: 'report', label: 'Board Report', icon: FileText, desc: 'Executive PDF' },
                        { id: 'poc', label: 'POC Management', icon: FlaskConical, desc: 'Trial tracking' },
                    ].map(t => (_jsxs("button", { onClick: () => setTab(t.id), className: clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all', tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'), children: [_jsx(t.icon, { className: "h-4 w-4" }), t.label, _jsxs("span", { className: "text-xs text-gray-600 hidden md:inline", children: ["\u2014 ", t.desc] })] }, t.id))) }), tab === 'sso' && _jsx(SsoTab, {}), tab === 'report' && _jsx(BoardReportTab, {}), tab === 'poc' && _jsx(PocTab, {})] }) }));
}
