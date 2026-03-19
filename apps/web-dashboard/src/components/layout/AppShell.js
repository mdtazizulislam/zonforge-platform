import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { clsx } from 'clsx';
import { Sidebar } from './Sidebar';
import { useUiStore } from '@/stores/auth.store';
export function AppShell({ children, title, actions }) {
    const { sidebarCollapsed } = useUiStore();
    return (_jsxs("div", { className: "flex h-screen overflow-hidden bg-gray-950", children: [_jsx(Sidebar, {}), _jsxs("main", { className: "flex-1 flex flex-col overflow-hidden", children: [(title || actions) && (_jsxs("header", { className: "flex items-center justify-between px-6 py-4 border-b border-gray-800\n                             bg-gray-950/90 backdrop-blur sticky top-0 z-10", children: [_jsx("h1", { className: "text-base font-semibold text-gray-100", children: title }), actions && _jsx("div", { className: "flex items-center gap-2", children: actions })] })), _jsx("div", { className: "flex-1 overflow-y-auto", children: children })] })] }));
}
// ── Page wrapper with padding ─────────────────
export function PageContent({ children, className }) {
    return (_jsx("div", { className: clsx('p-6 max-w-screen-2xl mx-auto', className), children: children }));
}
