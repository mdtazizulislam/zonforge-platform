import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface WhiteLabelConfig {
  id: string;
  tenant_id: string;
  tenant_name: string;
  enabled: boolean;
  branding: {
    product_name: string;
    company_name: string;
    logo_url?: string;
    favicon_url?: string;
    primary_color: string;
    secondary_color: string;
    sidebar_style: "dark" | "light" | "colored";
  };
  domain: {
    custom_domain?: string;
    domain_verified: boolean;
    ssl_status: "active" | "pending" | "error" | "none";
    cname_target: string;
  };
  email: {
    from_name: string;
    from_address?: string;
    reply_to?: string;
    custom_smtp: boolean;
    smtp_host?: string;
    smtp_port?: number;
  };
  features: {
    hide_zonforge_branding: boolean;
    hide_powered_by: boolean;
    custom_support_url?: string;
    custom_docs_url?: string;
    custom_login_message?: string;
  };
  updated_at: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockConfigs: WhiteLabelConfig[] = [
  {
    id: "wl1", tenant_id: "t3", tenant_name: "CloudSoft", enabled: true,
    branding: { product_name: "CloudSoft Security", company_name: "CloudSoft Inc.", primary_color: "#0ea5e9", secondary_color: "#0284c7", sidebar_style: "dark" },
    domain: { custom_domain: "security.cloudsoft.com", domain_verified: true, ssl_status: "active", cname_target: "app.zonforge.io" },
    email: { from_name: "CloudSoft Security", from_address: "security@cloudsoft.com", reply_to: "support@cloudsoft.com", custom_smtp: false },
    features: { hide_zonforge_branding: true, hide_powered_by: true, custom_support_url: "https://support.cloudsoft.com", custom_docs_url: "https://docs.cloudsoft.com" },
    updated_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: "wl2", tenant_id: "t5", tenant_name: "SecureBank", enabled: true,
    branding: { product_name: "SecureBank Sentinel", company_name: "SecureBank", primary_color: "#1d4ed8", secondary_color: "#1e40af", sidebar_style: "dark" },
    domain: { custom_domain: "sentinel.securebank.com", domain_verified: true, ssl_status: "active", cname_target: "app.zonforge.io" },
    email: { from_name: "SecureBank Security", from_address: "sentinel@securebank.com", custom_smtp: true, smtp_host: "smtp.securebank.com", smtp_port: 587 },
    features: { hide_zonforge_branding: true, hide_powered_by: true, custom_login_message: "SecureBank employees only. Unauthorized access is prohibited." },
    updated_at: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: "wl3", tenant_id: "t1", tenant_name: "Acme Corporation", enabled: false,
    branding: { product_name: "Acme Security Platform", company_name: "Acme Corp", primary_color: "#7c3aed", secondary_color: "#6d28d9", sidebar_style: "dark" },
    domain: { custom_domain: "security.acme.com", domain_verified: false, ssl_status: "pending", cname_target: "app.zonforge.io" },
    email: { from_name: "Acme Security", custom_smtp: false },
    features: { hide_zonforge_branding: false, hide_powered_by: false },
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

const ALL_TENANTS = [
  { id: "t1", name: "Acme Corporation", plan: "Business" },
  { id: "t2", name: "FinTech Labs", plan: "Growth" },
  { id: "t3", name: "CloudSoft", plan: "Enterprise" },
  { id: "t4", name: "DataDriven Co", plan: "Growth" },
  { id: "t5", name: "SecureBank", plan: "Enterprise" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sslStyle: Record<string, string> = {
  active: "text-green-400 bg-green-500/10 border-green-500/30",
  pending: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  error: "text-red-400 bg-red-500/10 border-red-500/30",
  none: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};
const sslIcon: Record<string, string> = {
  active: "🔒", pending: "⏳", error: "⚠️", none: "🔓",
};

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
}

// ─── Live Preview Component ───────────────────────────────────────────────────
function LivePreview({ config }: { config: Partial<WhiteLabelConfig> }) {
  const branding = config.branding ?? { product_name: "Your Product", company_name: "Your Company", primary_color: "#3b82f6", secondary_color: "#2563eb", sidebar_style: "dark" as const };
  const features = config.features ?? { hide_zonforge_branding: false, hide_powered_by: false };

  return (
    <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-950" style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Mini sidebar */}
      <div className="flex h-48">
        <div className="w-44 flex flex-col" style={{ backgroundColor: branding.sidebar_style === "colored" ? branding.primary_color : "#0f172a" }}>
          {/* Logo area */}
          <div className="p-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: branding.primary_color }}/>
              <span className="text-xs font-bold text-white truncate">{branding.product_name || "Product"}</span>
            </div>
          </div>
          {/* Nav items */}
          <div className="p-2 space-y-1 flex-1">
            {["Dashboard", "Alerts", "Risk", "Assets"].map((item, i) => (
              <div key={item} className={`px-2 py-1.5 rounded text-xs flex items-center gap-2 ${i === 0 ? "text-white" : "text-white/50"}`}
                style={i === 0 ? { backgroundColor: branding.primary_color } : {}}>
                <div className="w-2.5 h-2.5 rounded-sm bg-current opacity-60"/>
                {item}
              </div>
            ))}
          </div>
          {/* Powered by */}
          {!features.hide_powered_by && (
            <div className="p-2 text-center text-xs text-white/30">Powered by ZonForge</div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 bg-slate-900 p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-white">Security Dashboard</span>
            {!features.hide_zonforge_branding && (
              <span className="text-xs text-slate-500">ZonForge Sentinel</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[["42", "Risk Score"], ["8", "Alerts"], ["100%", "Uptime"]].map(([v, l]) => (
              <div key={l} className="bg-slate-800 rounded p-2 text-center">
                <p className="text-sm font-bold" style={{ color: branding.primary_color }}>{v}</p>
                <p className="text-xs text-slate-400">{l}</p>
              </div>
            ))}
          </div>
          <div className="bg-slate-800 rounded p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: branding.primary_color }}/>
              <span className="text-xs text-slate-300">Latest Alert</span>
            </div>
            <p className="text-xs text-slate-400">Brute-force login detected · 2m ago</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Config Form ─────────────────────────────────────────────────────────
function ConfigForm({ config, onClose }: { config?: WhiteLabelConfig; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"branding" | "domain" | "email" | "features">("branding");
  const [tenantId, setTenantId] = useState(config?.tenant_id ?? "");
  const [productName, setProductName] = useState(config?.branding.product_name ?? "");
  const [companyName, setCompanyName] = useState(config?.branding.company_name ?? "");
  const [primaryColor, setPrimaryColor] = useState(config?.branding.primary_color ?? "#3b82f6");
  const [secondaryColor, setSecondaryColor] = useState(config?.branding.secondary_color ?? "#2563eb");
  const [sidebarStyle, setSidebarStyle] = useState<"dark"|"light"|"colored">(config?.branding.sidebar_style ?? "dark");
  const [customDomain, setCustomDomain] = useState(config?.domain.custom_domain ?? "");
  const [fromName, setFromName] = useState(config?.email.from_name ?? "");
  const [fromAddress, setFromAddress] = useState(config?.email.from_address ?? "");
  const [replyTo, setReplyTo] = useState(config?.email.reply_to ?? "");
  const [customSmtp, setCustomSmtp] = useState(config?.email.custom_smtp ?? false);
  const [smtpHost, setSmtpHost] = useState(config?.email.smtp_host ?? "");
  const [smtpPort, setSmtpPort] = useState(config?.email.smtp_port?.toString() ?? "587");
  const [hideZF, setHideZF] = useState(config?.features.hide_zonforge_branding ?? false);
  const [hidePowered, setHidePowered] = useState(config?.features.hide_powered_by ?? false);
  const [supportUrl, setSupportUrl] = useState(config?.features.custom_support_url ?? "");
  const [docsUrl, setDocsUrl] = useState(config?.features.custom_docs_url ?? "");
  const [loginMsg, setLoginMsg] = useState(config?.features.custom_login_message ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const previewConfig: Partial<WhiteLabelConfig> = {
    branding: { product_name: productName, company_name: companyName, primary_color: primaryColor, secondary_color: secondaryColor, sidebar_style: sidebarStyle },
    features: { hide_zonforge_branding: hideZF, hide_powered_by: hidePowered },
  };

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    qc.invalidateQueries({ queryKey: ["whitelabel-configs"] });
    setSaving(false); setSaved(true);
    setTimeout(onClose, 600);
  };

  const PRESET_COLORS = ["#3b82f6","#0ea5e9","#1d4ed8","#7c3aed","#0d9488","#16a34a","#dc2626","#ea580c","#d97706","#0f172a"];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">{config ? "Edit White-label" : "New White-label Config"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex gap-1 p-3 border-b border-slate-800">
          {([
            { id: "branding", label: "🎨 Branding" },
            { id: "domain", label: "🌐 Domain" },
            { id: "email", label: "📧 Email" },
            { id: "features", label: "⚙️ Features" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.id ? "bg-red-700 text-white" : "text-slate-400 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex gap-0">
            {/* Form */}
            <div className="flex-1 p-5 space-y-4 min-w-0">
              {!config && tab === "branding" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tenant *</label>
                  <select value={tenantId} onChange={e => setTenantId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600">
                    <option value="">Select tenant...</option>
                    {ALL_TENANTS.map(t => <option key={t.id} value={t.id}>{t.name} ({t.plan})</option>)}
                  </select>
                </div>
              )}

              {/* ── BRANDING ── */}
              {tab === "branding" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Product Name</label>
                      <input value={productName} onChange={e => setProductName(e.target.value)}
                        placeholder="Acme Security Platform"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Company Name</label>
                      <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                        placeholder="Acme Corporation"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"/>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Primary Color</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-slate-700 bg-slate-800 cursor-pointer"/>
                      <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none"/>
                      <div className="flex gap-1.5">
                        {PRESET_COLORS.map(c => (
                          <button key={c} onClick={() => setPrimaryColor(c)}
                            className="w-6 h-6 rounded-full border-2 transition-all"
                            style={{ backgroundColor: c, borderColor: primaryColor === c ? "white" : "transparent" }}/>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Sidebar Style</label>
                    <div className="flex gap-2">
                      {(["dark","light","colored"] as const).map(s => (
                        <button key={s} onClick={() => setSidebarStyle(s)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize border transition-colors ${sidebarStyle === s ? "bg-red-700 text-white border-red-700" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"}`}>
                          {s === "dark" ? "🌙 Dark" : s === "light" ? "☀️ Light" : "🎨 Colored"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Logo Upload</label>
                    <div className="border-2 border-dashed border-slate-600 rounded-xl p-4 text-center cursor-pointer hover:border-slate-500 transition-colors">
                      <p className="text-sm text-slate-400">Drop logo here or <span className="text-blue-400">browse</span></p>
                      <p className="text-xs text-slate-500 mt-1">PNG, SVG — recommended 200×40px</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── DOMAIN ── */}
              {tab === "domain" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Custom Domain</label>
                    <input value={customDomain} onChange={e => setCustomDomain(e.target.value)}
                      placeholder="security.yourclient.com"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-red-600"/>
                  </div>

                  {customDomain && (
                    <div className="bg-slate-800 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-white">DNS Setup Instructions</p>
                      <p className="text-xs text-slate-400">Add this CNAME record to your DNS provider:</p>
                      <div className="bg-slate-900 rounded-lg p-3">
                        <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-2">
                          <span className="text-slate-400">TYPE</span>
                          <span className="text-slate-400">NAME</span>
                          <span className="text-slate-400">VALUE</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                          <span className="text-blue-300">CNAME</span>
                          <span className="text-green-300">{customDomain || "your-domain"}</span>
                          <span className="text-green-300">app.zonforge.io</span>
                        </div>
                      </div>
                      <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors" onClick={() => navigator.clipboard.writeText("CNAME\t" + customDomain + "\tapp.zonforge.io")}>
                        📋 Copy DNS Record
                      </button>
                    </div>
                  )}

                  <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg p-3 text-xs text-blue-300">
                    ℹ SSL certificate is automatically provisioned via Let's Encrypt after DNS verification (usually within 10 minutes).
                  </div>
                </div>
              )}

              {/* ── EMAIL ── */}
              {tab === "email" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">From Name</label>
                      <input value={fromName} onChange={e => setFromName(e.target.value)}
                        placeholder="Acme Security"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">From Address</label>
                      <input value={fromAddress} onChange={e => setFromAddress(e.target.value)}
                        placeholder="security@yourclient.com"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"/>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Reply-To Address</label>
                    <input value={replyTo} onChange={e => setReplyTo(e.target.value)}
                      placeholder="support@yourclient.com"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"/>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer p-3 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600">
                    <input type="checkbox" checked={customSmtp} onChange={e => setCustomSmtp(e.target.checked)}
                      className="mt-0.5 rounded border-slate-600 bg-slate-700 text-red-600"/>
                    <div>
                      <p className="text-sm font-medium text-white">Use Custom SMTP Server</p>
                      <p className="text-xs text-slate-400">Route emails through your own SMTP server instead of ZonForge's</p>
                    </div>
                  </label>

                  {customSmtp && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-400 mb-1">SMTP Host</label>
                        <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                          placeholder="smtp.yourclient.com"
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none"/>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Port</label>
                        <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none"/>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── FEATURES ── */}
              {tab === "features" && (
                <div className="space-y-3">
                  {[
                    { key: "hideZF", value: hideZF, setter: setHideZF, label: "Hide ZonForge Branding", desc: "Remove all ZonForge references from the UI" },
                    { key: "hidePowered", value: hidePowered, setter: setHidePowered, label: "Hide 'Powered by ZonForge'", desc: "Remove the footer attribution text from the sidebar" },
                  ].map(f => (
                    <label key={f.key} className="flex items-start gap-3 cursor-pointer p-4 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-all">
                      <input type="checkbox" checked={f.value} onChange={e => f.setter(e.target.checked)}
                        className="mt-0.5 rounded border-slate-600 bg-slate-700 text-red-600"/>
                      <div>
                        <p className="text-sm font-medium text-white">{f.label}</p>
                        <p className="text-xs text-slate-400">{f.desc}</p>
                      </div>
                    </label>
                  ))}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Custom Support URL</label>
                    <input value={supportUrl} onChange={e => setSupportUrl(e.target.value)}
                      placeholder="https://support.yourclient.com"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Custom Docs URL</label>
                    <input value={docsUrl} onChange={e => setDocsUrl(e.target.value)}
                      placeholder="https://docs.yourclient.com"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Custom Login Message</label>
                    <textarea value={loginMsg} onChange={e => setLoginMsg(e.target.value)} rows={2}
                      placeholder="Welcome to Acme Security. Authorized users only."
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-600 resize-none"/>
                  </div>
                </div>
              )}
            </div>

            {/* Live Preview */}
            {tab === "branding" && (
              <div className="w-72 flex-shrink-0 p-5 border-l border-slate-800">
                <p className="text-xs font-semibold text-slate-300 mb-3">Live Preview</p>
                <LivePreview config={previewConfig}/>
                <p className="text-xs text-slate-500 mt-2 text-center">Updates as you type</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || (!config && !tenantId)}
            className="flex-1 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors">
            {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Saving...</> : saved ? "✅ Saved!" : (config ? "Save Changes" : "Create Config")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WhiteLabel() {
  const [showForm, setShowForm] = useState(false);
  const [editConfig, setEditConfig] = useState<WhiteLabelConfig | undefined>();
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { data: configs = mockConfigs } = useQuery<WhiteLabelConfig[]>({
    queryKey: ["whitelabel-configs"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/whitelabel"); return r.data.data; },
  });

  const stats = {
    enabled: configs.filter(c => c.enabled).length,
    custom_domains: configs.filter(c => c.domain.custom_domain).length,
    ssl_active: configs.filter(c => c.domain.ssl_status === "active").length,
    premium: configs.filter(c => c.features.hide_powered_by).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">White-label Configuration</h1>
          <p className="text-slate-400 text-sm mt-1">Custom branding, domains and email for MSSP partner tenants</p>
        </div>
        <button onClick={() => { setEditConfig(undefined); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          New Config
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Enabled", value: stats.enabled, color: "text-green-400" },
          { label: "Custom Domains", value: stats.custom_domains, color: "text-blue-400" },
          { label: "SSL Active", value: stats.ssl_active, color: "text-green-400" },
          { label: "Full White-label", value: stats.premium, color: "text-purple-400" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Config Cards */}
      <div className="space-y-4">
        {configs.map(cfg => (
          <div key={cfg.id} className={`bg-slate-900 rounded-xl border ${cfg.enabled ? "border-slate-800" : "border-slate-800 opacity-70"} p-5`}>
            <div className="flex items-start gap-4">
              {/* Color preview */}
              <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: cfg.branding.primary_color }}>
                {cfg.tenant_name.charAt(0)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-bold text-white">{cfg.tenant_name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.enabled ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}`}>
                    {cfg.enabled ? "Enabled" : "Disabled"}
                  </span>
                  {cfg.features.hide_powered_by && (
                    <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-800/40 px-2 py-0.5 rounded-full">Full white-label</span>
                  )}
                </div>

                <p className="text-sm font-medium" style={{ color: cfg.branding.primary_color }}>{cfg.branding.product_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{cfg.branding.company_name}</p>

                {/* Domain + SSL */}
                <div className="flex flex-wrap gap-3 mt-2 text-xs">
                  {cfg.domain.custom_domain && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">🌐</span>
                      <span className="font-mono text-slate-300">{cfg.domain.custom_domain}</span>
                      <span className={`px-1.5 py-0.5 rounded-full border ${sslStyle[cfg.domain.ssl_status]}`}>
                        {sslIcon[cfg.domain.ssl_status]} SSL {cfg.domain.ssl_status}
                      </span>
                    </div>
                  )}
                  {cfg.email.from_address && (
                    <span className="text-slate-400">📧 {cfg.email.from_address}</span>
                  )}
                </div>

                {/* Feature flags */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {cfg.features.hide_zonforge_branding && <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">No ZF branding</span>}
                  {cfg.features.custom_support_url && <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">Custom support URL</span>}
                  {cfg.email.custom_smtp && <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">Custom SMTP</span>}
                </div>
              </div>

              {/* Right side */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <p className="text-xs text-slate-500">Updated {timeAgo(cfg.updated_at)}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPreviewId(previewId === cfg.id ? null : cfg.id)}
                    className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                    {previewId === cfg.id ? "Hide Preview" : "Preview"}
                  </button>
                  <button onClick={() => { setEditConfig(cfg); setShowForm(true); }}
                    className="px-3 py-1.5 text-xs bg-red-700/30 hover:bg-red-700/50 text-red-300 border border-red-800/40 rounded-lg transition-colors">
                    Edit
                  </button>
                </div>
              </div>
            </div>

            {/* Preview */}
            {previewId === cfg.id && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <p className="text-xs text-slate-400 mb-3">Live Preview — {cfg.branding.product_name}</p>
                <div className="max-w-sm">
                  <LivePreview config={cfg}/>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm && <ConfigForm config={editConfig} onClose={() => setShowForm(false)}/>}
    </div>
  );
}
