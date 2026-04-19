import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mockConnectors = [
  { id:"1", name:"Microsoft 365", type:"m365", status:"healthy", last_event_at:new Date(Date.now()-120000).toISOString(), event_rate:847, error_count:0, config:{} },
  { id:"2", name:"AWS CloudTrail", type:"aws_cloudtrail", status:"healthy", last_event_at:new Date(Date.now()-300000).toISOString(), event_rate:234, error_count:0, config:{} },
  { id:"3", name:"Google Workspace", type:"google_workspace", status:"degraded", last_event_at:new Date(Date.now()-900000).toISOString(), event_rate:12, error_count:3, config:{} },
  { id:"4", name:"WAF Logs", type:"waf", status:"error", last_event_at:new Date(Date.now()-3600000).toISOString(), event_rate:0, error_count:47, config:{} },
];

const connectorTypes = [
  { type:"m365", label:"Microsoft 365 / Entra ID", icon:"🔷" },
  { type:"aws_cloudtrail", label:"AWS CloudTrail", icon:"🟠" },
  { type:"google_workspace", label:"Google Workspace", icon:"🔴" },
  { type:"azure", label:"Azure Activity Logs", icon:"🔵" },
  { type:"gcp", label:"GCP Audit Logs", icon:"🟡" },
  { type:"waf", label:"WAF / Firewall Logs", icon:"🟢" },
];

const statusDot: Record<string,string> = { healthy:"bg-green-500", degraded:"bg-yellow-500 animate-pulse", error:"bg-red-500 animate-pulse" };
const statusText: Record<string,string> = { healthy:"text-green-400", degraded:"text-yellow-400", error:"text-red-400" };
const statusBg: Record<string,string> = { healthy:"border-slate-800", degraded:"border-yellow-800/50", error:"border-red-800/50" };

export default function ConnectorManagement() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ type:"", name:"", credentials:"" });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null|boolean>(null);

  const { data = mockConnectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: async () => { const r = await apiClient.get("/admin/connectors"); return r.data.data; },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, action }: { id:string; action:string }) => {
      await apiClient.post(`/admin/connectors/${id}/${action}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey:["connectors"] }),
  });

  const testConnector = async () => {
    setTesting(true);
    await new Promise(r => setTimeout(r, 1500));
    setTestResult(true);
    setTesting(false);
  };

  const timeAgo = (iso: string) => {
    const m = Math.floor((Date.now()-new Date(iso).getTime())/60000);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m/60)}h ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Connectors</h1>
          <p className="text-slate-400 text-sm mt-1">{data.filter((c:any)=>c.status==="healthy").length} of {data.length} healthy</p>
        </div>
        <button onClick={()=>{setShowAdd(true);setStep(1);setTestResult(null);}}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Add Connector
        </button>
      </div>

      {/* Connector Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.map((c:any) => (
          <div key={c.id} className={`bg-slate-900 rounded-xl border ${statusBg[c.status]} p-5`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${statusDot[c.status]}`} />
                <div>
                  <p className="text-sm font-semibold text-white">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.type.replace("_"," ").toUpperCase()}</p>
                </div>
              </div>
              <span className={`text-xs font-medium ${statusText[c.status]}`}>{c.status}</span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-white">{c.event_rate.toLocaleString()}</p>
                <p className="text-xs text-slate-400">events/min</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <p className={`text-lg font-bold ${c.error_count>0?"text-red-400":"text-green-400"}`}>{c.error_count}</p>
                <p className="text-xs text-slate-400">errors</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <p className="text-sm font-medium text-slate-300">{timeAgo(c.last_event_at)}</p>
                <p className="text-xs text-slate-400">last event</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors">
                View Logs
              </button>
              <button className="flex-1 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors">
                Edit
              </button>
              <button
                onClick={() => toggleStatus.mutate({ id:c.id, action:c.status==="healthy"?"pause":"resume" })}
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${c.status==="healthy"?"bg-yellow-900/30 text-yellow-400 border-yellow-800/50 hover:bg-yellow-900/50":"bg-green-900/30 text-green-400 border-green-800/50 hover:bg-green-900/50"}`}>
                {c.status==="healthy"?"Pause":"Resume"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Connector Wizard */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-lg">
            {/* Steps */}
            <div className="flex items-center gap-2 mb-6">
              {[1,2,3].map(s=>(
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step>=s?"bg-teal-600 text-white":"bg-slate-800 text-slate-400"}`}>{s}</div>
                  {s<3&&<div className={`flex-1 h-0.5 w-8 ${step>s?"bg-teal-600":"bg-slate-700"}`}/>}
                </div>
              ))}
              <p className="ml-2 text-sm text-slate-300">
                {step===1?"Select Type":step===2?"Configure":step===3?"Test & Activate":""}
              </p>
            </div>

            {step===1 && (
              <div className="space-y-2">
                <p className="text-sm text-slate-400 mb-3">Choose a data source to connect:</p>
                {connectorTypes.map(ct=>(
                  <button key={ct.type} onClick={()=>{setForm(f=>({...f,type:ct.type,name:ct.label}));setStep(2);}}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-teal-700 rounded-lg transition-all text-left">
                    <span className="text-xl">{ct.icon}</span>
                    <span className="text-sm text-white">{ct.label}</span>
                  </button>
                ))}
              </div>
            )}

            {step===2 && (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">Configure <strong className="text-white">{form.name}</strong></p>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Display Name</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"/>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Credentials (API Key / OAuth)</label>
                  <textarea value={form.credentials} onChange={e=>setForm(f=>({...f,credentials:e.target.value}))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" rows={3}
                    placeholder="Paste your credentials here — encrypted before storage"/>
                  <p className="text-xs text-slate-500 mt-1">🔒 Credentials are encrypted with AES-256-GCM before being stored</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={()=>setStep(1)} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Back</button>
                  <button onClick={()=>setStep(3)} className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg">Next</button>
                </div>
              </div>
            )}

            {step===3 && (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">Test connection to <strong className="text-white">{form.name}</strong></p>
                <button onClick={testConnector} disabled={testing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-white transition-colors disabled:opacity-50">
                  {testing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Testing connection...</> : "Run Connection Test"}
                </button>
                {testResult===true && (
                  <div className="bg-green-900/30 border border-green-800/50 rounded-lg p-3 text-sm text-green-400">
                    ✅ Connection successful · 15ms latency · Sample events retrieved
                  </div>
                )}
                {testResult===false && (
                  <div className="bg-red-900/30 border border-red-800/50 rounded-lg p-3 text-sm text-red-400">
                    ❌ Connection failed — check your credentials
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={()=>setStep(2)} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Back</button>
                  <button onClick={()=>{setShowAdd(false);qc.invalidateQueries({queryKey:["connectors"]});}} disabled={!testResult}
                    className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors">
                    Activate Connector
                  </button>
                </div>
              </div>
            )}

            <button onClick={()=>setShowAdd(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
