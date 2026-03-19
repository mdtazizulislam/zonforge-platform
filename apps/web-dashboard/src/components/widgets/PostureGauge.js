import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { clsx } from 'clsx';
function getScoreColor(score) {
    if (score >= 91)
        return { stroke: '#22c55e', text: 'text-green-400', label: 'Excellent' };
    if (score >= 76)
        return { stroke: '#14b8a6', text: 'text-teal-400', label: 'Good' };
    if (score >= 61)
        return { stroke: '#f59e0b', text: 'text-amber-400', label: 'Moderate' };
    if (score >= 41)
        return { stroke: '#ea580c', text: 'text-orange-400', label: 'Poor' };
    return { stroke: '#dc2626', text: 'text-red-400', label: 'Critical' };
}
export function PostureGauge({ score, prevScore, size = 'md', loading }) {
    const sizeClass = size === 'lg' ? 'w-48' : size === 'sm' ? 'w-28' : 'w-36';
    if (loading) {
        return (_jsxs("div", { className: clsx('flex flex-col items-center animate-pulse', sizeClass), children: [_jsx("div", { className: "h-16 w-full rounded-lg bg-gray-800" }), _jsx("div", { className: "mt-2 h-3 w-16 rounded bg-gray-800" })] }));
    }
    const { stroke, text, label } = getScoreColor(score);
    // SVG arc math
    const R = 70; // radius
    const cx = 100; // center x
    const cy = 100; // center y
    const START = 210; // start angle (degrees)
    const END = 330; // total arc degrees
    function polarToCartesian(deg) {
        const rad = ((deg - 90) * Math.PI) / 180;
        return {
            x: cx + R * Math.cos(rad),
            y: cy + R * Math.sin(rad),
        };
    }
    function describeArc(startDeg, endDeg) {
        const s = polarToCartesian(startDeg);
        const e = polarToCartesian(endDeg);
        const big = endDeg - startDeg > 180 ? 1 : 0;
        return `M ${s.x} ${s.y} A ${R} ${R} 0 ${big} 1 ${e.x} ${e.y}`;
    }
    const filledAngle = START + (score / 100) * END;
    const bgPath = describeArc(START, START + END);
    const fillPath = score > 0 ? describeArc(START, filledAngle) : null;
    const delta = prevScore !== undefined ? score - prevScore : null;
    return (_jsxs("div", { className: clsx('flex flex-col items-center', sizeClass), children: [_jsx("div", { className: "relative w-full", children: _jsxs("svg", { viewBox: "0 0 200 130", className: "w-full overflow-visible", children: [_jsx("path", { d: bgPath, fill: "none", stroke: "#1f2937", strokeWidth: "12", strokeLinecap: "round" }), fillPath && (_jsx("path", { d: fillPath, fill: "none", stroke: stroke, strokeWidth: "12", strokeLinecap: "round", className: "transition-all duration-1000 ease-out", style: { filter: `drop-shadow(0 0 6px ${stroke}60)` } })), _jsx("text", { x: cx, y: cy + 10, textAnchor: "middle", className: "font-mono font-bold", fill: stroke, fontSize: "28", fontFamily: "JetBrains Mono, monospace", children: score }), _jsx("text", { x: cx, y: cy + 26, textAnchor: "middle", fill: "#6b7280", fontSize: "9", fontFamily: "Inter, sans-serif", children: "/100" })] }) }), _jsxs("div", { className: "text-center -mt-2", children: [_jsx("p", { className: clsx('text-sm font-semibold', text), children: label }), delta !== null && delta !== 0 && (_jsxs("p", { className: clsx('text-xs mt-0.5', delta > 0 ? 'text-green-400' : 'text-red-400'), children: [delta > 0 ? '↑' : '↓', " ", Math.abs(delta), " pts"] }))] })] }));
}
