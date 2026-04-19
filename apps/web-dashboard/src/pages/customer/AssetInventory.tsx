import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../api/client";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Asset {
  id: string;
  name: string;
  type: "server" | "workstation" | "database" | "api" | "cloud" | "network";
  ip_address: string;
  hostname: string;
  os?: string;
  owner?: string;
  department?: string;
  criticality: "critical" | "high" | "medium" | "low";
  internet_facing: boolean;
  risk_score: number;
  severity: "critical" | "high" | "medium" | "low";
  active_alerts: number;
  vulnerabilities: { critical: number; high: number; medium: number; low: number };
  connectors: string[];
  last_seen: string;
  tags: string[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockAssets: Asset[] = [
  {
    id: "1", name: "prod-api-server-01", type: "server",
    ip_address: "203.0.113.42", hostname: "api-prod-01.acme.internal",
    os: "Ubuntu 22.04", owner: "DevOps Team", department: "Engineering",
    criticality: "critical", internet_facing: true, risk_score: 91, severity: "critical",
    active_alerts: 3, vulnerabilities: { critical: 2, high: 4, medium: 8, low: 12 },
    connectors: ["AWS CloudTrail", "M365"], last_seen: new Date(Date.now() - 60000).toISOString(),
    tags: ["production", "public-facing", "api"],
  },
  {
    id: "2", name: "vpn-gateway", type: "network",
    ip_address: "203.0.113.10", hostname: "vpn.acme.com",
    os: "Cisco IOS", owner: "IT Team", department: "IT",
    criticality: "critical", internet_facing: true, risk_score: 74, severity: "high",
    active_alerts: 1, vulnerabilities: { critical: 0, high: 2, medium: 5, low: 3 },
    connectors: ["Firewall Logs"], last_seen: new Date(Date.now() - 120000).toISOString(),
    tags: ["network", "public-facing"],
  },
  {
    id: "3", name: "prod-database-01", type: "database",
    ip_address: "10.0.1.50", hostname: "db-prod-01.acme.internal",
    os: "PostgreSQL 15", owner: "Backend Team", department: "Engineering",
    criticality: "critical", internet_facing: false, risk_score: 45, severity: "medium",
    active_alerts: 0, vulnerabilities: { critical: 0, high: 1, medium: 3, low: 6 },
    connectors: ["AWS CloudTrail"], last_seen: new Date(Date.now() - 300000).toISOString(),
    tags: ["production", "database", "pii"],
  },
  {
    id: "4", name: "dev-workstation-john", type: "workstation",
    ip_address: "10.0.2.100", hostname: "DESKTOP-JSMITH.acme.local",
    os: "Windows 11", owner: "John Smith", department: "Engineering",
    criticality: "medium", internet_facing: false, risk_score: 87, severity: "critical",
    active_alerts: 2, vulnerabilities: { critical: 1, high: 3, medium: 7, low: 14 },
    connectors: ["M365"], last_seen: new Date(Date.now() - 600000).toISOString(),
    tags: ["workstation", "elevated-user"],
  },
  {
    id: "5", name: "analytics-api", type: "api",
    ip_address: "203.0.113.88", hostname: "analytics.acme.com",
    os: "Node.js", owner: "Data Team", department: "Analytics",
    criticality: "high", internet_facing: true, risk_score: 62, severity: "medium",
    active_alerts: 1, vulnerabilities: { critical: 0, high: 2, medium: 4, low: 8 },
    connectors: ["API Gateway", "AWS CloudTrail"], last_seen: new Date(Date.now() - 180000).toISOString(),
    tags: ["production", "public-facing"],
  },
  {
    id: "6", name: "aws-s3-customer-data", type: "cloud",
    ip_address: "—", hostname: "s3://acme-customer-data",
    os: "AWS S3", owner: "Backend Team", department: "Engineering",
    criticality: "critical", internet_facing: false, risk_score: 38, severity: "low",
    active_alerts: 0, vulnerabilities: { critical: 0, high: 0, medium: 2, low: 4 },
    connectors: ["AWS CloudTrail"], last_seen: new Date(Date.now() - 900000).toISOString(),
    tags: ["cloud", "storage", "pii", "compliant"],
  },
  {
    id: "7", name: "staging-api-server", type: "server",
    ip_address: "203.0.113.55", hostname: "api-staging.acme.com",
    os: "Ubuntu 22.04", owner: "DevOps Team", department: "Engineering",
    criticality: "medium", internet_facing: true, risk_score: 55, severity: "medium",
    active_alerts: 0, vulnerabilities: { critical: 1, high: 2, medium: 3, low: 5 },
    connectors: ["AWS CloudTrail"], last_seen: new Date(Date.now() - 1800000).toISOString(),
    tags: ["staging", "public-facing"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const typeIcon: Record<string, string> = {
  server: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2",
  workstation: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  database: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4",
  api: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  cloud: "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z",
  network: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v10m0 0h10M9 13H5m0 0v6a2 2 0 002 2h14a2 2 0 002-2v-6m-18 0h18",
};

const sevColor: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-green-400 bg-green-500/10 border-green-500/30",
};

const critColor: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-green-400",
};

const scoreColor = (s: number) =>
  s >= 85 ? "text-red-400" : s >= 70 ? "text-orange-400" : s >= 50 ? "text-yellow-400" : "text-green-400";

// ─── Exposure Map Component ───────────────────────────────────────────────────
function ExposureMap({ assets }: { assets: Asset[] }) {
  const internetFacing = assets.filter(a => a.internet_facing);
  const internal = assets.filter(a => !a.internet_facing);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <h2 className="text-sm font-semibold text-white mb-4">
        Network Exposure Map
        <span className="ml-2 text-xs text-slate-400 font-normal">
          {internetFacing.length} internet-facing · {internal.length} internal
        </span>
      </h2>

      <div className="relative">
        {/* Internet Zone */}
        <div className="border-2 border-dashed border-red-800/60 rounded-xl p-4 mb-3 bg-red-950/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
              Internet-Facing Zone — HIGH EXPOSURE
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {internetFacing.map(asset => (
              <div key={asset.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-900 cursor-pointer hover:border-slate-500 transition-all ${
                  asset.severity === "critical" ? "border-red-700/60" :
                  asset.severity === "high" ? "border-orange-700/60" : "border-slate-700"
                }`}>
                <svg className={`w-4 h-4 ${critColor[asset.severity]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeIcon[asset.type]} />
                </svg>
                <div>
                  <p className="text-xs font-medium text-white">{asset.name}</p>
                  <p className="text-xs text-slate-400">{asset.ip_address}</p>
                </div>
                {asset.active_alerts > 0 && (
                  <span className="w-4 h-4 bg-red-600 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0">
                    {asset.active_alerts}
                  </span>
                )}
                <span className={`text-xs font-bold ${scoreColor(asset.risk_score)}`}>{asset.risk_score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Firewall */}
        <div className="flex items-center gap-3 my-2 px-4">
          <div className="flex-1 h-px bg-slate-700" />
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-600 px-3 py-1.5 rounded-full">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-xs text-blue-300 font-medium">Firewall / Perimeter</span>
          </div>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        {/* Internal Zone */}
        <div className="border-2 border-dashed border-blue-800/60 rounded-xl p-4 bg-blue-950/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
              Internal Zone — PROTECTED
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {internal.map(asset => (
              <div key={asset.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-900 cursor-pointer hover:border-slate-500 transition-all ${
                  asset.severity === "critical" ? "border-red-700/60" : "border-slate-700"
                }`}>
                <svg className={`w-4 h-4 ${critColor[asset.severity]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeIcon[asset.type]} />
                </svg>
                <div>
                  <p className="text-xs font-medium text-white">{asset.name}</p>
                  <p className="text-xs text-slate-400">{asset.ip_address}</p>
                </div>
                {asset.active_alerts > 0 && (
                  <span className="w-4 h-4 bg-red-600 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0">
                    {asset.active_alerts}
                  </span>
                )}
                <span className={`text-xs font-bold ${scoreColor(asset.risk_score)}`}>{asset.risk_score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Asset Detail Drawer ──────────────────────────────────────────────────────
function AssetDrawer({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const totalVulns = asset.vulnerabilities.critical + asset.vulnerabilities.high +
    asset.vulnerabilities.medium + asset.vulnerabilities.low;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-700 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
              <svg className={`w-5 h-5 ${critColor[asset.severity]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeIcon[asset.type]} />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{asset.name}</h2>
              <p className="text-xs text-slate-400">{asset.hostname}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Risk Score */}
          <div className="flex items-center justify-between bg-slate-800 rounded-xl p-4">
            <div>
              <p className="text-xs text-slate-400">Risk Score</p>
              <p className={`text-4xl font-bold ${scoreColor(asset.risk_score)}`}>{asset.risk_score}</p>
            </div>
            <div className="text-right space-y-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${sevColor[asset.severity]}`}>{asset.severity}</span>
              <br />
              <span className={`text-xs px-2 py-0.5 rounded-full ${asset.internet_facing ? "bg-red-900/40 text-red-400" : "bg-blue-900/40 text-blue-400"}`}>
                {asset.internet_facing ? "🌐 Internet-facing" : "🔒 Internal"}
              </span>
            </div>
          </div>

          {/* Asset Info */}
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-semibold text-white mb-3">Asset Details</h3>
            {[
              ["IP Address", asset.ip_address],
              ["Type", asset.type.toUpperCase()],
              ["OS / Platform", asset.os ?? "Unknown"],
              ["Owner", asset.owner ?? "Unassigned"],
              ["Department", asset.department ?? "Unknown"],
              ["Criticality", asset.criticality.toUpperCase()],
              ["Last Seen", new Date(asset.last_seen).toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-200 font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Vulnerabilities */}
          <div className="bg-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-white mb-3">Vulnerabilities ({totalVulns} total)</h3>
            <div className="grid grid-cols-4 gap-2">
              {[
                ["Critical", asset.vulnerabilities.critical, "text-red-400 bg-red-900/40"],
                ["High", asset.vulnerabilities.high, "text-orange-400 bg-orange-900/40"],
                ["Medium", asset.vulnerabilities.medium, "text-yellow-400 bg-yellow-900/40"],
                ["Low", asset.vulnerabilities.low, "text-green-400 bg-green-900/40"],
              ].map(([label, count, color]: any) => (
                <div key={label} className={`rounded-lg p-2 text-center ${color}`}>
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-xs opacity-80">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Active Alerts */}
          <div className="bg-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-white mb-2">Active Alerts</h3>
            {asset.active_alerts === 0 ? (
              <p className="text-xs text-green-400">✓ No active alerts</p>
            ) : (
              <p className="text-sm text-red-400 font-medium">{asset.active_alerts} active alert{asset.active_alerts > 1 ? "s" : ""} — investigation required</p>
            )}
          </div>

          {/* Data Sources */}
          <div className="bg-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-white mb-2">Monitored via</h3>
            <div className="flex flex-wrap gap-2">
              {asset.connectors.map(c => (
                <span key={c} className="text-xs bg-teal-900/40 text-teal-300 border border-teal-800/50 px-2 py-0.5 rounded-full">{c}</span>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {asset.tags.map(tag => (
              <span key={tag} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">#{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssetInventory() {
  const navigate = useNavigate();
  const [view, setView] = useState<"list" | "map">("list");
  const [typeFilter, setTypeFilter] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [exposureFilter, setExposureFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [sortBy, setSortBy] = useState<"risk_score" | "name" | "criticality">("risk_score");

  const { data: assets = mockAssets, isLoading } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: async () => {
      const res = await apiClient.get("/risk/assets");
      return res.data.data;
    },
  });

  const filtered = [...assets]
    .filter(a => !typeFilter || a.type === typeFilter)
    .filter(a => !sevFilter || a.severity === sevFilter)
    .filter(a => exposureFilter === "" ? true : exposureFilter === "internet" ? a.internet_facing : !a.internet_facing)
    .filter(a =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.ip_address.includes(search) ||
      a.hostname.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "risk_score") return b.risk_score - a.risk_score;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.criticality] - order[b.criticality];
    });

  const stats = {
    total: assets.length,
    critical: assets.filter(a => a.severity === "critical").length,
    internet_facing: assets.filter(a => a.internet_facing).length,
    with_alerts: assets.filter(a => a.active_alerts > 0).length,
    total_vulns: assets.reduce((sum, a) => sum + a.vulnerabilities.critical + a.vulnerabilities.high, 0),
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Asset Inventory</h1>
          <p className="text-slate-400 text-sm mt-1">{stats.total} monitored assets · {stats.internet_facing} internet-facing</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView("list")}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${view === "list" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
            📋 List
          </button>
          <button onClick={() => setView("map")}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${view === "map" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
            🗺 Exposure Map
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Assets", value: stats.total, color: "text-white", bg: "border-slate-800" },
          { label: "Critical Risk", value: stats.critical, color: "text-red-400", bg: "border-red-900/40" },
          { label: "Internet-Facing", value: stats.internet_facing, color: "text-orange-400", bg: "border-orange-900/40" },
          { label: "With Active Alerts", value: stats.with_alerts, color: "text-yellow-400", bg: "border-yellow-900/40" },
          { label: "Critical/High CVEs", value: stats.total_vulns, color: "text-purple-400", bg: "border-purple-900/40" },
        ].map((card, i) => (
          <div key={i} className={`bg-slate-900 rounded-xl p-4 border ${card.bg}`}>
            <p className="text-xs text-slate-400 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, IP, hostname..."
          className="flex-1 min-w-[200px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Types</option>
          {["server", "workstation", "database", "api", "cloud", "network"].map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Severity</option>
          {["critical", "high", "medium", "low"].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select value={exposureFilter} onChange={e => setExposureFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Exposure</option>
          <option value="internet">Internet-Facing</option>
          <option value="internal">Internal Only</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="risk_score">Sort: Risk Score</option>
          <option value="criticality">Sort: Criticality</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Exposure Map View */}
      {view === "map" && <ExposureMap assets={filtered} />}

      {/* List View */}
      {view === "list" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p>No assets found matching your filters</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Asset", "Type", "IP Address", "Risk", "Exposure", "Alerts", "CVEs", "Last Seen"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map(asset => (
                  <tr key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className={`w-4 h-4 ${critColor[asset.severity]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeIcon[asset.type]} />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{asset.name}</p>
                          <p className="text-xs text-slate-400 truncate max-w-[160px]">{asset.hostname}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded capitalize">{asset.type}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-300">{asset.ip_address}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${scoreColor(asset.risk_score)}`}>{asset.risk_score}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${sevColor[asset.severity]}`}>{asset.severity}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${asset.internet_facing ? "bg-red-900/40 text-red-400" : "bg-blue-900/40 text-blue-400"}`}>
                        {asset.internet_facing ? "🌐 Public" : "🔒 Internal"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {asset.active_alerts > 0 ? (
                        <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full font-medium">
                          {asset.active_alerts} alert{asset.active_alerts > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-green-400">✓ Clean</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {asset.vulnerabilities.critical > 0 && (
                          <span className="text-xs font-bold text-red-400">{asset.vulnerabilities.critical}C</span>
                        )}
                        {asset.vulnerabilities.high > 0 && (
                          <span className="text-xs font-bold text-orange-400">{asset.vulnerabilities.high}H</span>
                        )}
                        {asset.vulnerabilities.critical === 0 && asset.vulnerabilities.high === 0 && (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {(() => {
                        const m = Math.floor((Date.now() - new Date(asset.last_seen).getTime()) / 60000);
                        return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Asset Detail Drawer */}
      {selectedAsset && (
        <AssetDrawer asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}
    </div>
  );
}
