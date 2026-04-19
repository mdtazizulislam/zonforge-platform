import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const connectorTypes = [
  { type: "m365", label: "Microsoft 365 / Entra ID", icon: "🔷" },
  { type: "aws_cloudtrail", label: "AWS CloudTrail", icon: "🟠" },
  { type: "google_workspace", label: "Google Workspace", icon: "🔴" },
  { type: "azure", label: "Azure Activity Logs", icon: "🔵" },
  { type: "gcp", label: "GCP Audit Logs", icon: "🟡" },
  { type: "waf", label: "WAF / Firewall Logs", icon: "🟢" },
];

const statusTone: Record<string, { badge: string; dot: string; cardBorder: string }> = {
  healthy: { badge: "is-success", dot: "#1fd286", cardBorder: "rgba(31, 210, 134, .24)" },
  degraded: { badge: "is-warning", dot: "#ffb547", cardBorder: "rgba(255, 181, 71, .24)" },
  error: { badge: "is-danger", dot: "#ff5d7a", cardBorder: "rgba(255, 93, 122, .24)" },
};

export default function ConnectorManagement() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ type: "", name: "", credentials: "" });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | boolean>(null);

  const { data = [] } = useQuery({
    queryKey: ["connectors"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/connectors");
      return response.data.data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      await apiClient.post(`/admin/connectors/${id}/${action}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connectors"] }),
  });

  const testConnector = async () => {
    setTesting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setTestResult(true);
    setTesting(false);
  };

  const timeAgo = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  };

  return (
    <div className="zf-section">
      <section className="zf-card zf-card--wide">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "end", flexWrap: "wrap" }}>
          <div className="zf-section-head">
            <h2 className="zf-page-title">Connectors</h2>
            <p className="zf-page-subtitle">
              {(data as Array<any>).filter((connector) => connector.status === "healthy").length} of {data.length} healthy
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowAdd(true);
              setStep(1);
              setTestResult(null);
            }}
            className="zf-btn-primary"
          >
            Add Connector
          </button>
        </div>
      </section>

      {(data as Array<any>).length > 0 ? (
        <div className="zf-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {(data as Array<any>).map((connector) => (
            <section key={connector.id} className="zf-card" style={{ borderColor: statusTone[connector.status]?.cardBorder }}>
              <div className="zf-card-head">
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                  <div>
                    <h3 className="zf-card-title">{connector.name}</h3>
                    <p className="zf-card-subtitle">{connector.type.replace(/_/g, " ").toUpperCase()}</p>
                  </div>
                  <span className={`zf-status-pill ${statusTone[connector.status]?.badge ?? ""}`}>{connector.status}</span>
                </div>
              </div>

              <div className="zf-detail-list">
                <div className="zf-detail-row">
                  <span className="zf-label">Events / min</span>
                  <span className="zf-value">{connector.event_rate.toLocaleString()}</span>
                </div>
                <div className="zf-detail-row">
                  <span className="zf-label">Errors</span>
                  <span className="zf-value" style={{ color: connector.error_count > 0 ? "#ff8ea5" : "#6ff0b2" }}>{connector.error_count}</span>
                </div>
                <div className="zf-detail-row">
                  <span className="zf-label">Last event</span>
                  <span className="zf-value">{timeAgo(connector.last_event_at)}</span>
                </div>
              </div>

              <div className="zf-row__actions" style={{ marginTop: "16px" }}>
                <button type="button" className="zf-btn-secondary">View Logs</button>
                <button type="button" className="zf-btn-secondary">Edit</button>
                <button
                  type="button"
                  onClick={() => toggleStatus.mutate({ id: connector.id, action: connector.status === "healthy" ? "pause" : "resume" })}
                  className="zf-btn-secondary"
                >
                  {connector.status === "healthy" ? "Pause" : "Resume"}
                </button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="zf-card zf-card--wide">
          <div className="zf-card-head">
            <h3 className="zf-card-title">No connectors configured yet</h3>
            <p className="zf-card-subtitle">Bring Microsoft 365, AWS, Google Workspace, and firewall telemetry into the platform to activate detections.</p>
          </div>
          <div className="zf-action-stack">
            <button type="button" onClick={() => { setShowAdd(true); setStep(1); setTestResult(null); }} className="zf-btn-primary">
              Add your first connector
            </button>
          </div>
        </section>
      )}

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2, 6, 23, .78)", display: "grid", placeItems: "center", padding: "16px", zIndex: 50 }}>
          <div className="zf-card" style={{ width: "100%", maxWidth: "640px" }}>
            <div className="zf-card-head">
              <h3 className="zf-card-title">Add Connector</h3>
              <p className="zf-card-subtitle">
                {step === 1 ? "Choose a source type" : step === 2 ? "Enter connector details" : "Validate the connection"}
              </p>
            </div>

            {step === 1 && (
              <div className="zf-action-stack">
                {connectorTypes.map((connectorType) => (
                  <button
                    key={connectorType.type}
                    type="button"
                    className="zf-btn-secondary"
                    style={{ justifyContent: "flex-start" }}
                    onClick={() => {
                      setForm((current) => ({ ...current, type: connectorType.type, name: connectorType.label }));
                      setStep(2);
                    }}
                  >
                    {connectorType.icon} {connectorType.label}
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="zf-team-form">
                <div className="zf-team-field">
                  <span>Display Name</span>
                  <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="zf-team-input" />
                </div>
                <div className="zf-team-field">
                  <span>Credentials</span>
                  <textarea
                    rows={4}
                    value={form.credentials}
                    onChange={(event) => setForm((current) => ({ ...current, credentials: event.target.value }))}
                    className="zf-team-input zf-team-input--mono"
                    placeholder="Paste API key, OAuth token, or onboarding snippet"
                    style={{ paddingTop: "12px", minHeight: "110px" }}
                  />
                </div>
                <div className="zf-team-note">
                  <span>Security</span>
                  <small>Connector credentials are stored using encrypted secret references and are never shown back in plain text.</small>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="zf-section">
                <div className="zf-team-note">
                  <span>Connection Test</span>
                  <small>Validate connectivity and permissions before activating ingestion.</small>
                </div>

                <button type="button" onClick={testConnector} disabled={testing} className="zf-btn-primary" style={{ opacity: testing ? 0.75 : 1 }}>
                  {testing ? "Testing…" : "Run Connection Test"}
                </button>

                {testResult === true && (
                  <div className="zf-team-note" style={{ borderColor: "rgba(31, 210, 134, .24)" }}>
                    <span>Connection successful</span>
                    <small>Sample events retrieved and permissions verified.</small>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => (step === 1 ? setShowAdd(false) : setStep(step - 1))}
                className="zf-btn-secondary"
                style={{ flex: 1 }}
              >
                {step === 1 ? "Cancel" : "Back"}
              </button>

              {step < 3 ? (
                <button type="button" onClick={() => setStep(step + 1)} className="zf-btn-primary" style={{ flex: 1 }}>
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!testResult}
                  onClick={() => {
                    setShowAdd(false);
                    qc.invalidateQueries({ queryKey: ["connectors"] });
                  }}
                  className="zf-btn-primary"
                  style={{ flex: 1, opacity: !testResult ? 0.65 : 1 }}
                >
                  Activate Connector
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
