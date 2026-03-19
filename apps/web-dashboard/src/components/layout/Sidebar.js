import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLocation, Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuthStore, useUiStore } from '@/stores/auth.store';
import { LayoutDashboard, ShieldAlert, BarChart3, Wifi, ShieldCheck, BookOpen, Settings, ChevronLeft, LogOut, Shield, CreditCard, Building2, Search, FlaskConical, Brain, Network, Sparkles, } from 'lucide-react';
const NAV_MAIN = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
    { label: 'Alerts', href: '/alerts', icon: ShieldAlert },
    { label: 'AI SOC Analyst', href: '/ai-soc-analyst', icon: Brain },
    { label: 'AI Intelligence', href: '/ai-intelligence', icon: Sparkles },
    { label: 'Risk', href: '/risk', icon: BarChart3 },
    { label: 'Threat Hunting', href: '/threat-hunting', icon: Search },
    { label: 'Security Validation', href: '/security-validation', icon: FlaskConical },
    { label: 'Supply Chain', href: '/supply-chain', icon: Network },
    { label: 'Enterprise', href: '/enterprise', icon: Shield },
    { label: 'Connectors', href: '/connectors', icon: Wifi },
];
const NAV_BOTTOM = [
    { label: 'Compliance', href: '/compliance', icon: ShieldCheck },
    { label: 'Audit Log', href: '/audit', icon: BookOpen },
    { label: 'MSSP', href: '/mssp', icon: Building2 },
    { label: 'Enterprise Sales', href: '/enterprise-sales', icon: CreditCard },
    { label: 'Billing', href: '/billing', icon: CreditCard },
    { label: 'Settings', href: '/settings', icon: Settings },
];
export function Sidebar() {
    const location = useLocation();
    const { user, clearAuth } = useAuthStore();
    const { sidebarCollapsed, toggleSidebar } = useUiStore();
    function isActive(href, exact = false) {
        return exact ? location.pathname === href : location.pathname.startsWith(href);
    }
    function NavRow({ item }) {
        const active = isActive(item.href, item.exact);
        return (_jsxs(Link, { to: item.href, className: clsx('flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors', active ? 'bg-blue-500/15 text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60', sidebarCollapsed && 'justify-center px-2'), title: sidebarCollapsed ? item.label : undefined, children: [_jsx(item.icon, { className: clsx('flex-shrink-0', sidebarCollapsed ? 'h-5 w-5' : 'h-4 w-4', active ? 'text-blue-400' : 'text-gray-600') }), !sidebarCollapsed && _jsx("span", { className: "truncate", children: item.label })] }));
    }
    return (_jsxs("aside", { className: clsx('flex flex-col h-full bg-gray-950 border-r border-gray-800 transition-all duration-200', sidebarCollapsed ? 'w-16' : 'w-56'), children: [_jsxs("div", { className: "flex items-center justify-between px-3 h-14 border-b border-gray-800", children: [!sidebarCollapsed && (_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("div", { className: "rounded-lg bg-blue-500/20 p-1.5", children: _jsx(Shield, { className: "h-4 w-4 text-blue-400" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-bold text-gray-100 leading-none", children: "ZonForge" }), _jsx("p", { className: "text-xs text-gray-600 leading-none mt-0.5", children: "Sentinel" })] })] })), sidebarCollapsed && (_jsx("div", { className: "mx-auto rounded-lg bg-blue-500/20 p-1.5", children: _jsx(Shield, { className: "h-4 w-4 text-blue-400" }) })), _jsx("button", { onClick: toggleSidebar, className: clsx('text-gray-600 hover:text-gray-400 p-1 rounded transition-colors', sidebarCollapsed && 'hidden'), children: _jsx(ChevronLeft, { className: "h-4 w-4" }) })] }), _jsx("nav", { className: "flex-1 px-2 py-3 space-y-0.5", children: NAV_MAIN.map(item => _jsx(NavRow, { item: item }, item.href)) }), _jsxs("div", { className: "px-2 py-3 border-t border-gray-800 space-y-0.5", children: [NAV_BOTTOM.map(item => _jsx(NavRow, { item: item }, item.href)), _jsxs("div", { className: clsx('flex items-center gap-3 px-3 py-2 mt-2 border-t border-gray-800/60 pt-3', sidebarCollapsed && 'justify-center'), children: [_jsx("div", { className: "flex-shrink-0 h-7 w-7 rounded-full bg-blue-500/20 flex items-center\n                          justify-center text-blue-400 font-bold text-xs", children: user?.name?.[0]?.toUpperCase() ?? '?' }), !sidebarCollapsed && (_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-xs font-medium text-gray-300 truncate", children: user?.name ?? '—' }), _jsx("p", { className: "text-xs text-gray-600 truncate", children: user?.role ?? '—' })] })), _jsx("button", { onClick: clearAuth, title: "Log out", className: "flex-shrink-0 text-gray-700 hover:text-red-400 transition-colors", children: _jsx(LogOut, { className: "h-3.5 w-3.5" }) })] })] })] }));
}
