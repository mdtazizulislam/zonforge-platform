import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores/auth.store';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Badge, Button, Card, Divider } from '@/components/shared/ui';
import { Bell, Shield, Users, Key, CreditCard, Moon, Sun, Monitor, Save, Copy, CheckCircle2, Palette, } from 'lucide-react';
// ─────────────────────────────────────────────
// TOGGLE SWITCH
// ─────────────────────────────────────────────
function Toggle({ enabled, onChange, label, description, }) {
    return (_jsxs("div", { className: "flex items-center justify-between py-3", children: [_jsxs("div", { className: "flex-1 min-w-0 mr-4", children: [_jsx("p", { className: "text-sm font-medium text-gray-200", children: label }), description && _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: description })] }), _jsx("button", { onClick: () => onChange(!enabled), className: clsx('relative flex-shrink-0 h-6 w-11 rounded-full transition-colors', enabled ? 'bg-blue-600' : 'bg-gray-700'), children: _jsx("div", { className: clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-5.5' : 'translate-x-0.5') }) })] }));
}
// ─────────────────────────────────────────────
// SETTINGS SECTION
// ─────────────────────────────────────────────
function SettingsSection({ title, icon: Icon, children }) {
    return (_jsxs(Card, { className: "space-y-0", children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("div", { className: "rounded-lg bg-gray-800 p-2", children: _jsx(Icon, { className: "h-4 w-4 text-gray-400" }) }), _jsx("h3", { className: "text-sm font-semibold text-gray-200", children: title })] }), children] }));
}
// ─────────────────────────────────────────────
// API KEY ROW
// ─────────────────────────────────────────────
function ApiKeyRow({ name, prefix, role, lastUsed, onRevoke }) {
    const [copied, setCopied] = useState(false);
    function copyPrefix() {
        navigator.clipboard.writeText(prefix);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
    return (_jsxs("div", { className: "flex items-center gap-3 py-3 border-b border-gray-800 last:border-0", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("p", { className: "text-sm font-medium text-gray-200", children: name }), _jsx(Badge, { variant: "neutral", size: "xs", children: role })] }), _jsxs("div", { className: "flex items-center gap-2 mt-0.5", children: [_jsxs("code", { className: "text-xs font-mono text-gray-500", children: [prefix, "\u2026"] }), _jsx("button", { onClick: copyPrefix, className: "text-gray-700 hover:text-gray-400 transition-colors", children: copied ? _jsx(CheckCircle2, { className: "h-3 w-3 text-green-400" }) : _jsx(Copy, { className: "h-3 w-3" }) })] }), lastUsed && (_jsxs("p", { className: "text-xs text-gray-700 mt-0.5", children: ["Last used: ", new Date(lastUsed).toLocaleDateString()] }))] }), _jsx("button", { onClick: onRevoke, className: "text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1\n                   rounded border border-red-500/20 hover:border-red-500/40", children: "Revoke" })] }));
}
// ─────────────────────────────────────────────
// SETTINGS PAGE
// ─────────────────────────────────────────────
export default function SettingsPage() {
    const { user } = useAuthStore();
    const { theme, setTheme } = useAuthStore((s) => ({
        theme: s.theme ?? 'dark',
        setTheme: s.setTheme ?? (() => { }),
    }));
    // Notification settings
    const [emailAlerts, setEmailAlerts] = useState(true);
    const [slackAlerts, setSlackAlerts] = useState(false);
    const [p1Only, setP1Only] = useState(false);
    const [slaAlerts, setSlaAlerts] = useState(true);
    // Display settings
    const [compactMode, setCompact] = useState(false);
    const [showTechIds, setShowTechIds] = useState(true);
    // State for saved indicators
    const [saved, setSaved] = useState(false);
    function handleSave() {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }
    const activeTab = 'general'; // simplified — single page
    return (_jsx(AppShell, { title: "Settings", actions: _jsx(Button, { variant: "primary", size: "sm", icon: saved ? CheckCircle2 : Save, onClick: handleSave, children: saved ? 'Saved!' : 'Save Changes' }), children: _jsxs(PageContent, { className: "max-w-3xl", children: [_jsxs(SettingsSection, { title: "Your Profile", icon: Users, children: [_jsxs("div", { className: "flex items-center gap-4 mb-4", children: [_jsx("div", { className: "h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center\n                            text-blue-400 font-bold text-lg", children: user?.name?.[0]?.toUpperCase() ?? '?' }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-gray-200", children: user?.name ?? '—' }), _jsx("p", { className: "text-xs text-gray-500", children: user?.email ?? '—' }), _jsx("div", { className: "mt-1", children: _jsx(Badge, { variant: "neutral", size: "xs", children: user?.role ?? '—' }) })] })] }), _jsx(Divider, {}), _jsxs("div", { className: "flex items-center justify-between py-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-300", children: "Change Password" }), _jsx("p", { className: "text-xs text-gray-600", children: "Last changed: unknown" })] }), _jsx(Button, { variant: "outline", size: "sm", children: "Update" })] }), _jsxs("div", { className: "flex items-center justify-between py-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-300", children: "Two-Factor Authentication" }), _jsx("p", { className: "text-xs text-gray-600", children: "Protect your account with TOTP" })] }), _jsx(Button, { variant: "outline", size: "sm", children: "Configure" })] })] }), _jsxs(SettingsSection, { title: "Appearance", icon: Palette, children: [_jsx("p", { className: "text-xs text-gray-500 mb-3", children: "Choose your color scheme preference." }), _jsx("div", { className: "grid grid-cols-3 gap-3", children: [
                                { value: 'dark', label: 'Dark', icon: Moon },
                                { value: 'light', label: 'Light', icon: Sun },
                                { value: 'system', label: 'System', icon: Monitor },
                            ].map(({ value, label, icon: Icon }) => (_jsxs("button", { onClick: () => setTheme(value), className: clsx('flex flex-col items-center gap-2 py-4 rounded-xl border text-sm font-medium transition-all', theme === value
                                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                                    : 'border-gray-800 text-gray-500 hover:border-gray-700'), children: [_jsx(Icon, { className: "h-5 w-5" }), label] }, value))) }), _jsx(Divider, {}), _jsx(Toggle, { enabled: compactMode, onChange: setCompact, label: "Compact Mode", description: "Reduce padding for denser information display" }), _jsx(Toggle, { enabled: showTechIds, onChange: setShowTechIds, label: "Show MITRE Technique IDs", description: "Display T1234 codes alongside technique names" })] }), _jsxs(SettingsSection, { title: "Notifications", icon: Bell, children: [_jsx(Toggle, { enabled: emailAlerts, onChange: setEmailAlerts, label: "Email Alerts", description: "Receive alert emails for new P1/P2 detections" }), _jsx(Toggle, { enabled: slackAlerts, onChange: setSlackAlerts, label: "Slack Notifications", description: "Send alerts to your configured Slack channel" }), _jsx(Toggle, { enabled: p1Only, onChange: setP1Only, label: "Critical Alerts Only", description: "Only notify for P1 (critical) alerts" }), _jsx(Toggle, { enabled: slaAlerts, onChange: setSlaAlerts, label: "SLA Breach Notifications", description: "Alert when MTTD SLA targets are exceeded" }), slackAlerts && (_jsxs("div", { className: "mt-3 pt-3 border-t border-gray-800", children: [_jsx("p", { className: "text-xs text-gray-500 mb-2", children: "Slack Webhook URL" }), _jsx("input", { type: "url", placeholder: "https://hooks.slack.com/services/\u2026", className: "w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800\n                           text-sm text-gray-200 placeholder-gray-600\n                           focus:outline-none focus:border-blue-500" })] }))] }), _jsxs(SettingsSection, { title: "Security & Access", icon: Shield, children: [_jsxs("div", { className: "space-y-2 mb-3", children: [_jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsx("span", { className: "text-gray-400", children: "Tenant ID" }), _jsx("code", { className: "font-mono text-gray-300 text-xs", children: user?.tenantId })] }), _jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsx("span", { className: "text-gray-400", children: "Region" }), _jsx("span", { className: "text-gray-300 text-xs", children: user?.region ?? 'us-east-1' })] }), _jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsx("span", { className: "text-gray-400", children: "Session" }), _jsx(Badge, { variant: "success", size: "xs", children: "Active" })] })] }), _jsx(Divider, { label: "Data Retention" }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-gray-400", children: "Event retention" }), _jsx("span", { className: "text-gray-300", children: "90 days" })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-gray-400", children: "Alert history" }), _jsx("span", { className: "text-gray-300", children: "1 year" })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-gray-400", children: "Audit log" }), _jsxs("div", { className: "flex items-center gap-1.5 text-green-400", children: [_jsx(Shield, { className: "h-3 w-3" }), _jsx("span", { className: "text-xs", children: "7 years (WORM)" })] })] })] })] }), _jsxs(SettingsSection, { title: "API Keys", icon: Key, children: [_jsx("p", { className: "text-xs text-gray-500 mb-4", children: "API keys allow programmatic access and are used by data collectors. Keys are shown once at creation." }), _jsx(ApiKeyRow, { name: "M365 Collector", prefix: "sk_live_abc123", role: "API_CONNECTOR", lastUsed: new Date(Date.now() - 5 * 60_000).toISOString(), onRevoke: () => { } }), _jsx(ApiKeyRow, { name: "CloudTrail Collector", prefix: "sk_live_def456", role: "API_CONNECTOR", lastUsed: new Date(Date.now() - 15 * 60_000).toISOString(), onRevoke: () => { } }), _jsx("div", { className: "mt-4", children: _jsx(Button, { variant: "outline", size: "sm", icon: Key, children: "Create New API Key" }) })] }), _jsxs(SettingsSection, { title: "Plan & Billing", icon: CreditCard, children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-gray-200", children: "Current Plan" }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: "Renews monthly" })] }), _jsx(Badge, { variant: "neutral", size: "md", children: "Starter Trial" })] }), _jsx("div", { className: "grid grid-cols-3 gap-3 text-center mb-4", children: [
                                { label: 'Events/min', value: '5K', limit: '5K' },
                                { label: 'Connectors', value: '1', limit: '3' },
                                { label: 'Retention', value: '30d', limit: '30d' },
                            ].map(({ label, value, limit }) => (_jsxs("div", { className: "rounded-lg bg-gray-800/40 p-3", children: [_jsx("p", { className: "text-sm font-bold text-gray-200", children: value }), _jsx("p", { className: "text-xs text-gray-600", children: label }), _jsxs("p", { className: "text-xs text-gray-700 mt-0.5", children: ["of ", limit] })] }, label))) }), _jsx(Button, { variant: "primary", className: "w-full justify-center", children: "Upgrade Plan" })] })] }) }));
}
