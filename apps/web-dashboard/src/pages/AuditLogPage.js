import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Construction } from 'lucide-react';
export default function AuditLogPage() {
    return _jsx(AppShell, { title: "Audit Log", children: _jsx(PageContent, { children: _jsxs("div", { className: "flex flex-col items-center justify-center min-h-[60vh] text-center", children: [_jsx("div", { className: "rounded-full bg-blue-500/10 p-5 mb-4", children: _jsx(Construction, { className: "h-10 w-10 text-blue-400" }) }), _jsx("h2", { className: "text-xl font-bold text-gray-200 mb-2", children: "Tamper-Evident Audit Log" }), _jsx("p", { className: "text-gray-500 max-w-sm", children: "Audit log viewer coming in Serial 14." })] }) }) });
}
