import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
const BADGE_STYLES = {
    // Severity
    critical: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
    high: 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30',
    medium: 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30',
    low: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
    info: 'bg-gray-700 text-gray-400',
    // Status
    open: 'bg-red-500/10 text-red-400',
    investigating: 'bg-yellow-500/10 text-yellow-400',
    resolved: 'bg-green-500/10 text-green-400',
    suppressed: 'bg-gray-700 text-gray-500',
    false_positive: 'bg-gray-700 text-gray-500',
    // Priority
    P1: 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40',
    P2: 'bg-orange-500/20 text-orange-300',
    P3: 'bg-yellow-500/20 text-yellow-300',
    P4: 'bg-blue-500/20 text-blue-300',
    P5: 'bg-gray-700 text-gray-400',
    // Generic
    success: 'bg-green-500/15 text-green-400',
    warning: 'bg-yellow-500/15 text-yellow-400',
    error: 'bg-red-500/15 text-red-400',
    neutral: 'bg-gray-700 text-gray-400',
};
export function Badge({ variant, children, size = 'sm', dot = false, className, }) {
    return (_jsxs("span", { className: clsx('inline-flex items-center gap-1 rounded-full font-medium', size === 'xs' ? 'px-1.5 py-0.5 text-xs'
            : size === 'sm' ? 'px-2 py-0.5 text-xs'
                : 'px-2.5 py-1 text-sm', BADGE_STYLES[variant] ?? BADGE_STYLES.neutral, className), children: [dot && (_jsx("span", { className: clsx('h-1.5 w-1.5 rounded-full', {
                    'bg-red-400': ['critical', 'P1'].includes(variant),
                    'bg-orange-400': ['high', 'P2'].includes(variant),
                    'bg-yellow-400': ['medium', 'investigating', 'P3'].includes(variant),
                    'bg-blue-400': ['low', 'P4'].includes(variant),
                    'bg-green-400': ['resolved', 'success'].includes(variant),
                    'bg-gray-400': ['info', 'neutral', 'suppressed', 'false_positive'].includes(variant),
                }) })), children] }));
}
export const Button = forwardRef(({ variant = 'secondary', size = 'md', loading, icon: Icon, iconRight: IconRight, children, disabled, className, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all';
    const variants = {
        primary: 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700',
        secondary: 'bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700',
        ghost: 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
        danger: 'bg-red-600 text-white hover:bg-red-500',
        outline: 'border border-gray-700 text-gray-300 hover:border-gray-600 hover:text-gray-100',
    };
    const sizes = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-5 py-2.5 text-base',
    };
    return (_jsxs("button", { ref: ref, disabled: disabled || loading, className: clsx(base, variants[variant], sizes[size], (disabled || loading) && 'opacity-50 cursor-not-allowed', className), ...props, children: [loading
                ? _jsx(Loader2, { className: "h-4 w-4 animate-spin" })
                : Icon && _jsx(Icon, { className: clsx('flex-shrink-0', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4') }), children, !loading && IconRight && (_jsx(IconRight, { className: clsx('flex-shrink-0', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4') }))] }));
});
Button.displayName = 'Button';
// ─────────────────────────────────────────────
// SPINNER
// ─────────────────────────────────────────────
export function Spinner({ size = 'md', className }) {
    const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' };
    return (_jsx(Loader2, { className: clsx('animate-spin text-blue-500', sizes[size], className) }));
}
// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action, }) {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-center", children: [_jsx("div", { className: "rounded-full bg-gray-800/80 p-5 mb-4", children: _jsx(Icon, { className: "h-8 w-8 text-gray-600" }) }), _jsx("p", { className: "text-base font-medium text-gray-300 mb-1", children: title }), description && (_jsx("p", { className: "text-sm text-gray-500 max-w-xs", children: description })), action && _jsx("div", { className: "mt-5", children: action })] }));
}
// ─────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────
export function Skeleton({ className }) {
    return _jsx("div", { className: clsx('animate-pulse rounded bg-gray-800', className) });
}
export function SkeletonRows({ count = 4, cols = 4 }) {
    return (_jsx("div", { className: "divide-y divide-gray-800", children: [...Array(count)].map((_, i) => (_jsx("div", { className: "flex items-center gap-4 p-4", children: [...Array(cols)].map((_, j) => (_jsx(Skeleton, { className: clsx('h-4 flex-1', j === 0 && 'max-w-[2rem]', j === 1 && 'max-w-[50%]') }, j))) }, i))) }));
}
// ─────────────────────────────────────────────
// TOOLTIP (simple CSS-driven)
// ─────────────────────────────────────────────
export function Tooltip({ content, children, side = 'top', }) {
    return (_jsxs("div", { className: "relative group inline-flex", children: [children, _jsx("div", { className: clsx('pointer-events-none absolute z-50 hidden group-hover:flex', 'max-w-xs rounded-lg bg-gray-800 border border-gray-700', 'px-2.5 py-1.5 text-xs text-gray-200 whitespace-nowrap shadow-xl', side === 'top' && 'bottom-full left-1/2 -translate-x-1/2 mb-2', side === 'bottom' && 'top-full left-1/2 -translate-x-1/2 mt-2', side === 'left' && 'right-full top-1/2 -translate-y-1/2 mr-2', side === 'right' && 'left-full top-1/2 -translate-y-1/2 ml-2'), children: content })] }));
}
// ─────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────
export function Card({ children, className, padding = 'md', style, }) {
    return (_jsx("div", { style: style, className: clsx('rounded-xl border border-gray-800 bg-gray-900', padding === 'sm' && 'p-4', padding === 'md' && 'p-5', padding === 'lg' && 'p-6', padding === 'none' && '', className), children: children }));
}
export function CardHeader({ title, description, actions, icon: Icon, }) {
    return (_jsxs("div", { className: "flex items-start justify-between gap-4 mb-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [Icon && (_jsx("div", { className: "rounded-lg bg-gray-800 p-2", children: _jsx(Icon, { className: "h-4 w-4 text-gray-400" }) })), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold text-gray-200", children: title }), description && (_jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: description }))] })] }), actions && _jsx("div", { className: "flex items-center gap-2", children: actions })] }));
}
// ─────────────────────────────────────────────
// DIVIDER
// ─────────────────────────────────────────────
export function Divider({ label }) {
    if (!label)
        return _jsx("div", { className: "h-px bg-gray-800 my-4" });
    return (_jsxs("div", { className: "flex items-center gap-3 my-4", children: [_jsx("div", { className: "flex-1 h-px bg-gray-800" }), _jsx("span", { className: "text-xs text-gray-600 font-medium uppercase tracking-wider", children: label }), _jsx("div", { className: "flex-1 h-px bg-gray-800" })] }));
}
