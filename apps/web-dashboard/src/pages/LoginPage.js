import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useLocation } from 'wouter';
import { api, tokenStorage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Spinner } from '@/components/ui';
export function LoginPage() {
    const [, navigate] = useLocation();
    const setUser = useAuthStore(s => s.setUser);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [totp, setTotp] = useState('');
    const [needsMfa, setNeedsMfa] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await api.auth.login(email, password, needsMfa ? totp : undefined);
            if (result.requiresMfa) {
                setNeedsMfa(true);
                setLoading(false);
                return;
            }
            tokenStorage.set(result.accessToken);
            tokenStorage.setRefresh(result.refreshToken);
            setUser(result.user);
            navigate('/');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "min-h-screen bg-gray-950 flex items-center justify-center p-4", children: [_jsx("div", { className: "absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)]\n                      bg-[size:4rem_4rem] opacity-30 pointer-events-none" }), _jsxs("div", { className: "relative w-full max-w-sm", children: [_jsxs("div", { className: "flex flex-col items-center mb-8", children: [_jsx("div", { className: "w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center mb-4 shadow-lg shadow-brand-600/30", children: _jsx("span", { className: "text-white text-xl font-bold", children: "Z" }) }), _jsx("h1", { className: "text-xl font-bold text-gray-100", children: "ZonForge Sentinel" }), _jsx("p", { className: "text-sm text-gray-500 mt-1", children: "AI-Powered Cyber Early Warning" })] }), _jsxs("div", { className: "card p-6 shadow-2xl shadow-black/50", children: [_jsx("h2", { className: "text-sm font-semibold text-gray-300 mb-5", children: needsMfa ? 'Two-Factor Authentication' : 'Sign in to your account' }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [!needsMfa ? (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-400 mb-1.5", children: "Email" }), _jsx("input", { type: "email", required: true, className: "input", placeholder: "analyst@company.com", value: email, onChange: e => setEmail(e.target.value), autoComplete: "email", autoFocus: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-400 mb-1.5", children: "Password" }), _jsx("input", { type: "password", required: true, className: "input", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", value: password, onChange: e => setPassword(e.target.value), autoComplete: "current-password" })] })] })) : (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-400 mb-1.5", children: "Authenticator code" }), _jsx("input", { type: "text", required: true, className: "input font-mono text-center tracking-[0.25em] text-lg", placeholder: "000 000", value: totp, onChange: e => setTotp(e.target.value.replace(/\s/g, '')), maxLength: 6, autoFocus: true, inputMode: "numeric" }), _jsx("p", { className: "text-xs text-gray-500 mt-2 text-center", children: "Enter the 6-digit code from your authenticator app" })] })), error && (_jsx("div", { className: "px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30", children: _jsx("p", { className: "text-xs text-red-400", children: error }) })), _jsxs("button", { type: "submit", disabled: loading, className: "btn-primary w-full justify-center", children: [loading ? _jsx(Spinner, { size: "sm" }) : null, needsMfa ? 'Verify' : 'Sign In'] }), needsMfa && (_jsx("button", { type: "button", onClick: () => { setNeedsMfa(false); setTotp(''); }, className: "btn-ghost w-full justify-center text-gray-500", children: "\u2190 Back to login" }))] })] }), _jsx("p", { className: "text-center text-xs text-gray-600 mt-4", children: "Protected by ZonForge Sentinel v4.6.0" })] })] }));
}
