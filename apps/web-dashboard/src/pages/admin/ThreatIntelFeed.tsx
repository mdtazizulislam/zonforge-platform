import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type IOCType = "ip" | "domain" | "url" | "hash_md5" | "hash_sha256" | "email";
type FeedStatus = "active" | "processing" | "error" | "paused";

interface ThreatFeed {
  id: string;
  name: string;
  description: string;
  source_type: "upload" | "url" | "stix";
  status: FeedStatus;
  ioc_count: number;
  ioc_types: IOCType[];
  last_updated: string;
  last_sync?: string;
  sync_url?: string;
  sync_interval_hours?: number;
  match_count_30d: number;
  confidence: number;
  tags: string[];
  created_by: string;
  created_at: string;
}

interface IOCEntry {
  id: string;
  type: IOCType;
  value: string;
  confidence: number;
  severity: "critical" | "high" | "medium" | "low";
  description?: string;
  tags: string[];
  added_at: string;
  expires_at?: string;
  match_count: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockFeeds: ThreatFeed[] = [
  {
    id: "f1", name: "Known Tor Exit Nodes", description: "Public list of known Tor exit node IP addresses",
    source_type: "url", status: "active",
    ioc_count: 1247, ioc_types: ["ip"],
    last_updated: new Date(Date.now() - 86400000).toISOString(),
    last_sync: new Date(Date.now() - 3600000).toISOString(),
    sync_url: "https://check.torproject.org/torbulkexitlist",
    sync_interval_hours: 24,
    match_count_30d: 89, confidence: 95,
    tags: ["tor", "anonymization", "network"],
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: "f2", name: "Custom Competitor Domains", description: "Internal blocklist of suspicious domains related to phishing campaigns targeting our sector",
    source_type: "upload", status: "active",
    ioc_count: 47, ioc_types: ["domain", "url"],
    last_updated: new Date(Date.now() - 3 * 86400000).toISOString(),
    match_count_30d: 12, confidence: 85,
    tags: ["phishing", "custom", "sector-specific"],
    created_by: "analyst@acme.com",
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: "f3", name: "Ransomware C2 Infrastructure", description: "Command and control IPs and domains associated with active ransomware campaigns",
    source_type: "upload", status: "active",
    ioc_count: 312, ioc_types: ["ip", "domain", "hash_sha256"],
    last_updated: new Date(Date.now() - 86400000 * 2).toISOString(),
    match_count_30d: 3, confidence: 98,
    tags: ["ransomware", "c2", "malware"],
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: "f4", name: "STIX Feed — ISAC",
    description: "Information Sharing and Analysis Center threat intelligence in STIX 2.1 format",
    source_type: "stix", status: "processing",
    ioc_count: 0, ioc_types: [],
    last_updated: new Date(Date.now() - 600000).toISOString(),
    match_count_30d: 0, confidence: 90,
    tags: ["stix", "isac", "community"],
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 600000).toISOString(),
  },
];

