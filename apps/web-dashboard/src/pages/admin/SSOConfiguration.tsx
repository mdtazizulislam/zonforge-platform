import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type SSOProvider = "okta" | "azure_ad" | "google" | "saml" | "oidc";
type SSOStatus = "active" | "inactive" | "testing" | "error";

interface SSOConfig {
  id: string;
  provider: SSOProvider;
  status: SSOStatus;
  display_name: string;
  domain: string;
  entity_id?: string;
  sso_url?: string;
  slo_url?: string;
  certificate?: string;
  client_id?: string;
  client_secret_hint?: string;
  tenant_id?: string;
  discovery_url?: string;
  attribute_mapping: {
    email: string;
    name: string;
    role?: string;
  };
  default_role: "SECURITY_ANALYST" | "READ_ONLY" | "TENANT_ADMIN";
  enforce_sso: boolean;
  allow_password_fallback: boolean;
  created_at: string;
  last_used?: string;
  users_via_sso: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockConfig: SSOConfig = {
  id: "sso-1",
  provider: "azure_ad",
  status: "active",
  display_name: "Azure Active Directory",
  domain: "acme.com",
  tenant_id: "12345678-1234-1234-1234-123456789012",
  client_id: "87654321-4321-4321-4321-210987654321",
  client_secret_hint: "••••••••••••Xk3p",
  discovery_url: "https://login.microsoftonline.com/12345678-1234-1234-1234-123456789012/v2.0/.well-known/openid-configuration",
  attribute_mapping: { email: "mail", name: "displayName", role: "jobTitle" },
  default_role: "SECURITY_ANALYST",
  enforce_sso: false,
  allow_password_fallback: true,
  created_at: "2026-02-01T10:00:00Z",
  last_used: new Date(Date.now() - 3600000).toISOString(),
  users_via_sso: 47,
};

// ─── Provider configs ─────────────────────────────────────────────────────────
const providers = [
  {
    id: "azure_ad", name: "Microsoft Azure AD", icon: "🔵",
    description: "OIDC/SAML via Azure Active Directory or Entra ID",
    fields: ["tenant_id", "client_id", "client_secret"],
    protocol: "OIDC",
  },
  {
    id: "okta", name: "Okta", icon: "🔷",
    description: "OIDC or SAML via Okta Identity Provider",
    fields: ["domain", "client_id", "client_secret"],
    protocol: "OIDC",
  },
  {
    id: "google", name: "Google Workspace", icon: "🔴",
    description: "OIDC via Google Workspace for your domain",
    fields: ["domain", "client_id", "client_secret"],
    protocol: "OIDC",
  },
  {
    id: "saml", name: "Generic SAML 2.0", icon: "🟢",
    description: "Any SAML 2.0 compatible identity provider",
    fields: ["entity_id", "sso_url", "slo_url", "certificate"],
    protocol: "SAML",
  },
  {
    id: "oidc", name: "Generic OIDC", icon: "🟡",
    description: "Any OpenID Connect 1.0 compatible provider",
    fields: ["discovery_url", "client_id", "client_secret"],
    protocol: "OIDC",
  },
];

const statusColor: Record<SSOStatus, string> = {
  active: "text-green-400 bg-green-500/10 border-green-500/30",
  inactive: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  testing: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  error: "text-red-400 bg-red-500/10 border-red-500/30",
};

const statusDot: Record<SSOStatus, string> = {
  active: "bg-green-500",
  inactive: "bg-slate-500",
  testing: "bg-yellow-500 animate-pulse",
  error: "bg-red-500 animate-pulse",
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── SP Metadata Block ────────────────────────────────────────────────────────
function SPMetadata({ domain }: { domain: string }) {
  const spEntityId = `https://sentinel.zonforge.io/saml/metadata/${domain}`;
  const acsUrl = `https://sentinel.zonforge.io/saml/acs/${domain}`;
  const sloUrl = `https://sentinel.zonforge.io/saml/slo/${domain}`;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <h3 className="text-sm font-semibold text-white mb-3">
        Service Provider Metadata
        <span className="ml-2 text-xs text-slate-400 font-normal">— provide these values to your IdP</span>
      </h3>
      <div className="space-y-3">
        {[
          { label: "SP Entity ID / Audience URI", value: spEntityId },
          { label: "ACS URL (Assertion Consumer Service)", value: acsUrl },
          { label: "SLO URL (Single Logout)", value: sloUrl },
        ].map(item => (
          <div key={item.label}>
            <p className="text-xs text-slate-400 mb-1">{item.label}</p>
            <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2 border border-slate-700">
              <code className="text-xs font-mono text-blue-300 flex-1 break-all">{item.value}</code>
              <button
                onClick={() => navigator.clipboard.writeText(item.value)}
                className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        <a href="#" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors mt-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download SP Metadata XML
        </a>
      </div>
    </div>
  );
}

// ─── Setup Form ───────────────────────────────────────────────────────────────
function SSOSetupForm({ onClose, existing }: { onClose: () => void; existing?: SSOConfig }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(existing ? 2 : 1);
  const [provider, setProvider] = useState<SSOProvider>(existing?.provider ?? "azure_ad");
  const [tab, setTab] = useState<"connection" | "attributes" | "policy" | "test">("connection");

  // Connection fields
  const [domain, setDomain] = useState(existing?.domain ?? "");
  const [tenantId, setTenantId] = useState(existing?.tenant_id ?? "");
  const [clientId, setClientId] = useState(existing?.client_id ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [entityId, setEntityId] = useState(existing?.entity_id ?? "");
  const [ssoUrl, setSsoUrl] = useState(existing?.sso_url ?? "");
  const [sloUrl, setSloUrl] = useState(existing?.slo_url ?? "");
  const [certificate, setCertificate] = useState("");
  const [discoveryUrl, setDiscoveryUrl] = useState(existing?.discovery_url ?? "");

  // Attribute mapping
  const [attrEmail, setAttrEmail] = useState(existing?.attribute_mapping.email ?? "email");
  const [attrName, setAttrName] = useState(existing?.attribute_mapping.name ?? "name");
  const [attrRole, setAttrRole] = useState(existing?.attribute_mapping.role ?? "");

  // Policy
  const [defaultRole, setDefaultRole] = useState(existing?.default_role ?? "SECURITY_ANALYST");
  const [enforceSso, setEnforceSso] = useState(existing?.enforce_sso ?? false);
  const [allowFallback, setAllowFallback] = useState(existing?.allow_password_fallback ?? true);

  // Test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { success: boolean; user?: string; claims?: Record<string, string> }>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedProvider = providers.find(p => p.id === provider)!;

  const testConnection = async () => {
    setTesting(true);
    await new Promise(r => setTimeout(r, 2000));
    setTestResult({
      success: true,
      user: "testuser@acme.com",
      claims: { email: "testuser@acme.com", name: "Test User", role: "SecurityAnalyst", groups: "sg-zonforge-users" },
    });
    setTesting(false);
  };

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    qc.invalidateQueries({ queryKey: ["sso-config"] });
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 700);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">
            {existing ? "Edit SSO Configuration" : "Configure Single Sign-On"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step 1 — Provider Selection */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-5">
            <p className="text-sm text-slate-400 mb-4">Choose your identity provider:</p>
            <div className="grid grid-cols-1 gap-2">
              {providers.map(p => (
                <button key={p.id} onClick={() => setProvider(p.id as SSOProvider)}
                  className={`flex items-center gap-4 px-4 py-4 rounded-xl border text-left transition-all ${
                    provider === p.id
                      ? "border-blue-600 bg-blue-900/20 ring-1 ring-blue-600/30"
                      : "border-slate-700 bg-slate-800 hover:border-slate-600"
                  }`}>
                  <span className="text-2xl flex-shrink-0">{p.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.description}</p>
                  </div>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded flex-shrink-0">{p.protocol}</span>
                  {provider === p.id && (
                    <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Configure */}
        {step === 2 && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 p-3 border-b border-slate-800 overflow-x-auto">
              {([
                { id: "connection", label: "🔗 Connection" },
                { id: "attributes", label: "📋 Attributes" },
                { id: "policy", label: "🛡️ Policy" },
                { id: "test", label: "🧪 Test" },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Connection Tab */}
              {tab === "connection" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <span className="text-xl">{selectedProvider.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{selectedProvider.name}</p>
                      <p className="text-xs text-slate-400">{selectedProvider.protocol} · {selectedProvider.description}</p>
                    </div>
                    {!existing && (
                      <button onClick={() => setStep(1)} className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors">
                        Change →
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Email Domain *</label>
                    <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.com"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-slate-500 mt-1">Users with @{domain || "yourdomain.com"} will be redirected to SSO</p>
                  </div>

                  {/* OIDC fields */}
                  {(provider === "azure_ad" || provider === "okta" || provider === "google" || provider === "oidc") && (
                    <>
                      {provider === "azure_ad" && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Azure Tenant ID</label>
                          <input value={tenantId} onChange={e => setTenantId(e.target.value)}
                            placeholder="12345678-1234-1234-1234-123456789012"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      )}
                      {provider === "oidc" && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">OIDC Discovery URL</label>
                          <input value={discoveryUrl} onChange={e => setDiscoveryUrl(e.target.value)}
                            placeholder="https://your-idp.com/.well-known/openid-configuration"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Client ID *</label>
                          <input value={clientId} onChange={e => setClientId(e.target.value)}
                            placeholder="Application Client ID"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Client Secret *</label>
                          <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                            placeholder={existing?.client_secret_hint ?? "Enter client secret"}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <p className="text-xs text-slate-500 mt-1">🔒 Encrypted with AES-256-GCM before storage</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* SAML fields */}
                  {provider === "saml" && (
                    <>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">IdP Entity ID</label>
                        <input value={entityId} onChange={e => setEntityId(e.target.value)}
                          placeholder="https://your-idp.com/saml/metadata"
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">SSO URL</label>
                          <input value={ssoUrl} onChange={e => setSsoUrl(e.target.value)}
                            placeholder="https://your-idp.com/saml/sso"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">SLO URL (optional)</label>
                          <input value={sloUrl} onChange={e => setSloUrl(e.target.value)}
                            placeholder="https://your-idp.com/saml/slo"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">IdP Certificate (PEM format)</label>
                        <textarea value={certificate} onChange={e => setCertificate(e.target.value)} rows={4}
                          placeholder="-----BEGIN CERTIFICATE-----&#10;MIICxxx...&#10;-----END CERTIFICATE-----"
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      </div>
                      <SPMetadata domain={domain || "yourdomain.com"} />
                    </>
                  )}
                </div>
              )}

              {/* Attributes Tab */}
              {tab === "attributes" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">Map IdP attribute names to ZonForge user fields. Use the exact attribute name from your IdP's token/assertion.</p>
                  <div className="space-y-3">
                    {[
                      { label: "Email Attribute *", value: attrEmail, onChange: setAttrEmail, placeholder: "email / mail / upn", required: true },
                      { label: "Full Name Attribute *", value: attrName, onChange: setAttrName, placeholder: "name / displayName / cn", required: true },
                      { label: "Role/Group Attribute (optional)", value: attrRole, onChange: setAttrRole, placeholder: "role / jobTitle / groups", required: false },
                    ].map(field => (
                      <div key={field.label} className="flex items-center gap-4 bg-slate-800 rounded-xl p-3">
                        <div className="w-52 flex-shrink-0">
                          <p className="text-xs text-white font-medium">{field.label}</p>
                        </div>
                        <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <input value={field.value} onChange={e => field.onChange(e.target.value)}
                          placeholder={field.placeholder}
                          className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
                    <p className="text-xs font-semibold text-white mb-2">Resolved User Example:</p>
                    <div className="space-y-1 text-xs font-mono">
                      <p><span className="text-slate-400">{attrEmail || "email"}:</span> <span className="text-blue-300">john.smith@acme.com</span></p>
                      <p><span className="text-slate-400">{attrName || "name"}:</span> <span className="text-blue-300">John Smith</span></p>
                      {attrRole && <p><span className="text-slate-400">{attrRole}:</span> <span className="text-blue-300">SecurityAnalyst</span></p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Policy Tab */}
              {tab === "policy" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Default Role for New SSO Users</label>
                    <p className="text-xs text-slate-500 mb-3">When a user signs in via SSO for the first time, they are assigned this role. You can change individual roles in User Management.</p>
                    <div className="flex gap-2">
                      {(["SECURITY_ANALYST", "READ_ONLY", "TENANT_ADMIN"] as const).map(role => (
                        <button key={role} onClick={() => setDefaultRole(role)}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                            defaultRole === role ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
                          }`}>
                          {role.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label key="enforce" className="flex items-start gap-3 p-4 bg-slate-800 rounded-xl border border-slate-700 cursor-pointer hover:border-slate-600 transition-colors">
                      <input type="checkbox" checked={enforceSso} onChange={e => setEnforceSso(e.target.checked)}
                        className="mt-0.5 rounded border-slate-600 bg-slate-700 text-blue-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-white">Enforce SSO for all users</p>
                        <p className="text-xs text-slate-400 mt-0.5">Users with @{domain || "yourdomain.com"} email MUST authenticate via SSO. Password login will be blocked.</p>
                        {enforceSso && (
                          <p className="text-xs text-orange-400 mt-1">⚠️ Ensure all users have IdP accounts before enabling to prevent lockouts.</p>
                        )}
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-4 bg-slate-800 rounded-xl border border-slate-700 cursor-pointer hover:border-slate-600 transition-colors">
                      <input type="checkbox" checked={allowFallback} onChange={e => setAllowFallback(e.target.checked)}
                        className="mt-0.5 rounded border-slate-600 bg-slate-700 text-blue-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-white">Allow password fallback</p>
                        <p className="text-xs text-slate-400 mt-0.5">Users can still log in with email/password if SSO is unavailable. Recommended to keep enabled for emergency access.</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Test Tab */}
              {tab === "test" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">Test your SSO configuration by initiating a real authentication flow. This opens a new browser window.</p>
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-2">
                    <p className="text-xs font-semibold text-white">Pre-flight Checks</p>
                    {[
                      { check: "Email domain configured", passed: !!domain },
                      { check: provider === "saml" ? "IdP certificate provided" : "Client ID provided", passed: provider === "saml" ? !!certificate : !!clientId },
                      { check: "Attribute mapping: email field set", passed: !!attrEmail },
                      { check: "Default role configured", passed: !!defaultRole },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={item.passed ? "text-green-400" : "text-red-400"}>{item.passed ? "✓" : "✗"}</span>
                        <span className={item.passed ? "text-slate-300" : "text-red-400"}>{item.check}</span>
                      </div>
                    ))}
                  </div>

                  <button onClick={testConnection} disabled={testing || !domain || !clientId}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/40 rounded-xl text-sm transition-colors disabled:opacity-50">
                    {testing ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-300" />Testing SSO flow...</>
                    ) : "🔑 Initiate Test SSO Login"}
                  </button>

                  {testResult && (
                    <div className={`rounded-xl border p-4 ${testResult.success ? "bg-green-900/20 border-green-800/40" : "bg-red-900/20 border-red-800/40"}`}>
                      <p className={`text-sm font-semibold mb-3 ${testResult.success ? "text-green-400" : "text-red-400"}`}>
                        {testResult.success ? "✅ SSO Test Successful!" : "❌ SSO Test Failed"}
                      </p>
                      {testResult.success && testResult.claims && (
                        <div className="space-y-1">
                          <p className="text-xs text-slate-400 mb-2">Claims received from IdP:</p>
                          {Object.entries(testResult.claims).map(([k, v]) => (
                            <div key={k} className="flex gap-3 text-xs font-mono">
                              <span className="text-slate-400 w-20 flex-shrink-0">{k}:</span>
                              <span className="text-green-300">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-slate-800">
          {step === 1 ? (
            <>
              <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">Cancel</button>
              <button onClick={() => setStep(2)} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                Configure {providers.find(p => p.id === provider)?.name} →
              </button>
            </>
          ) : (
            <>
              {!existing && <button onClick={() => setStep(1)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">← Back</button>}
              <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">Cancel</button>
              <button onClick={save} disabled={saving || !domain}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving...</>
                  : saved ? "✅ Saved!" : (existing ? "Save Changes" : "Save SSO Configuration")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SSOConfiguration() {
  const [showForm, setShowForm] = useState(false);
  const [editConfig, setEditConfig] = useState<SSOConfig | undefined>();

  const { data: config } = useQuery<SSOConfig>({
    queryKey: ["sso-config"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/sso");
      return r.data;
    },
  });

  const activeConfig = config ?? mockConfig;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SSO / SAML Configuration</h1>
          <p className="text-slate-400 text-sm mt-1">Configure Single Sign-On for your organization</p>
        </div>
        {!activeConfig && (
          <button onClick={() => { setEditConfig(undefined); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Configure SSO
          </button>
        )}
      </div>

      {/* Active Config Card */}
      <div className={`bg-slate-900 rounded-xl border p-5 ${activeConfig.status === "active" ? "border-green-800/40" : "border-slate-800"}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="text-3xl">{providers.find(p => p.id === activeConfig.provider)?.icon ?? "🔐"}</div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-base font-bold text-white">{activeConfig.display_name}</h2>
                <div className={`w-2.5 h-2.5 rounded-full ${statusDot[activeConfig.status]}`} />
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor[activeConfig.status]}`}>
                  {activeConfig.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Domain: @{activeConfig.domain} ·
                {activeConfig.users_via_sso} users authenticated via SSO ·
                {activeConfig.last_used ? `Last used ${timeAgo(activeConfig.last_used)}` : "Never used"}
              </p>
            </div>
          </div>
          <button onClick={() => { setEditConfig(activeConfig); setShowForm(true); }}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
            ✏️ Edit
          </button>
        </div>

        {/* Config summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Protocol", value: providers.find(p => p.id === activeConfig.provider)?.protocol ?? "OIDC" },
            { label: "Default Role", value: activeConfig.default_role.replace("_", " ") },
            { label: "Enforce SSO", value: activeConfig.enforce_sso ? "Yes" : "No" },
            { label: "Password Fallback", value: activeConfig.allow_password_fallback ? "Allowed" : "Blocked" },
          ].map((item, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-400">{item.label}</p>
              <p className="text-sm font-medium text-white mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Attribute mapping */}
        <div className="bg-slate-800 rounded-lg p-3">
          <p className="text-xs font-semibold text-white mb-2">Attribute Mapping</p>
          <div className="flex flex-wrap gap-3 text-xs font-mono">
            {Object.entries(activeConfig.attribute_mapping).filter(([, v]) => v).map(([k, v]) => (
              <span key={k} className="bg-slate-700 text-slate-300 px-2 py-1 rounded">
                <span className="text-slate-400">{k}:</span> {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* SP Metadata */}
      <SPMetadata domain={activeConfig.domain} />

      {/* Setup Guide */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Quick Setup Guide — {activeConfig.display_name}</h3>
        <ol className="space-y-3">
          {activeConfig.provider === "azure_ad" ? [
            "In Azure Portal, go to Azure Active Directory → App Registrations → New Registration",
            "Set Redirect URI to: https://sentinel.zonforge.io/auth/callback/azure_ad",
            "Under Certificates & Secrets, create a new Client Secret — copy and paste above",
            "Under API Permissions, add: openid, profile, email, User.Read",
            "Copy the Application (client) ID and Directory (tenant) ID from Overview",
            "Paste both values in the Connection tab above and click Save",
          ] : [
            "Configure your IdP with the SP Entity ID and ACS URL shown above",
            "Copy your IdP metadata URL or certificate",
            "Enter the required credentials in the Connection tab",
            "Map your IdP attribute names in the Attributes tab",
            "Configure SSO policy in the Policy tab",
            "Test the configuration in the Test tab before enforcing for all users",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {showForm && <SSOSetupForm onClose={() => setShowForm(false)} existing={editConfig} />}
    </div>
  );
}
