import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mockHealth = {
  ingestion_pipeline: { events_per_sec: 847, queue_depth: 142, lag_ms: 340, error_rate_1h: 0.003, status: "healthy" },
  detection_pipeline: { detections_per_min: 23, queue_depth: 67, lag_ms: 1820, rules_evaluated_1h: 284720, status: "healthy" },
  connectors: { total: 187, healthy: 178, degraded: 7, error: 2 },
  database: { postgres_connections: 34, postgres_max: 100, clickhouse_query_p95_ms: 124 },
  redis: { memory_used_mb: 847, memory_max_mb: 4096, hit_rate: 0.94 },
  services: [
    { name: "API Gateway", port: 3000, status: "healthy", uptime: "99.98%", response_ms: 42 },
    { name: "Ingestion Service", port: 3001, status: "healthy", uptime: "99.97%", response_ms: 18 },
    { name: "Detection Engine", port: 3003, status: "healthy", uptime: "99.95%", response_ms: 67 },
    { name: "Risk Scoring Engine", port: 3007, status: "healthy", uptime: "99.99%", response_ms: 31 },
    { name: "Alert Service", port: 3008, status: "healthy", uptime: "99.96%", response_ms: 24 },
    { name: "AI SOC Analyst", port: 3015, status: "degraded", uptime: "98.21%", response_ms: 2840 },
    { name: "Behavioral AI", port: 3020, status: "healthy", uptime: "99.91%", response_ms: 156 },
  ],
};

const statusDot: Record<string, string> = {
  healthy: "bg-green-500",
  degraded: "bg-yellow-500",
  error: "bg-red-500",
};

const statusText: Record<string, string> = {
  healthy: "text-green-400",
  degraded: "text-yellow-400",
  error: "text-red-400",
};

export default function SystemHealth() {
  const { data = mockHealth } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await apiClient.get("/superadmin/system/health");
      return res.data;
    },
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Health</h1>
          <p className="text-slate-400 text-sm mt-1">Live platform infrastructure metrics · Auto-refresh 10s</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 border border-green-800/40 px-3 py-1.5 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Live
        </div>
      </div>

      {/* Pipelines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          {
            title: "Ingestion Pipeline",
            metrics: [
              { label: "Events/sec", value: data.ingestion_pipeline.events_per_sec.toLocaleString() },
              { label: "Queue Depth", value: data.ingestion_pipeline.queue_depth },
              { label: "Lag", value: `${data.ingestion_pipeline.lag_ms}ms` },
              { label: "Error Rate (1h)", value: `${(data.ingestion_pipeline.error_rate_1h * 100).toFixed(2)}%` },
            ],
            status: data.ingestion_pipeline.status,
          },
          {
            title: "Detection Pipeline",
            metrics: [
              { label: "Detections/min", value: data.detection_pipeline.detections_per_min },
              { label: "Queue Depth", value: data.detection_pipeline.queue_depth },
              { label: "Lag", value: `${data.detection_pipeline.lag_ms}ms` },
              { label: "Rules Evaluated (1h)", value: data.detection_pipeline.rules_evaluated_1h.toLocaleString() },
            ],
            status: data.detection_pipeline.status,
          },
        ].map((pipeline, i) => (
          <div key={i} className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-2.5 h-2.5 rounded-full ${statusDot[pipeline.status]}`} />
              <h2 className="text-sm font-semibold text-white">{pipeline.title}</h2>
              <span className={`text-xs ml-auto ${statusText[pipeline.status]}`}>{pipeline.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {pipeline.metrics.map((m, j) => (
                <div key={j} className="bg-slate-800 rounded-lg p-3">
                  <p className="text-xs text-slate-400">{m.label}</p>
                  <p className="text-lg font-bold text-white mt-0.5">{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Connectors + Database + Redis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Connector Health</h2>
          <div className="space-y-3">
            {[
              { label: "Healthy", value: data.connectors.healthy, color: "bg-green-500", text: "text-green-400" },
              { label: "Degraded", value: data.connectors.degraded, color: "bg-yellow-500", text: "text-yellow-400" },
              { label: "Error", value: data.connectors.error, color: "bg-red-500", text: "text-red-400" },
            ].map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${c.color}`} />
                  <span className="text-sm text-slate-300">{c.label}</span>
                </div>
                <span className={`text-lg font-bold ${c.text}`}>{c.value}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-700">
              <span className="text-xs text-slate-400">Total: {data.connectors.total} connectors</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Database</h2>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">PostgreSQL Connections</span>
                <span className="text-slate-300">{data.database.postgres_connections}/{data.database.postgres_max}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(data.database.postgres_connections / data.database.postgres_max) * 100}%` }} />
              </div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-400">ClickHouse Query P95</p>
              <p className="text-xl font-bold text-white">{data.database.clickhouse_query_p95_ms}ms</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Redis Cache</h2>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Memory</span>
                <span className="text-slate-300">{data.redis.memory_used_mb}MB / {data.redis.memory_max_mb}MB</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="h-2 rounded-full bg-teal-500" style={{ width: `${(data.redis.memory_used_mb / data.redis.memory_max_mb) * 100}%` }} />
              </div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-400">Cache Hit Rate</p>
              <p className="text-xl font-bold text-green-400">{(data.redis.hit_rate * 100).toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Service Status */}
      <div className="bg-slate-900 rounded-xl border border-slate-800">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Service Status</h2>
        </div>
        <div className="divide-y divide-slate-800">
          {data.services.map((svc: any, i: number) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[svc.status]}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{svc.name}</p>
                <p className="text-xs text-slate-500">Port {svc.port}</p>
              </div>
              <div className="text-right">
                <p className={`text-xs font-medium ${statusText[svc.status]}`}>{svc.status}</p>
                <p className="text-xs text-slate-500">{svc.uptime} uptime</p>
              </div>
              <div className="text-right w-20">
                <p className={`text-sm font-bold ${svc.response_ms > 1000 ? "text-yellow-400" : "text-slate-300"}`}>{svc.response_ms}ms</p>
                <p className="text-xs text-slate-500">response</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
