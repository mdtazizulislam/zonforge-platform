import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type FeedTier = "platform" | "premium" | "community";
type FeedStatus = "active" | "degraded" | "error" | "disabled";
type IOCType = "ip" | "domain" | "url" | "hash_sha256" | "hash_md5" | "email" | "cve";

interface PlatformFeed {
  id: string;
  name: string;
  provider: string;
  tier: FeedTier;
  status: FeedStatus;
  description: string;
  ioc_types: IOCType[];
  ioc_count: number;
  ioc_count_delta_7d: number;
  match_count_30d: number;
  quality_score: number;
  last_sync: string;
  sync_interval_hours: number;
  tenant_coverage: number;
  total_tenants: number;
  cost_per_month?: number;
  license_expiry?: string;
  tags: string[];
  top_matching_tenants: string[];
}

interface IOCQualityStats {
  total_iocs: number;
  active_iocs: number;
  expired_iocs: number;
  avg_confidence: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  false_positive_rate: number;
  match_rate_30d: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockFeeds: PlatformFeed[] = [
  {
    id: "pf1", name: "AlienVault OTX", provider: "AlienVault", tier: "platform",
    status: "active", description: "Open Threat Exchange — community-driven threat intelligence with millions of IOCs across IPs, domains, URLs and file hashes.",
    ioc_types: ["ip", "domain", "url", "hash_sha256"],
    ioc_count: 2847293, ioc_count_delta_7d: 84729,
    match_count_30d: 1847, quality_score: 78,
    last_sync: new Date(Date.now() - 1800000).toISOString(),
    sync_interval_hours: 6, tenant_coverage: 47, total_tenants: 47,
    tags: ["community", "open-source", "high-volume"],
    top_matching_tenants: ["CloudSoft", "Acme Corp", "SecureBank"],
  },
  {
    id: "pf2", name: "Recorded Future — IP Intel", provider: "Recorded Future", tier: "premium",
    status: "active", description: "Premium real-time threat intelligence on malicious IPs with risk scoring, geolocation, and actor attribution.",
    ioc_types: ["ip"],
    ioc_count: 487293, ioc_count_delta_7d: 12847,
    match_count_30d: 423, quality_score: 94,
    last_sync: new Date(Date.now() - 3600000).toISOString(),
    sync_interval_hours: 1, tenant_coverage: 47, total_tenants: 47,
    cost_per_month: 4200, license_expiry: new Date(Date.now() + 180 * 86400000).toISOString(),
    tags: ["premium", "real-time", "ip-intel", "actor-attribution"],
    top_matching_tenants: ["SecureBank", "FinTech Labs", "CloudSoft"],
  },
  {
    id: "pf3", name: "CISA KEV", provider: "CISA", tier: "platform",
    status: "active", description: "CISA Known Exploited Vulnerabilities catalog — CVEs with confirmed exploitation in the wild. Critical for vulnerability prioritization.",
    ioc_types: ["cve"],
    ioc_count: 1287, ioc_count_delta_7d: 14,
    match_count_30d: 2847, quality_score: 99,
    last_sync: new Date(Date.now() - 7200000).toISOString(),
    sync_interval_hours: 24, tenant_coverage: 47, total_tenants: 47,
    tags: ["government", "cve", "vulnerability", "critical"],
    top_matching_tenants: ["All tenants"],
  },
  {
    id: "pf4", name: "Tor Exit Nodes", provider: "Tor Project", tier: "platform",
    status: "active", description: "Real-time list of all active Tor exit node IP addresses — essential for detecting anonymous logins and proxy usage.",
    ioc_types: ["ip"],
    ioc_count: 1247, ioc_count_delta_7d: -23,
    match_count_30d: 384, quality_score: 97,
    last_sync: new Date(Date.now() - 3600000).toISOString(),
    sync_interval_hours: 6, tenant_coverage: 47, total_tenants: 47,
    tags: ["tor", "anonymization", "network"],
    top_matching_tenants: ["Acme Corp", "CloudSoft"],
  },
  {
    id: "pf5", name: "Mandiant Advantage — APT Intel", provider: "Mandiant / Google", tier: "premium",
    status: "degraded", description: "Nation-state and APT threat actor intelligence including TTPs, infrastructure, and campaign tracking.",
    ioc_types: ["ip", "domain", "hash_sha256", "email"],
    ioc_count: 128472, ioc_count_delta_7d: 3847,
    match_count_30d: 28, quality_score: 97,
    last_sync: new Date(Date.now() - 14400000).toISOString(),
    sync_interval_hours: 4, tenant_coverage: 12, total_tenants: 47,
    cost_per_month: 8900, license_expiry: new Date(Date.now() + 45 * 86400000).toISOString(),
    tags: ["premium", "apt", "nation-state", "enterprise-only"],
    top_matching_tenants: ["SecureBank", "CloudSoft"],
  },
  {
    id: "pf6", name: "Phishing Database", provider: "PhishTank / OpenPhish", tier: "platform",
    status: "active", description: "Aggregated phishing URLs and domains from multiple community sources — updated hourly.",
    ioc_types: ["url", "domain"],
    ioc_count: 647829, ioc_count_delta_7d: 28472,
    match_count_30d: 847, quality_score: 82,
    last_sync: new Date(Date.now() - 1800000).toISOString(),
    sync_interval_hours: 1, tenant_coverage: 47, total_tenants: 47,
    tags: ["phishing", "community", "url-intel"],
    top_matching_tenants: ["Acme Corp", "FinTech Labs", "DataDriven Co"],
  },
];

const mockQuality: IOCQualityStats = {
  total_iocs: 4112421,
  active_iocs: 3847293,
  expired_iocs: 265128,
  avg_confidence: 84,
  by_type: { ip: 1847293, domain: 847293, url: 647829, hash_sha256: 487293, cve: 1287, email: 38472, hash_md5: 242954 },
  by_severity: { critical: 284729, high: 847293, medium: 1284729, low: 1695670 },
  false_positive_rate: 3.2,
  match_rate_30d: 6384,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const tierBadge: Record<FeedTier, string> = {
  platform: "bg-blue-900/40 text-blue-300 border-blue-800/40",
  premium: "bg-purple-900/40 text-purple-300 border-purple-800/40",
  community: "bg-teal-900/40 text-teal-300 border-teal-800/40",
};
const tierIcon: Record<FeedTier, string> = {
  platform: "🌐", premium: "⭐", community: "👥",
};
const statusDot: Record<FeedStatus, string> = {
  active: "bg-green-500", degraded: "bg-yellow-500 animate-pulse",
  error: "bg-red-500 animate-pulse", disabled: "bg-slate-500",
};
const statusStyle: Record<FeedStatus, string> = {
  active: "text-green-400 bg-green-500/10 border-green-500/30",
  degraded: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  error: "text-red-400 bg-red-500/10 border-red-500/30",
  disabled: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};
const iocTypeColor: Record<string, string> = {
  ip: "bg-blue-900/40 text-blue-300 border-blue-800/40",
  domain: "bg-purple-900/40 text-purple-300 border-purple-800/40",
  url: "bg-orange-900/40 text-orange-300 border-orange-800/40",
  hash_sha256: "bg-teal-900/40 text-teal-300 border-teal-800/40",
  hash_md5: "bg-green-900/40 text-green-300 border-green-800/40",
  email: "bg-pink-900/40 text-pink-300 border-pink-800/40",
  cve: "bg-red-900/40 text-red-300 border-red-800/40",
};

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function daysUntil(iso: string) {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
}

// ─── Quality Overview ─────────────────────────────────────────────────────────
function QualityPanel({ stats }: { stats: IOCQualityStats }) {
  const typeEntries = Object.entries(stats.by_type).sort((a, b) => b[1] - a[1]);
  const maxType = Math.max(...typeEntries.map(([, v]) => v));

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-white">Platform IOC Quality Overview</h2>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total IOCs", value: formatNum(stats.total_iocs), color: "text-white" },
          { label: "Active", value: formatNum(stats.active_iocs), color: "text-green-400" },
          { label: "Avg Confidence", value: `${stats.avg_confidence}%`, color: "text-blue-400" },
          { label: "FP Rate", value: `${stats.false_positive_rate}%`, color: "text-green-400" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800 rounded-lg p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* IOC by type */}
      <div>
        <p className="text-xs font-semibold text-slate-300 mb-3">IOCs by Type</p>
        <div className="space-y-2">
          {typeEntries.map(([type, count]) => (
            <div key={type}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className={`font-mono px-1.5 py-0.5 rounded border ${iocTypeColor[type] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>{type}</span>
                <span className="text-slate-400">{formatNum(count)}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${(count / maxType) * 100}%` }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly matches */}
      <div className="bg-slate-800 rounded-lg p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">Matches triggered (30d)</p>
          <p className="text-xl font-bold text-red-400">{stats.match_rate_30d.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Expired IOCs</p>
          <p className="text-xl font-bold text-slate-400">{formatNum(stats.expired_iocs)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Feed Detail Panel ────────────────────────────────────────────────────────
function FeedDetailPanel({ feed, onClose }: { feed: PlatformFeed; onClose: () => void }) {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  const syncFeed = async () => {
    setSyncing(true);
    await new Promise(r => setTimeout(r, 1500));
    setSyncing(false); setSynced(true);
    setTimeout(() => setSynced(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40" onClick={onClose}/>
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-700 overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">{feed.name}</h2>
            <p className="text-xs text-slate-400">{feed.provider} · {feed.tier}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Status + badges */}
          <div className="flex flex-wrap gap-2">
            <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${statusDot[feed.status]}`}/>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyle[feed.status]}`}>{feed.status}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${tierBadge[feed.tier]}`}>{tierIcon[feed.tier]} {feed.tier}</span>
            {feed.ioc_types.map(t => (
              <span key={t} className={`text-xs font-mono px-1.5 py-0.5 rounded border ${iocTypeColor[t]}`}>{t}</span>
            ))}
          </div>

          <p className="text-sm text-slate-300">{feed.description}</p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "IOC Count", value: formatNum(feed.ioc_count), sub: `+${formatNum(feed.ioc_count_delta_7d)} this week`, color: "text-white" },
              { label: "Matches (30d)", value: feed.match_count_30d.toLocaleString(), sub: "cross-tenant", color: feed.match_count_30d > 0 ? "text-red-400" : "text-slate-400" },
              { label: "Quality Score", value: `${feed.quality_score}%`, sub: "precision", color: feed.quality_score >= 90 ? "text-green-400" : "text-yellow-400" },
            ].map((s, i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-xs text-slate-500">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Sync info */}
          <div className="bg-slate-800 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-white">Sync Configuration</p>
            {[
              { label: "Last Sync", value: timeAgo(feed.last_sync) },
              { label: "Interval", value: `Every ${feed.sync_interval_hours}h` },
              { label: "Coverage", value: `${feed.tenant_coverage}/${feed.total_tenants} tenants` },
            ].map((r, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-slate-400">{r.label}</span>
                <span className="text-slate-200 font-medium">{r.value}</span>
              </div>
            ))}
          </div>

          {/* Premium info */}
          {feed.tier === "premium" && feed.cost_per_month && (
            <div className="bg-purple-900/20 border border-purple-800/40 rounded-lg p-4">
              <p className="text-xs font-semibold text-purple-300 mb-2">License Information</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Monthly Cost</span>
                  <span className="text-purple-300 font-bold">${feed.cost_per_month.toLocaleString()}/mo</span>
                </div>
                {feed.license_expiry && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Expires</span>
                    <span className={`font-medium ${daysUntil(feed.license_expiry) <= 60 ? "text-orange-400" : "text-slate-200"}`}>
                      {daysUntil(feed.license_expiry)} days ({new Date(feed.license_expiry).toLocaleDateString()})
                    </span>
                  </div>
                )}
              </div>
              {feed.license_expiry && daysUntil(feed.license_expiry) <= 60 && (
                <div className="mt-2 text-xs text-orange-300">⚠ License expiring soon — initiate renewal</div>
              )}
            </div>
          )}

          {/* Top matching tenants */}
          <div>
            <p className="text-xs font-semibold text-white mb-2">Top Matching Tenants</p>
            <div className="flex flex-wrap gap-2">
              {feed.top_matching_tenants.map(t => (
                <span key={t} className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {feed.tags.map(t => <span key={t} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">#{t}</span>)}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={syncFeed} disabled={syncing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {syncing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Syncing...</> : synced ? "✅ Synced!" : "↺ Force Sync"}
            </button>
            <button className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-700 transition-colors">
              {feed.status === "active" ? "Disable" : "Enable"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ThreatIntelManagement() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"feeds" | "quality">("feeds");
  const [tierFilter, setTierFilter] = useState<FeedTier | "">("");
  const [statusFilter, setStatusFilter] = useState<FeedStatus | "">("");
  const [selectedFeed, setSelectedFeed] = useState<PlatformFeed | null>(null);

  const { data: feeds = mockFeeds } = useQuery<PlatformFeed[]>({
    queryKey: ["platform-feeds"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/threat-intel/feeds"); return r.data.data; },
  });

  const syncAll = useMutation({
    mutationFn: async () => { await apiClient.post("/superadmin/threat-intel/feeds/sync-all"); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-feeds"] }),
  });

  const filtered = feeds
    .filter(f => !tierFilter || f.tier === tierFilter)
    .filter(f => !statusFilter || f.status === statusFilter);

  const stats = {
    total_feeds: feeds.length,
    active: feeds.filter(f => f.status === "active").length,
    issues: feeds.filter(f => f.status === "degraded" || f.status === "error").length,
    total_iocs: feeds.reduce((s, f) => s + f.ioc_count, 0),
    total_matches: feeds.reduce((s, f) => s + f.match_count_30d, 0),
    premium_cost: feeds.filter(f => f.cost_per_month).reduce((s, f) => s + (f.cost_per_month ?? 0), 0),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Threat Intel Feed Management</h1>
          <p className="text-slate-400 text-sm mt-1">Platform-wide threat intelligence sources deployed to all tenants</p>
        </div>
        <button onClick={() => syncAll.mutate()} disabled={syncAll.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
          {syncAll.isPending ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Syncing all...</> : "↺ Sync All Feeds"}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Feeds", value: stats.total_feeds, color: "text-white" },
          { label: "Active", value: stats.active, color: "text-green-400" },
          { label: "Issues", value: stats.issues, color: stats.issues > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Total IOCs", value: formatNum(stats.total_iocs), color: "text-blue-400" },
          { label: "Matches (30d)", value: stats.total_matches.toLocaleString(), color: "text-red-400" },
          { label: "Premium Cost", value: `$${(stats.premium_cost / 1000).toFixed(1)}K/mo`, color: "text-purple-400" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        <button onClick={() => setTab("feeds")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "feeds" ? "bg-red-700 text-white" : "text-slate-400 hover:text-white"}`}>
          📡 Feeds ({feeds.length})
        </button>
        <button onClick={() => setTab("quality")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "quality" ? "bg-red-700 text-white" : "text-slate-400 hover:text-white"}`}>
          📊 Quality Dashboard
        </button>
      </div>

      {/* Feeds Tab */}
      {tab === "feeds" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800">
            <select value={tierFilter} onChange={e => setTierFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
              <option value="">All Tiers</option>
              <option value="platform">🌐 Platform</option>
              <option value="premium">⭐ Premium</option>
              <option value="community">👥 Community</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
              <option value="">All Status</option>
              {["active","degraded","error","disabled"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Feed Cards */}
          <div className="space-y-3">
            {filtered.map(feed => (
              <div key={feed.id}
                onClick={() => setSelectedFeed(feed)}
                className={`bg-slate-900 rounded-xl border p-5 cursor-pointer hover:border-slate-600 transition-all ${
                  feed.status === "error" ? "border-red-800/50" :
                  feed.status === "degraded" ? "border-yellow-800/40" : "border-slate-800"
                }`}>
                <div className="flex items-start gap-4">
                  {/* Icon + status */}
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-xl">
                      {tierIcon[feed.tier]}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-bold text-white">{feed.name}</p>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[feed.status]}`}/>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${statusStyle[feed.status]}`}>{feed.status}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${tierBadge[feed.tier]}`}>{feed.tier}</span>
                      {feed.tier === "premium" && feed.license_expiry && daysUntil(feed.license_expiry) <= 60 && (
                        <span className="text-xs bg-orange-900/40 text-orange-300 border border-orange-800/40 px-1.5 py-0.5 rounded-full">
                          ⚠ License: {daysUntil(feed.license_expiry)}d
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mb-2 truncate">{feed.description}</p>

                    {/* IOC types */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {feed.ioc_types.map(t => (
                        <span key={t} className={`text-xs font-mono px-1.5 py-0.5 rounded border ${iocTypeColor[t]}`}>{t}</span>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {feed.tags.slice(0, 3).map(t => <span key={t} className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">#{t}</span>)}
                    </div>
                  </div>

                  {/* Right stats */}
                  <div className="flex gap-4 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{formatNum(feed.ioc_count)}</p>
                      <p className="text-xs text-slate-400">IOCs</p>
                      <p className={`text-xs ${feed.ioc_count_delta_7d >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {feed.ioc_count_delta_7d >= 0 ? "+" : ""}{formatNum(feed.ioc_count_delta_7d)} /wk
                      </p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${feed.match_count_30d > 0 ? "text-red-400" : "text-slate-400"}`}>{feed.match_count_30d.toLocaleString()}</p>
                      <p className="text-xs text-slate-400">Matches</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${feed.quality_score >= 90 ? "text-green-400" : "text-yellow-400"}`}>{feed.quality_score}%</p>
                      <p className="text-xs text-slate-400">Quality</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Synced</p>
                      <p className="text-sm text-slate-300">{timeAgo(feed.last_sync)}</p>
                      <p className="text-xs text-slate-500">/{feed.sync_interval_hours}h</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quality Tab */}
      {tab === "quality" && <QualityPanel stats={mockQuality}/>}

      {selectedFeed && <FeedDetailPanel feed={selectedFeed} onClose={() => setSelectedFeed(null)}/>}
    </div>
  );
}
