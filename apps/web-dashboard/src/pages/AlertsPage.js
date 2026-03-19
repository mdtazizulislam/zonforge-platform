import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { AlertQueuePanel } from '@/components/alert/AlertQueuePanel';
import { AlertWorkflowPanel } from '@/components/alert/AlertWorkflowPanel';
import { AlertContextPanel } from '@/components/alert/AlertContextPanel';
import { useAlert } from '@/hooks/queries';
import { useAuthStore } from '@/stores/auth.store';
import { ShieldAlert, ChevronLeft, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, } from 'lucide-react';
// ─────────────────────────────────────────────
// ANALYST ALERT CENTER — 3-pane layout
//
//  LEFT (w-72):  AlertQueuePanel   — prioritized queue
//  CENTER:       AlertWorkflowPanel — investigation workspace
//  RIGHT (w-72): AlertContextPanel  — entity risk + MITRE
// ─────────────────────────────────────────────
export default function AlertsPage() {
    const { id: alertId } = useParams();
    const user = useAuthStore(s => s.user);
    const [leftOpen, setLeftOpen] = useState(true);
    const [rightOpen, setRightOpen] = useState(true);
    const { data: alertData } = useAlert(alertId ?? '');
    const alert = alertData?.data;
    // Keyboard shortcuts
    useEffect(() => {
        function handleKey(e) {
            if (e.key === '[' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setLeftOpen(v => !v);
            }
            if (e.key === ']' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setRightOpen(v => !v);
            }
        }
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);
    return (_jsxs("div", { className: "flex flex-col h-screen overflow-hidden bg-gray-950", children: [_jsxs("header", { className: "flex-shrink-0 flex items-center justify-between\n                         px-4 py-2.5 border-b border-gray-800 bg-gray-950/95 backdrop-blur z-10", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Link, { to: "/dashboard", className: "p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors", children: _jsx(ChevronLeft, { className: "h-4 w-4" }) }), _jsx(ShieldAlert, { className: "h-4 w-4 text-red-400" }), _jsx("span", { className: "text-sm font-bold text-gray-100", children: "Alert Center" }), _jsxs("div", { className: "hidden lg:flex items-center gap-1 ml-3", children: [_jsx("button", { onClick: () => setLeftOpen(v => !v), className: clsx('p-1.5 rounded transition-colors', leftOpen ? 'text-blue-400 bg-blue-500/10' : 'text-gray-600 hover:text-gray-400'), title: "Toggle queue (\u2318[)", children: leftOpen
                                            ? _jsx(PanelLeftClose, { className: "h-4 w-4" })
                                            : _jsx(PanelLeft, { className: "h-4 w-4" }) }), _jsx("button", { onClick: () => setRightOpen(v => !v), className: clsx('p-1.5 rounded transition-colors', rightOpen ? 'text-blue-400 bg-blue-500/10' : 'text-gray-600 hover:text-gray-400'), title: "Toggle context (\u2318])", children: rightOpen
                                            ? _jsx(PanelRightClose, { className: "h-4 w-4" })
                                            : _jsx(PanelRight, { className: "h-4 w-4" }) })] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [alert && (_jsx("p", { className: "hidden md:block text-sm text-gray-500 max-w-md truncate", children: alert.title })), _jsx("span", { className: "text-xs text-gray-700", children: user?.role })] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsx("div", { className: clsx('flex-shrink-0 border-r border-gray-800 overflow-hidden', 'transition-all duration-200 ease-in-out', leftOpen ? 'w-72 xl:w-80' : 'w-0'), children: leftOpen && _jsx(AlertQueuePanel, {}) }), _jsx("div", { className: "flex-1 overflow-hidden", children: alertId ? (_jsx(AlertWorkflowPanel, { alertId: alertId })) : (_jsxs("div", { className: "flex flex-col items-center justify-center h-full text-center px-8", children: [_jsx("div", { className: "rounded-full bg-gray-800 p-6 mb-5", children: _jsx(ShieldAlert, { className: "h-10 w-10 text-gray-600" }) }), _jsx("h3", { className: "text-lg font-semibold text-gray-300 mb-2", children: "Select an alert to investigate" }), _jsx("p", { className: "text-sm text-gray-500 max-w-sm", children: "Choose an alert from the queue to begin investigation. P1 alerts are shown first." }), _jsxs("div", { className: "mt-6 flex items-center gap-4 text-xs text-gray-700", children: [_jsxs("span", { children: [_jsx("kbd", { className: "px-2 py-1 rounded bg-gray-800 border border-gray-700 font-mono", children: "\u2318[" }), " Queue"] }), _jsxs("span", { children: [_jsx("kbd", { className: "px-2 py-1 rounded bg-gray-800 border border-gray-700 font-mono", children: "\u2318]" }), " Context"] })] })] })) }), _jsx("div", { className: clsx('flex-shrink-0 border-l border-gray-800 overflow-hidden', 'transition-all duration-200 ease-in-out', rightOpen && alertId ? 'w-72 xl:w-80' : 'w-0'), children: rightOpen && alertId && alert && (_jsx(AlertContextPanel, { alert: alert })) })] })] }));
}
