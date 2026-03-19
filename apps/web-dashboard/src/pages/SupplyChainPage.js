import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageContent } from '@/components/layout/AppShell';
import { Button, Card, Skeleton } from '@/components/shared/ui';
import { Package, AlertTriangle, CheckCircle2, Upload, Search, Download, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Shield, Layers, } from 'lucide-react';
const H = () => ({ Authorization: `Bearer ${localStorage.getItem('zf_access_token')}` });
const HJ = () => ({ ...H(), 'Content-Type': 'application/json' });
const RISK_META = {
    critical: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    high: { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
    medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    low: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    safe: { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
};
const THREAT_LABELS = {
    typosquatting: '🎭 Typosquatting',
    dependency_confusion: '🔀 Dep. Confusion',
    malicious_code: '☠️ Malicious Code',
    compromised_account: '🔑 Compromised Maintainer',
    known_vulnerability: '🐛 Known CVE',
    abandoned_package: '🏚️ Abandoned',
    suspicious_maintainer: '👤 Suspicious Maintainer',
    protestware: '✊ Protestware',
    build_tampering: '⚒️ Build Tamper',
};
const GRADE_COLOR = {
    A: '#22c55e', B: '#3b82f6', C: '#eab308', D: '#f97316', F: '#ef4444',
};
function GradeRing({ grade, score }) {
    const r = 46, c = 2 * Math.PI * r;
    const fill = (score / 100) * c;
    const color = GRADE_COLOR[grade] ?? '#6b7280';
    return (_jsxs("div", { className: "relative inline-flex items-center justify-center", children: [_jsxs("svg", { width: "104", height: "104", viewBox: "0 0 104 104", children: [_jsx("circle", { cx: "52", cy: "52", r: r, fill: "none", stroke: "#1f2937", strokeWidth: "8" }), _jsx("circle", { cx: "52", cy: "52", r: r, fill: "none", stroke: color, strokeWidth: "8", strokeLinecap: "round", strokeDasharray: `${fill} ${c}`, transform: "rotate(-90 52 52)", style: { transition: 'stroke-dasharray .7s ease' } })] }), _jsxs("div", { className: "absolute flex flex-col items-center", children: [_jsx("span", { className: "text-3xl font-black leading-none", style: { color }, children: grade }), _jsxs("span", { className: "text-xs font-bold text-gray-500", children: [score, "/100"] })] })] }));
}
function FindingRow({ finding }) {
    const [open, setOpen] = useState(finding.riskLevel === 'critical');
    const risk = RISK_META[finding.riskLevel] ?? RISK_META['safe'];
    return (_jsxs("div", { className: clsx('border-b border-gray-800/50 last:border-0', finding.riskLevel === 'critical' && 'bg-red-500/3'), children: [_jsxs("button", { onClick: () => setOpen(v => !v), className: "w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-800/20 transition-colors", children: [_jsx("span", { className: clsx('flex-shrink-0 px-2 py-0.5 rounded text-xs font-bold capitalize', risk.bg, risk.color), children: finding.riskLevel }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm font-mono font-semibold text-gray-200 truncate", children: finding.name }), _jsxs("span", { className: "text-xs text-gray-600", children: ["@", finding.version] }), _jsx("span", { className: "text-xs text-gray-700 bg-gray-800 px-1.5 py-0.5 rounded", children: finding.ecosystem })] }), _jsx("div", { className: "flex items-center gap-2 mt-0.5 flex-wrap", children: finding.threatCategories?.map((t) => (_jsx("span", { className: "text-xs text-gray-500", children: THREAT_LABELS[t] ?? t }, t))) })] }), finding.cvssScore && _jsxs("span", { className: "text-xs font-bold text-orange-400 flex-shrink-0", children: ["CVSS ", finding.cvssScore.toFixed(1)] }), finding.cveIds?.[0] && _jsx("span", { className: "text-xs font-mono text-blue-400 flex-shrink-0", children: finding.cveIds[0] }), open ? _jsx(ChevronUp, { className: "h-4 w-4 text-gray-600 flex-shrink-0" }) : _jsx(ChevronDown, { className: "h-4 w-4 text-gray-600 flex-shrink-0" })] }), open && (_jsxs("div", { className: "px-5 pb-4 space-y-2", children: [_jsx("p", { className: "text-xs text-gray-400 leading-relaxed", children: finding.description }), finding.evidence?.length > 0 && (_jsx("div", { className: "space-y-1", children: finding.evidence.map((e, i) => (_jsxs("div", { className: "flex items-start gap-2 text-xs text-gray-500", children: [_jsx(AlertTriangle, { className: "h-3 w-3 text-orange-400 flex-shrink-0 mt-0.5" }), e] }, i))) })), finding.cveIds?.length > 0 && (_jsx("div", { className: "flex gap-2 flex-wrap", children: finding.cveIds.map((cve) => (_jsxs("a", { href: `https://nvd.nist.gov/vuln/detail/${cve}`, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1 text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded hover:underline", children: [cve, " ", _jsx(ExternalLink, { className: "h-2.5 w-2.5" })] }, cve))) }))] }))] }));
}
function ScanDetail({ scan }) {
    const [tab, setTab] = useState('findings');
    const findings = scan.findings ?? [];
    const critical = findings.filter((f) => f.riskLevel === 'critical');
    const high = findings.filter((f) => f.riskLevel === 'high');
    const medium = findings.filter((f) => f.riskLevel === 'medium');
    const safe = findings.filter((f) => ['safe', 'low'].includes(f.riskLevel));
    const score = Math.max(0, Math.min(100, 100 - critical.length * 25 - high.length * 10 - medium.length * 3));
    const grade = critical.length > 0 ? 'F' : high.length > 5 ? 'D' : high.length > 0 ? 'C' : medium.length > 5 ? 'B' : 'A';
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "flex items-start gap-5", children: [_jsx(GradeRing, { grade: grade, score: score }), _jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "text-base font-bold text-gray-100 mb-1", children: scan.projectName }), _jsxs("p", { className: "text-xs text-gray-500 mb-3", children: [scan.ecosystem, " \u00B7 ", scan.packageCount, " packages \u00B7 ", new Date(scan.createdAt).toLocaleString()] }), _jsx("div", { className: "grid grid-cols-4 gap-2", children: [
                                    { label: 'Critical', count: critical.length, c: 'text-red-400 bg-red-500/10' },
                                    { label: 'High', count: high.length, c: 'text-orange-400 bg-orange-500/10' },
                                    { label: 'Medium', count: medium.length, c: 'text-yellow-400 bg-yellow-500/10' },
                                    { label: 'Safe', count: safe.length, c: 'text-green-400 bg-green-500/10' },
                                ].map(s => (_jsxs("div", { className: clsx('rounded-lg p-2 text-center', s.c), children: [_jsx("p", { className: "text-xl font-bold tabular-nums", children: s.count }), _jsx("p", { className: "text-xs opacity-70", children: s.label })] }, s.label))) })] }), _jsxs("button", { onClick: () => window.open(`/api/v1/supply-chain/scans/${scan.id}/sbom?format=cyclonedx`, '_blank'), className: "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors flex-shrink-0", children: [_jsx(Download, { className: "h-3.5 w-3.5" }), " SBOM"] })] }), _jsx("div", { className: "flex gap-1 border-b border-gray-800", children: [
                    { id: 'findings', label: `Findings (${findings.filter((f) => f.riskLevel !== 'safe').length})` },
                    { id: 'sbom', label: `SBOM (${scan.sbom?.length ?? 0})` },
                ].map(t => (_jsx("button", { onClick: () => setTab(t.id), className: clsx('px-4 py-2.5 text-sm font-medium border-b-2 transition-all', tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'), children: t.label }, t.id))) }), tab === 'findings' && (_jsx(Card, { padding: "none", children: findings.filter((f) => f.riskLevel !== 'safe').length === 0 ? (_jsxs("div", { className: "flex flex-col items-center py-10 text-center", children: [_jsx(CheckCircle2, { className: "h-8 w-8 text-green-400 mb-2" }), _jsx("p", { className: "text-sm font-medium text-gray-300", children: "No vulnerabilities detected" }), _jsx("p", { className: "text-xs text-gray-600 mt-1", children: "All packages appear safe" })] })) : ['critical', 'high', 'medium', 'low'].map(level => {
                    const lf = findings.filter((f) => f.riskLevel === level);
                    if (!lf.length)
                        return null;
                    return (_jsxs("div", { children: [_jsxs("div", { className: clsx('px-5 py-2 text-xs font-bold uppercase tracking-wider border-b border-gray-800 bg-gray-900/60', RISK_META[level]?.color), children: [level, " (", lf.length, ")"] }), lf.map((f) => _jsx(FindingRow, { finding: f }, f.id))] }, level));
                }) })), tab === 'sbom' && (_jsxs(Card, { padding: "none", children: [_jsxs("div", { className: "grid grid-cols-5 gap-3 px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-800/40 border-b border-gray-800", children: [_jsx("div", { className: "col-span-2", children: "Package" }), _jsx("div", { children: "Version" }), _jsx("div", { children: "Ecosystem" }), _jsx("div", { children: "Risk" })] }), _jsx("div", { className: "max-h-96 overflow-y-auto", children: (scan.sbom ?? []).map((e, i) => (_jsxs("div", { className: "grid grid-cols-5 gap-3 px-5 py-2.5 border-b border-gray-800/40 last:border-0 hover:bg-gray-800/20", children: [_jsx("div", { className: "col-span-2 text-xs font-mono text-gray-300 truncate", children: e.name }), _jsx("div", { className: "text-xs font-mono text-gray-500", children: e.version }), _jsx("div", { className: "text-xs text-gray-600", children: e.ecosystem }), _jsx("div", { children: _jsx("span", { className: clsx('text-xs font-medium capitalize', RISK_META[e.riskLevel ?? 'safe']?.color), children: e.riskLevel ?? 'safe' }) })] }, i))) })] }))] }));
}
export default function SupplyChainPage() {
    const [selectedScanId, setSelected] = useState(null);
    const [quickPkg, setQuickPkg] = useState({ name: '', version: '', ecosystem: 'npm' });
    const [quickResult, setQResult] = useState(null);
    const [quickLoad, setQLoad] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);
    const qc = useQueryClient();
    const { data: scansData, isLoading } = useQuery({
        queryKey: ['supply-chain-scans'],
        queryFn: () => fetch('/api/v1/supply-chain/scans', { headers: H() }).then(r => r.json()),
        staleTime: 60_000,
    });
    const { data: detailData } = useQuery({
        queryKey: ['supply-chain-scan', selectedScanId],
        queryFn: () => fetch(`/api/v1/supply-chain/scans/${selectedScanId}`, { headers: H() }).then(r => r.json()),
        enabled: !!selectedScanId,
        staleTime: 30_000,
    });
    const scans = scansData?.data ?? [];
    const detail = detailData?.data;
    async function handleUpload(file) {
        setUploading(true);
        const form = new FormData();
        form.append('file', file);
        const r = await fetch('/api/v1/supply-chain/scan', { method: 'POST', headers: H(), body: form });
        const data = await r.json();
        if (data.success) {
            setSelected(data.data.scanId);
            qc.invalidateQueries({ queryKey: ['supply-chain-scans'] });
        }
        setUploading(false);
    }
    async function quickCheck() {
        if (!quickPkg.name.trim())
            return;
        setQLoad(true);
        setQResult(null);
        const r = await fetch('/api/v1/supply-chain/check-package', {
            method: 'POST', headers: HJ(), body: JSON.stringify(quickPkg),
        });
        const data = await r.json();
        setQResult(data.data);
        setQLoad(false);
    }
    const totalCritical = scans.reduce((s, sc) => s + (sc.criticalCount ?? 0), 0);
    const totalPackages = scans.reduce((s, sc) => s + (sc.packageCount ?? 0), 0);
    return (_jsx(AppShell, { title: "Supply Chain Intelligence", actions: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", icon: Upload, disabled: uploading, onClick: () => fileRef.current?.click(), children: uploading ? 'Scanning…' : 'Upload Manifest' }), _jsx("input", { ref: fileRef, type: "file", className: "hidden", accept: ".json,.txt,.xml,.toml,.lock,.sum,.mod", onChange: e => { const f = e.target.files?.[0]; if (f)
                        handleUpload(f); } })] }), children: _jsxs(PageContent, { children: [_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6", children: [
                        { label: 'Projects Scanned', value: scans.length, icon: Layers, color: 'text-blue-400' },
                        { label: 'Total Packages', value: totalPackages.toLocaleString(), icon: Package, color: 'text-gray-200' },
                        { label: 'Critical Findings', value: totalCritical, icon: AlertTriangle, color: totalCritical > 0 ? 'text-red-400' : 'text-gray-400' },
                        { label: 'Ecosystems', value: '8', icon: Shield, color: 'text-green-400' },
                    ].map(k => (_jsxs(Card, { className: "flex items-center gap-3", children: [_jsx(k.icon, { className: clsx('h-5 w-5 flex-shrink-0', k.color) }), _jsxs("div", { children: [_jsx("p", { className: clsx('text-2xl font-bold', k.color), children: k.value }), _jsx("p", { className: "text-xs text-gray-500", children: k.label })] })] }, k.label))) }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Quick Package Check" }), _jsxs("div", { className: "space-y-2", children: [_jsx("input", { type: "text", value: quickPkg.name, onChange: e => setQuickPkg(p => ({ ...p, name: e.target.value })), onKeyDown: e => e.key === 'Enter' && quickCheck(), placeholder: "Package name", className: "w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", value: quickPkg.version, onChange: e => setQuickPkg(p => ({ ...p, version: e.target.value })), placeholder: "Version", className: "flex-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" }), _jsx("select", { value: quickPkg.ecosystem, onChange: e => setQuickPkg(p => ({ ...p, ecosystem: e.target.value })), className: "px-2 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-xs text-gray-300 focus:outline-none", children: ['npm', 'pypi', 'maven', 'cargo', 'go', 'rubygems', 'nuget'].map(e => _jsx("option", { value: e, children: e }, e)) })] }), _jsx(Button, { variant: "primary", size: "sm", icon: quickLoad ? RefreshCw : Search, onClick: quickCheck, disabled: quickLoad || !quickPkg.name.trim(), className: "w-full", children: quickLoad ? 'Checking…' : 'Check Package' })] }), quickResult && (_jsxs("div", { className: clsx('mt-3 p-3 rounded-xl border text-xs', quickResult.riskLevel === 'safe' ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20'), children: [_jsxs("div", { className: "flex items-center gap-2 mb-1.5", children: [quickResult.riskLevel === 'safe'
                                                            ? _jsx(CheckCircle2, { className: "h-4 w-4 text-green-400" })
                                                            : _jsx(AlertTriangle, { className: "h-4 w-4 text-red-400" }), _jsxs("span", { className: clsx('font-bold uppercase', RISK_META[quickResult.riskLevel]?.color), children: [quickResult.riskLevel, " risk"] }), _jsxs("span", { className: "font-mono text-gray-500 ml-auto", children: [quickResult.package.name, "@", quickResult.package.version || 'latest'] })] }), quickResult.threats?.map((t) => _jsx("div", { className: "text-gray-400", children: THREAT_LABELS[t] ?? t }, t)), quickResult.riskLevel === 'safe' && _jsx("p", { className: "text-green-400/80", children: "No known threats detected" })] }))] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3", children: "Scanned Projects" }), isLoading ? (_jsx("div", { className: "space-y-2", children: [...Array(3)].map((_, i) => _jsx(Skeleton, { className: "h-16 w-full" }, i)) })) : scans.length === 0 ? (_jsxs("div", { className: "rounded-xl border border-dashed border-gray-700 py-10 text-center", children: [_jsx(Upload, { className: "h-8 w-8 text-gray-700 mx-auto mb-2" }), _jsx("p", { className: "text-sm text-gray-500", children: "No manifests scanned yet" }), _jsx("p", { className: "text-xs text-gray-700 mt-1", children: "Upload package.json, requirements.txt, go.mod\u2026" })] })) : scans.map((sc) => {
                                            const grade = sc.criticalCount > 0 ? 'F' : sc.highCount > 0 ? 'C' : 'A';
                                            const color = GRADE_COLOR[grade] ?? '#6b7280';
                                            return (_jsxs("button", { onClick: () => setSelected(sc.id), className: clsx('w-full flex items-center gap-3 p-3.5 rounded-xl border mb-2 text-left transition-all', selectedScanId === sc.id ? 'border-blue-500/50 bg-blue-500/5' : 'border-gray-800 hover:border-gray-700'), children: [_jsx("div", { className: "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-black", style: { background: `${color}18`, color }, children: grade }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-gray-200 truncate", children: sc.projectName }), _jsxs("p", { className: "text-xs text-gray-600", children: [sc.ecosystem, " \u00B7 ", sc.packageCount, " pkgs", sc.criticalCount > 0 && _jsxs("span", { className: "text-red-400 ml-1", children: ["\u00B7 ", sc.criticalCount, " critical"] })] })] })] }, sc.id));
                                        })] }), _jsxs(Card, { className: "bg-gray-900/40", children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2", children: "Supported Manifests" }), [['npm/Node.js', 'package.json, package-lock.json'], ['Python', 'requirements.txt, Pipfile.lock'], ['Java', 'pom.xml'], ['Rust', 'Cargo.toml'], ['Go', 'go.mod, go.sum']].map(([eco, files]) => (_jsxs("div", { className: "flex items-baseline gap-2 py-1.5 border-b border-gray-800 last:border-0", children: [_jsx("span", { className: "text-xs font-medium text-gray-400 w-24 flex-shrink-0", children: eco }), _jsx("span", { className: "text-xs font-mono text-gray-600 truncate", children: files })] }, eco)))] })] }), _jsx("div", { className: "lg:col-span-2", children: !selectedScanId ? (_jsxs(Card, { className: "flex flex-col items-center justify-center py-20 h-full", children: [_jsx("div", { className: "rounded-2xl bg-gray-800/50 p-5 mb-4", children: _jsx(Shield, { className: "h-10 w-10 text-gray-600" }) }), _jsx("p", { className: "text-sm font-medium text-gray-400 mb-2", children: "Select a project or upload a manifest" }), _jsx("div", { className: "mt-4 grid grid-cols-3 gap-2 text-xs text-center", children: ['OSV.dev CVEs', 'Typosquatting', 'Malicious DB', 'SBOM Export', 'CycloneDX', 'Auto-alerts'].map(f => (_jsxs("div", { className: "flex items-center gap-1 p-2 rounded-lg bg-gray-800/40 text-gray-600", children: [_jsx(CheckCircle2, { className: "h-3 w-3 text-green-500/60 flex-shrink-0" }), f] }, f))) })] })) : !detail ? (_jsx(Card, { className: "flex items-center justify-center py-16", children: _jsx(RefreshCw, { className: "h-6 w-6 text-gray-600 animate-spin" }) })) : (_jsx(ScanDetail, { scan: detail })) })] })] }) }));
}
