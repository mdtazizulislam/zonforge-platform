import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useConnectors, useCreateConnector } from '@/hooks/queries';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card, Skeleton, EmptyState } from '@/components/shared/ui';
import { Plus, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2, Wifi, Database, ExternalLink, } from 'lucide-react';
// ─────────────────────────────────────────────
// CONNECTOR TYPE METADATA
// ─────────────────────────────────────────────
const CONNECTOR_META = {
    m365_entra: { label: 'Microsoft 365 / Entra ID', icon: '🔷', description: 'Sign-in logs, audit logs, identity protection', category: 'identity' },
    aws_cloudtrail: { label: 'AWS CloudTrail', icon: '🟠', description: 'API calls, console logins, IAM events', category: 'cloud' },
    google_workspace: { label: 'Google Workspace', icon: '🟡', description: 'Login, admin, drive, token events', category: 'identity' },
    azure_activity: { label: 'Azure Activity Log', icon: '🔵', description: 'Resource management, policy changes', category: 'cloud' },
    gcp_audit: { label: 'GCP Audit Logs', icon: '🟢', description: 'Admin activity, data access logs', category: 'cloud' },
    cloudflare_waf: { label: 'Cloudflare WAF', icon: '🟤', description: 'Web threat events, blocked requests', category: 'network' },
    aws_waf: { label: 'AWS WAF', icon: '🟠', description: 'Web ACL rule matches, blocked IPs', category: 'network' },
    generic_webhook: { label: 'Generic Webhook', icon: '⚙️', description: 'Custom JSON events via webhook', category: 'custom' },
    generic_syslog: { label: 'Syslog', icon: '📋', description: 'Standard syslog over TCP/UDP', category: 'custom' },
    vulnerability_scan_upload: { label: 'Vulnerability Scanner', icon: '🔍', description: 'Upload scan results (Qualys, Tenable, etc.)', category: 'vulnerability' },
};
const CATEGORY_COLORS = {
    identity: 'text-blue-400  bg-blue-500/10',
    cloud: 'text-orange-400 bg-orange-500/10',
    network: 'text-purple-400 bg-purple-500/10',
    vulnerability: 'text-red-400   bg-red-500/10',
    custom: 'text-gray-400  bg-gray-700',
};
// ─────────────────────────────────────────────
// CONNECTOR CARD
// ─────────────────────────────────────────────
function ConnectorCard({ connector, onValidate, onToggle, }) {
    const meta = CONNECTOR_META[connector.type] ?? {
        label: connector.type, icon: '⚙️',
        description: '', category: 'custom',
    };
    const lagMinutes = connector.lagMinutes;
    return (_jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors\n                    hover:border-gray-700", children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "text-2xl", children: meta.icon }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200", children: connector.name }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: meta.label })] })] }), _jsx("div", { className: "flex items-center gap-1.5 flex-shrink-0", children: _jsxs("div", { className: clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', connector.status === 'active' && connector.isHealthy
                                ? 'bg-green-500/10 text-green-400'
                                : connector.status === 'active' && !connector.isHealthy
                                    ? 'bg-yellow-500/10 text-yellow-400'
                                    : connector.status === 'error'
                                        ? 'bg-red-500/10 text-red-400'
                                        : 'bg-gray-700 text-gray-500'), children: [_jsx("div", { className: clsx('h-1.5 w-1.5 rounded-full', {
                                        'bg-green-400': connector.status === 'active' && connector.isHealthy,
                                        'bg-yellow-400 animate-pulse': connector.status === 'active' && !connector.isHealthy,
                                        'bg-red-400': connector.status === 'error',
                                        'bg-gray-600': !['active', 'error'].includes(connector.status),
                                    }) }), connector.status === 'active' && connector.isHealthy ? 'Healthy'
                                    : connector.status === 'active' ? 'Lagging'
                                        : connector.status === 'error' ? 'Error'
                                            : connector.status === 'paused' ? 'Paused'
                                                : 'Pending'] }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3 mb-4", children: [_jsxs("div", { className: "rounded-lg bg-gray-800/40 p-3", children: [_jsx("p", { className: "text-xs text-gray-600 mb-1", children: "Last Event" }), _jsx("p", { className: "text-sm font-medium text-gray-300", children: connector.lastEventAt
                                    ? new Date(connector.lastEventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    : '—' })] }), _jsxs("div", { className: "rounded-lg bg-gray-800/40 p-3", children: [_jsx("p", { className: "text-xs text-gray-600 mb-1", children: "Lag" }), _jsx("p", { className: clsx('text-sm font-medium', lagMinutes == null ? 'text-gray-500'
                                    : lagMinutes > 60 ? 'text-red-400'
                                        : lagMinutes > 30 ? 'text-yellow-400'
                                            : 'text-green-400'), children: lagMinutes != null ? `${lagMinutes}m` : '—' })] }), _jsxs("div", { className: "rounded-lg bg-gray-800/40 p-3", children: [_jsx("p", { className: "text-xs text-gray-600 mb-1", children: "Poll Interval" }), _jsxs("p", { className: "text-sm font-medium text-gray-300", children: [connector.pollIntervalMinutes, "m"] })] }), _jsxs("div", { className: "rounded-lg bg-gray-800/40 p-3", children: [_jsx("p", { className: "text-xs text-gray-600 mb-1", children: "Errors" }), _jsx("p", { className: clsx('text-sm font-medium', connector.consecutiveErrors > 0 ? 'text-red-400' : 'text-gray-300'), children: connector.consecutiveErrors ?? 0 })] })] }), connector.lastErrorMessage && (_jsx("div", { className: "mb-4 p-3 rounded-lg bg-red-500/8 border border-red-500/20", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx(AlertTriangle, { className: "h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" }), _jsx("p", { className: "text-xs text-red-400 leading-relaxed line-clamp-2", children: connector.lastErrorMessage })] }) })), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: () => onValidate(connector.id), className: "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs\n                     font-medium text-gray-400 border border-gray-700 hover:text-gray-200\n                     hover:border-gray-600 transition-colors", children: [_jsx(CheckCircle2, { className: "h-3.5 w-3.5" }), "Validate"] }), _jsx("button", { onClick: () => onToggle(connector.id, connector.status), className: clsx('flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium', 'border transition-colors', connector.status === 'active'
                            ? 'text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10'
                            : 'text-green-400 border-green-500/20 hover:bg-green-500/10'), children: connector.status === 'active' ? 'Pause' : 'Resume' })] })] }));
}
// ─────────────────────────────────────────────
// ADD CONNECTOR MODAL
// ─────────────────────────────────────────────
function AddConnectorModal({ onClose }) {
    const [selected, setSelected] = useState(null);
    const [name, setName] = useState('');
    const { mutate: createConnector, isPending } = useCreateConnector();
    const grouped = {};
    for (const [key, meta] of Object.entries(CONNECTOR_META)) {
        if (!grouped[meta.category])
            grouped[meta.category] = [];
        grouped[meta.category].push([key, meta]);
    }
    function handleCreate() {
        if (!selected || !name.trim())
            return;
        createConnector({ name: name.trim(), type: selected, config: {} }, { onSuccess: onClose });
    }
    return (_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-gray-950/80 backdrop-blur-sm", onClick: onClose }), _jsxs("div", { className: "relative w-full max-w-2xl bg-gray-900 rounded-2xl border border-gray-700\n                      shadow-2xl mx-4 max-h-[80vh] flex flex-col", children: [_jsxs("div", { className: "flex items-center justify-between p-6 border-b border-gray-800", children: [_jsx("h2", { className: "text-lg font-bold text-gray-100", children: "Add Data Connector" }), _jsx("button", { onClick: onClose, className: "text-gray-500 hover:text-gray-300 transition-colors", children: _jsx(XCircle, { className: "h-5 w-5" }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-6 space-y-6", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-gray-300 mb-3", children: "Select Source Type" }), _jsx("div", { className: "space-y-4", children: Object.entries(grouped).map(([category, types]) => (_jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-600 uppercase tracking-wider mb-2 capitalize", children: category }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: types.map(([key, meta]) => (_jsxs("button", { onClick: () => setSelected(key), className: clsx('flex items-center gap-3 p-3 rounded-xl border text-left transition-all', selected === key
                                                            ? 'border-blue-500 bg-blue-500/10'
                                                            : 'border-gray-800 hover:border-gray-700 bg-gray-800/40'), children: [_jsx("span", { className: "text-xl flex-shrink-0", children: meta.icon }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-gray-200 truncate", children: meta.label }), _jsx("p", { className: "text-xs text-gray-600 truncate", children: meta.description })] })] }, key))) })] }, category))) })] }), selected && (_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-gray-300 mb-2", children: "Connector Name" }), _jsx("input", { type: "text", value: name, onChange: e => setName(e.target.value), placeholder: `e.g. Production ${CONNECTOR_META[selected]?.label}`, className: "w-full px-4 py-2.5 rounded-xl border border-gray-700 bg-gray-800\n                           text-sm text-gray-200 placeholder-gray-600\n                           focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" })] }))] }), _jsxs("div", { className: "flex items-center justify-end gap-3 p-6 border-t border-gray-800", children: [_jsx("button", { onClick: onClose, className: "px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors", children: "Cancel" }), _jsxs("button", { onClick: handleCreate, disabled: !selected || !name.trim() || isPending, className: clsx('flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all', 'bg-blue-600 text-white hover:bg-blue-500', (!selected || !name.trim()) && 'opacity-50 cursor-not-allowed'), children: [isPending && _jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "Create Connector"] })] })] })] }));
}
// ─────────────────────────────────────────────
// CONNECTORS PAGE
// ─────────────────────────────────────────────
export default function ConnectorsPage() {
    const [showAdd, setShowAdd] = useState(false);
    const [validating, setValid] = useState(null);
    const { data, isLoading, refetch, isFetching } = useConnectors();
    const connectors = data?.data ?? [];
    const healthyCount = connectors.filter((c) => c.isHealthy).length;
    const errorCount = connectors.filter((c) => c.status === 'error').length;
    async function handleValidate(id) {
        setValid(id);
        await fetch(`/api/v1/connectors/${id}/validate`);
        setValid(null);
    }
    function handleToggle(id, currentStatus) {
        fetch(`/api/v1/connectors/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: currentStatus === 'active' ? 'paused' : 'active',
            }),
        }).then(() => refetch());
    }
    return (_jsxs(AppShell, { title: "Data Connectors", actions: _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: () => refetch(), disabled: isFetching, className: "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm\n                       text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors", children: [_jsx(RefreshCw, { className: clsx('h-3.5 w-3.5', isFetching && 'animate-spin') }), "Refresh"] }), _jsx(Button, { variant: "primary", size: "sm", icon: Plus, onClick: () => setShowAdd(true), children: "Add Connector" })] }), children: [_jsxs(PageContent, { children: [_jsxs("div", { className: "grid grid-cols-3 gap-4 mb-6", children: [_jsx(Card, { children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "rounded-lg bg-green-500/10 p-2.5", children: _jsx(CheckCircle2, { className: "h-5 w-5 text-green-400" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-2xl font-bold text-gray-100", children: healthyCount }), _jsx("p", { className: "text-sm text-gray-500", children: "Healthy" })] })] }) }), _jsx(Card, { children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: clsx('rounded-lg p-2.5', errorCount > 0 ? 'bg-red-500/10' : 'bg-gray-800'), children: _jsx(XCircle, { className: clsx('h-5 w-5', errorCount > 0 ? 'text-red-400' : 'text-gray-600') }) }), _jsxs("div", { children: [_jsx("p", { className: clsx('text-2xl font-bold', errorCount > 0 ? 'text-red-400' : 'text-gray-400'), children: errorCount }), _jsx("p", { className: "text-sm text-gray-500", children: "Errors" })] })] }) }), _jsx(Card, { children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "rounded-lg bg-blue-500/10 p-2.5", children: _jsx(Database, { className: "h-5 w-5 text-blue-400" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-2xl font-bold text-gray-100", children: connectors.length }), _jsx("p", { className: "text-sm text-gray-500", children: "Total" })] })] }) })] }), isLoading ? (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: [...Array(4)].map((_, i) => _jsx(Skeleton, { className: "h-64 rounded-xl" }, i)) })) : connectors.length === 0 ? (_jsx(EmptyState, { icon: Wifi, title: "No connectors configured", description: "Add your first data source to start collecting security events.", action: _jsx(Button, { variant: "primary", icon: Plus, onClick: () => setShowAdd(true), children: "Add First Connector" }) })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: connectors.map((c) => (_jsx(ConnectorCard, { connector: c, onValidate: handleValidate, onToggle: handleToggle }, c.id))) })), _jsx("div", { className: "mt-8 rounded-xl border border-blue-500/15 bg-blue-500/5 p-4", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx(ExternalLink, { className: "h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-blue-300", children: "Connector Documentation" }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: "Each connector type requires specific API permissions and credentials. Refer to the setup guide for your data source." })] })] }) })] }), showAdd && _jsx(AddConnectorModal, { onClose: () => setShowAdd(false) })] }));
}
