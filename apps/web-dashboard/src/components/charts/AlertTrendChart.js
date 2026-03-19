import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, } from 'recharts';
import { format, subDays } from 'date-fns';
// Mock data generator for UI preview when real data loads
function generateMockTrend() {
    return Array.from({ length: 30 }, (_, i) => {
        const date = subDays(new Date(), 29 - i);
        return {
            date: format(date, 'MMM d'),
            critical: Math.floor(Math.random() * 3),
            high: Math.floor(Math.random() * 8) + 1,
            medium: Math.floor(Math.random() * 15) + 2,
        };
    });
}
const CustomTooltip = ({ active, payload, label, }) => {
    if (!active || !payload?.length)
        return null;
    return (_jsxs("div", { className: "card-sm px-3 py-2 shadow-xl", children: [_jsx("p", { className: "text-xs font-medium text-gray-400 mb-2", children: label }), payload.map(entry => (_jsxs("div", { className: "flex items-center justify-between gap-4 text-xs", children: [_jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "w-2 h-2 rounded-full", style: { backgroundColor: entry.color } }), _jsx("span", { className: "text-gray-400 capitalize", children: entry.name })] }), _jsx("span", { className: "font-mono font-semibold text-gray-200", children: entry.value })] }, entry.name)))] }));
};
export function AlertTrendChart({ data, loading }) {
    const chartData = data ?? generateMockTrend();
    if (loading) {
        return (_jsx("div", { className: "h-48 flex items-center justify-center", children: _jsx("div", { className: "w-6 h-6 border-2 border-gray-700 border-t-brand-500 rounded-full animate-spin" }) }));
    }
    return (_jsx(ResponsiveContainer, { width: "100%", height: 200, children: _jsxs(AreaChart, { data: chartData, margin: { top: 4, right: 4, bottom: 0, left: -24 }, children: [_jsxs("defs", { children: [_jsxs("linearGradient", { id: "critical", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#dc2626", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "#dc2626", stopOpacity: 0 })] }), _jsxs("linearGradient", { id: "high", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#ea580c", stopOpacity: 0.25 }), _jsx("stop", { offset: "95%", stopColor: "#ea580c", stopOpacity: 0 })] }), _jsxs("linearGradient", { id: "medium", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#f59e0b", stopOpacity: 0.2 }), _jsx("stop", { offset: "95%", stopColor: "#f59e0b", stopOpacity: 0 })] })] }), _jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#1f2937", vertical: false }), _jsx(XAxis, { dataKey: "date", tick: { fill: '#6b7280', fontSize: 10 }, tickLine: false, axisLine: false, interval: 6 }), _jsx(YAxis, { tick: { fill: '#6b7280', fontSize: 10 }, tickLine: false, axisLine: false, allowDecimals: false }), _jsx(Tooltip, { content: _jsx(CustomTooltip, {}) }), _jsx(Area, { type: "monotone", dataKey: "critical", stroke: "#dc2626", strokeWidth: 1.5, fill: "url(#critical)", dot: false }), _jsx(Area, { type: "monotone", dataKey: "high", stroke: "#ea580c", strokeWidth: 1.5, fill: "url(#high)", dot: false }), _jsx(Area, { type: "monotone", dataKey: "medium", stroke: "#f59e0b", strokeWidth: 1.5, fill: "url(#medium)", dot: false })] }) }));
}