const mockIOCs: IOCEntry[] = [
  { id: "i1", type: "ip", value: "185.220.101.42", confidence: 95, severity: "critical", description: "Tor exit node — used in brute-force campaign", tags: ["tor"], added_at: new Date(Date.now() - 86400000).toISOString(), match_count: 23 },
  { id: "i2", type: "domain", value: "acme-secure-login.phish.net", confidence: 90, severity: "high", description: "Phishing domain impersonating Acme Corp", tags: ["phishing"], added_at: new Date(Date.now() - 3 * 86400000).toISOString(), match_count: 5 },
  { id: "i3", type: "hash_sha256", value: "d41d8cd98f00b204e9800998ecf8427e", confidence: 98, severity: "critical", description: "Known ransomware binary hash — LockBit 3.0", tags: ["ransomware","lockbit"], added_at: new Date(Date.now() - 2 * 86400000).toISOString(), match_count: 1 },
  { id: "i4", type: "ip", value: "192.42.116.16", confidence: 85, severity: "high", description: "Known C2 server for Cobalt Strike beacon", tags: ["c2","cobaltstrike"], added_at: new Date(Date.now() - 86400000).toISOString(), match_count: 2 },
  { id: "i5", type: "url", value: "https://malicious-cdn.xyz/payload.exe", confidence: 99, severity: "critical", description: "Active malware distribution URL", tags: ["malware","dropper"], added_at: new Date(Date.now() - 86400000 * 5).toISOString(), expires_at: new Date(Date.now() + 25 * 86400000).toISOString(), match_count: 0 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const iocTypeColor: Record<IOCType, string> = {
  ip: "bg-blue-900/40 text-blue-300 border-blue-800/40",
  domain: "bg-purple-900/40 text-purple-300 border-purple-800/40",
  url: "bg-orange-900/40 text-orange-300 border-orange-800/40",
  hash_md5: "bg-green-900/40 text-green-300 border-green-800/40",
  hash_sha256: "bg-teal-900/40 text-teal-300 border-teal-800/40",
  email: "bg-pink-900/40 text-pink-300 border-pink-800/40",
};

const sevColor: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-green-400 bg-green-500/10 border-green-500/30",
};

const statusColor: Record<FeedStatus, string> = {
  active: "text-green-400 bg-green-500/10 border-green-500/30",
  processing: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  error: "text-red-400 bg-red-500/10 border-red-500/30",
  paused: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

const statusDot: Record<FeedStatus, string> = {
  active: "bg-green-500",
  processing: "bg-yellow-500 animate-pulse",
  error: "bg-red-500 animate-pulse",
  paused: "bg-slate-500",
};

const sourceIcon: Record<string, string> = {
  upload: "📁", url: "🔗", stix: "🛡️",
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Upload / Add Feed Form ───────────────────────────────────────────────────
function AddFeedForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceType, setSourceType] = useState<"upload" | "url" | "stix">("upload");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [syncUrl, setSyncUrl] = useState("");
  const [syncInterval, setSyncInterval] = useState("24");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confidence, setConfidence] = useState(80);
  const [tags, setTags] = useState("");
  const [iocTypes, setIocTypes] = useState<IOCType[]>(["ip"]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parsePreview, setParsePreview] = useState<string[]>([]);

  const toggleType = (t: IOCType) => setIocTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleFile = (file: File) => {
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = (e.target?.result as string).split("\n").filter(Boolean).slice(0, 5);
      setParsePreview(lines);
    };
    reader.readAsText(file);
  };

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1200));
    qc.invalidateQueries({ queryKey: ["threat-feeds"] });
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 700);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">Add Threat Intel Feed</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Source Type */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Feed Source</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "upload", label: "📁 File Upload", desc: "CSV / TXT / JSON" },
                { id: "url", label: "🔗 URL Feed", desc: "Auto-sync from URL" },
                { id: "stix", label: "🛡️ STIX 2.1", desc: "Structured threat intel" },
              ] as const).map(s => (
                <button key={s.id} onClick={() => setSourceType(s.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${sourceType === s.id ? "bg-blue-900/30 border-blue-600 ring-1 ring-blue-600/30" : "bg-slate-800 border-slate-700 hover:border-slate-600"}`}>
                  <p className="text-xs font-medium text-white">{s.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Feed Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ransomware C2 Blocklist"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="What threat does this feed cover? Where does the data come from?"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
          </div>

          {/* Upload */}
          {sourceType === "upload" && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">IOC File</label>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${dragOver ? "border-blue-500 bg-blue-900/20" : selectedFile ? "border-green-600 bg-green-900/10" : "border-slate-600 hover:border-slate-500"}`}>
                <input ref={fileRef} type="file" accept=".csv,.txt,.json,.stix" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}/>
                {selectedFile ? (
                  <div>
                    <p className="text-sm font-medium text-green-400">✅ {selectedFile.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <svg className="w-8 h-8 text-slate-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                    <p className="text-sm text-slate-400">Drop file here or <span className="text-blue-400">browse</span></p>
                    <p className="text-xs text-slate-500 mt-1">CSV, TXT (one IOC per line), JSON, STIX</p>
                  </div>
                )}
              </div>

              {/* File format guide */}
              <div className="mt-2 p-3 bg-slate-800 rounded-lg text-xs">
                <p className="text-slate-400 font-medium mb-1">Supported formats:</p>
                <div className="space-y-0.5 font-mono text-slate-300">
                  <p># TXT — one IOC per line:</p>
                  <p className="text-green-300">185.220.101.42</p>
                  <p className="text-green-300">malicious.example.com</p>
                  <p className="mt-1 text-slate-400"># CSV — with header:</p>
                  <p className="text-green-300">type,value,severity,description</p>
                  <p className="text-green-300">ip,185.220.101.42,high,Tor exit node</p>
                </div>
              </div>

              {parsePreview.length > 0 && (
                <div className="mt-2 p-3 bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Preview (first 5 lines):</p>
                  {parsePreview.map((line, i) => (
                    <p key={i} className="text-xs font-mono text-green-300">{line}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* URL Feed */}
          {sourceType === "url" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Feed URL *</label>
                <input value={syncUrl} onChange={e => setSyncUrl(e.target.value)}
                  placeholder="https://feeds.threatintel.example.com/blocklist.txt"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Sync Interval</label>
                <select value={syncInterval} onChange={e => setSyncInterval(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
                  {[["1","Every hour"],["6","Every 6 hours"],["12","Every 12 hours"],["24","Daily"],["168","Weekly"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* STIX */}
          {sourceType === "stix" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">STIX 2.1 Bundle URL or File</label>
                <input value={syncUrl} onChange={e => setSyncUrl(e.target.value)}
                  placeholder="https://taxii.example.com/collections/indicators"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg text-xs text-slate-300">
                💡 TAXII 2.1 endpoints are also supported. ZonForge will automatically parse indicators, observables, and threat actor TTPs from the STIX bundle.
              </div>
            </div>
          )}

          {/* IOC Types */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">IOC Types in this feed</label>
            <div className="flex flex-wrap gap-2">
              {(["ip","domain","url","hash_sha256","hash_md5","email"] as IOCType[]).map(t => (
                <button key={t} onClick={() => toggleType(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all ${iocTypes.includes(t) ? iocTypeColor[t] : "bg-slate-800 text-slate-500 border-slate-700"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Confidence + Tags */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Confidence Score: <span className="text-white font-bold">{confidence}%</span></label>
              <input type="range" min={0} max={100} value={confidence} onChange={e => setConfidence(Number(e.target.value))}
                className="w-full accent-blue-500"/>
              <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                <span>Low</span><span>Medium</span><span>High</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tags (comma-separated)</label>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder="ransomware, c2, phishing"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !name || (sourceType === "upload" && !selectedFile) || (sourceType !== "upload" && !syncUrl)}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
            {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Uploading...</> : saved ? "✅ Saved!" : "Add Feed"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ThreatIntelFeed() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"feeds" | "iocs">("feeds");
  const [selectedFeed, setSelectedFeed] = useState<string | null>(null);
  const [iocSearch, setIocSearch] = useState("");
  const [iocTypeFilter, setIocTypeFilter] = useState<IOCType | "">("");
  const [iocSevFilter, setIocSevFilter] = useState("");

  const { data: feeds = mockFeeds } = useQuery<ThreatFeed[]>({
    queryKey: ["threat-feeds"],
    queryFn: async () => { const r = await apiClient.get("/admin/threat-intel/feeds"); return r.data.data; },
  });

  const syncFeed = useMutation({
    mutationFn: async (id: string) => { await apiClient.post(`/admin/threat-intel/feeds/${id}/sync`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["threat-feeds"] }),
  });

  const deleteFeed = useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/admin/threat-intel/feeds/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["threat-feeds"] }),
  });

  const filteredIOCs = mockIOCs
    .filter(i => !iocTypeFilter || i.type === iocTypeFilter)
    .filter(i => !iocSevFilter || i.severity === iocSevFilter)
    .filter(i => i.value.toLowerCase().includes(iocSearch.toLowerCase()) || (i.description ?? "").toLowerCase().includes(iocSearch.toLowerCase()));

  const stats = {
    total_feeds: feeds.length,
    total_iocs: feeds.reduce((s, f) => s + f.ioc_count, 0),
    total_matches: feeds.reduce((s, f) => s + f.match_count_30d, 0),
    active: feeds.filter(f => f.status === "active").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Threat Intel Feeds</h1>
          <p className="text-slate-400 text-sm mt-1">Custom IOC lists and threat intelligence sources</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Add Feed
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Active Feeds", value: stats.active, color: "text-green-400" },
          { label: "Total IOCs", value: stats.total_iocs.toLocaleString(), color: "text-blue-400" },
          { label: "Matches (30d)", value: stats.total_matches, color: stats.total_matches > 0 ? "text-red-400" : "text-green-400" },
          { label: "Feed Sources", value: stats.total_feeds, color: "text-teal-400" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        <button onClick={() => setTab("feeds")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "feeds" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
          📡 Feeds ({feeds.length})
        </button>
        <button onClick={() => setTab("iocs")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "iocs" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
          🎯 IOC Browser ({mockIOCs.length})
        </button>
      </div>

      {/* ── FEEDS TAB ── */}
      {tab === "feeds" && (
        <div className="space-y-3">
          {feeds.map(feed => (
            <div key={feed.id} className="bg-slate-900 rounded-xl border border-slate-800 p-5 hover:border-slate-700 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-2xl flex-shrink-0">{sourceIcon[feed.source_type]}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-bold text-white">{feed.name}</h3>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[feed.status]}`}/>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor[feed.status]}`}>{feed.status}</span>
                      <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{feed.source_type.toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{feed.description}</p>

                    {/* IOC Type badges */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {feed.ioc_types.map(t => (
                        <span key={t} className={`text-xs font-mono px-1.5 py-0.5 rounded border ${iocTypeColor[t]}`}>{t}</span>
                      ))}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1">
                      {feed.tags.map(t => <span key={t} className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">#{t}</span>)}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-start gap-4 flex-shrink-0 ml-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-white">{feed.ioc_count.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">IOCs</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${feed.match_count_30d > 0 ? "text-red-400" : "text-green-400"}`}>{feed.match_count_30d}</p>
                    <p className="text-xs text-slate-400">Matches</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-400">{feed.confidence}%</p>
                    <p className="text-xs text-slate-400">Confidence</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-slate-500">Updated {timeAgo(feed.last_updated)}</span>
                {feed.last_sync && <span className="text-xs text-slate-500">· Synced {timeAgo(feed.last_sync)}</span>}
                {feed.sync_interval_hours && <span className="text-xs text-slate-500">· Every {feed.sync_interval_hours}h</span>}

                <div className="flex gap-2 ml-auto">
                  {feed.source_type !== "upload" && (
                    <button onClick={() => syncFeed.mutate(feed.id)} disabled={syncFeed.isPending || feed.status === "processing"}
                      className="px-3 py-1.5 text-xs bg-teal-900/30 hover:bg-teal-900/50 text-teal-300 border border-teal-800/40 rounded-lg transition-colors disabled:opacity-50">
                      ↺ Sync Now
                    </button>
                  )}
                  <button onClick={() => { setSelectedFeed(feed.id); setTab("iocs"); }}
                    className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                    Browse IOCs
                  </button>
                  <button onClick={() => deleteFeed.mutate(feed.id)}
                    className="px-3 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800/30 rounded-lg transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── IOC BROWSER TAB ── */}
      {tab === "iocs" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 bg-slate-900 p-4 rounded-xl border border-slate-800">
            <input value={iocSearch} onChange={e => setIocSearch(e.target.value)}
              placeholder="Search IOCs..."
              className="flex-1 min-w-[200px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            <select value={iocTypeFilter} onChange={e => setIocTypeFilter(e.target.value as IOCType | "")}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
              <option value="">All Types</option>
              {["ip","domain","url","hash_sha256","hash_md5","email"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={iocSevFilter} onChange={e => setIocSevFilter(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
              <option value="">All Severity</option>
              {["critical","high","medium","low"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* IOC Table */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Type","IOC Value","Severity","Confidence","Matches","Description","Added"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredIOCs.map(ioc => (
                  <tr key={ioc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${iocTypeColor[ioc.type]}`}>{ioc.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono text-slate-200 break-all max-w-[200px] block">{ioc.value}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${sevColor[ioc.severity]}`}>{ioc.severity}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 bg-slate-700 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${ioc.confidence}%` }}/>
                        </div>
                        <span className="text-xs text-slate-400">{ioc.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold ${ioc.match_count > 0 ? "text-red-400" : "text-slate-500"}`}>{ioc.match_count}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate">{ioc.description ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{timeAgo(ioc.added_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && <AddFeedForm onClose={() => setShowForm(false)}/>}
    </div>
  );
}
