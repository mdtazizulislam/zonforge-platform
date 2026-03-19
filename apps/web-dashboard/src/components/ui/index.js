import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { clsx } from 'clsx';
// ─────────────────────────────────────────────
// SEVERITY BADGE
// ─────────────────────────────────────────────
const SEVERITY_CLASSES = {
    critical: 'badge-critical',
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low',
    info: 'badge-info',
};
const SEVERITY_DOT = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-amber-500',
    low: 'bg-blue-500',
    info: 'bg-gray-500',
};
export function SeverityBadge({ severity, showDot = true, }) {
    return (_jsxs("span", { className: SEVERITY_CLASSES[severity] ?? 'badge bg-gray-500/15 text-gray-400', children: [showDot && (_jsx("span", { className: clsx('w-1.5 h-1.5 rounded-full', SEVERITY_DOT[severity] ?? 'bg-gray-500') })), severity.charAt(0).toUpperCase() + severity.slice(1)] }));
}
// ─────────────────────────────────────────────
// PRIORITY BADGE
// ─────────────────────────────────────────────
const PRIORITY_CLASSES = {
    P1: 'badge bg-red-600/20 text-red-400 ring-1 ring-red-600/40',
    P2: 'badge bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40',
    P3: 'badge bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
    P4: 'badge bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30',
    P5: 'badge bg-gray-500/10 text-gray-500 ring-1 ring-gray-500/20',
};
export function PriorityBadge({ priority }) {
    return (_jsx("span", { className: PRIORITY_CLASSES[priority] ?? PRIORITY_CLASSES['P4'], children: priority }));
}
// ─────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────
const STATUS_CLASSES = {
    open: 'badge bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
    investigating: 'badge bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
    resolved: 'badge bg-green-500/15 text-green-400 ring-1 ring-green-500/30',
    suppressed: 'badge bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30',
    false_positive: 'badge bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
};
export function StatusBadge({ status }) {
    const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return (_jsx("span", { className: STATUS_CLASSES[status] ?? STATUS_CLASSES['open'], children: label }));
}
// ─────────────────────────────────────────────
// SCORE INDICATOR (0–100 colored number)
// ─────────────────────────────────────────────
export function ScoreIndicator({ score, size = 'md' }) {
    const color = score >= 85 ? 'text-red-400'
        : score >= 70 ? 'text-orange-400'
            : score >= 50 ? 'text-amber-400'
                : score >= 25 ? 'text-blue-400'
                    : 'text-gray-400';
    const cls = size === 'lg' ? 'text-4xl font-bold' : size === 'sm' ? 'text-sm font-semibold' : 'text-xl font-bold';
    return _jsx("span", { className: clsx(cls, 'font-mono tabular-nums', color), children: score });
}
// ─────────────────────────────────────────────
// LOADING STATES
// ─────────────────────────────────────────────
export function Spinner({ size = 'md' }) {
    const s = size === 'lg' ? 'w-8 h-8' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
    return (_jsx("div", { className: clsx(s, 'border-2 border-gray-700 border-t-brand-500 rounded-full animate-spin') }));
}
export function SkeletonBox({ className }) {
    return _jsx("div", { className: clsx('bg-gray-800/70 rounded animate-pulse', className) });
}
export function CardSkeleton() {
    return (_jsxs("div", { className: "card p-5 space-y-3", children: [_jsx(SkeletonBox, { className: "h-4 w-32" }), _jsx(SkeletonBox, { className: "h-8 w-20" }), _jsx(SkeletonBox, { className: "h-3 w-48" })] }));
}
// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────
export function EmptyState({ icon, title, description, action, }) {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-center", children: [_jsx("div", { className: "w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 mb-4", children: icon }), _jsx("h3", { className: "text-sm font-semibold text-gray-300 mb-1", children: title }), _jsx("p", { className: "text-xs text-gray-500 max-w-xs", children: description }), action && _jsx("div", { className: "mt-4", children: action })] }));
}
// ─────────────────────────────────────────────
// DELTA INDICATOR (up/down arrow)
// ─────────────────────────────────────────────
export function Delta({ value, inverse = false }) {
    const isPositive = value > 0;
    const isGood = inverse ? !isPositive : isPositive;
    const color = value === 0 ? 'text-gray-500' : isGood ? 'text-green-400' : 'text-red-400';
    return (_jsxs("span", { className: clsx('inline-flex items-center gap-0.5 text-xs font-medium', color), children: [value !== 0 && (_jsx("span", { children: isPositive ? '↑' : '↓' })), Math.abs(value), "%"] }));
}
// ─────────────────────────────────────────────
// ERROR BOUNDARY FALLBACK
// ─────────────────────────────────────────────
export function ErrorCard({ message }) {
    return (_jsx("div", { className: "card p-5 border-red-500/30 bg-red-500/5", children: _jsxs("div", { className: "flex items-center gap-2 text-red-400", children: [_jsx("span", { className: "text-lg", children: "\u26A0" }), _jsx("span", { className: "text-sm font-medium", children: message ?? 'Failed to load data' })] }) }));
}
