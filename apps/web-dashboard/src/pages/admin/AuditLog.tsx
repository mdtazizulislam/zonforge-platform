import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mockLogs = [
  { id:"1", actor_email:"admin@acme.com", action:"CONNECTOR_CREATED", target_type:"connector", target_id:"m365-prod", ip_address:"81.2.69.144", created_at:new Date(Date.now()-1800000).toISOString(), result:"success" },
  { id:"2", actor_email:"john.smith@acme.com", action:"ALERT_STATUS_CHANGED", target_type:"alert", target_id:"alert-001", ip_address:"81.2.69.144", created_at:new Date(Date.now()-3600000).toISOString(), result:"success" },
  { id:"3", actor_email:"admin@acme.com", action:"USER_INVITED", target_type:"user", target_id:"bob@acme.com", ip_address:"81.2.69.144", created_at:new Date(Date.now()-7200000).toISOString(), result:"success" },
  { id:"4", actor_email:"admin@acme.com", action:"USER_SUSPENDED", target_type:"user", target_id:"contractor@ext.com", ip_address:"81.2.69.144", created_at:new Date(Date.now()-14400000).toISOString(), result:"success" },
  { id:"5", actor_email:"jane.doe@acme.com", action:"LOGIN_SUCCESS", target_type:"session", target_id:"-", ip_address:"195.34.23.100", created_at:new Date(Date.now()-18000000).toISOString(), result:"success" },
  { id:"6", actor_email:"unknown@ext.com", action:"LOGIN_FAILED", target_type:"session", target_id:"-", ip_address:"185.220.101.42", created_at:new Date(Date.now()-21600000).toISOString(), result:"failure" },
];

const actionColor: Record<string,string> = {
  CONNECTOR_CREATED:"bg-teal-500/20 text-teal-400",
  ALERT_STATUS_CHANGED:"bg-blue-500/20 text-blue-400",
  USER_INVITED:"bg-purple-500/20 text-purple-400",
  USER_SUSPENDED:"bg-orange-500/20 text-orange-400",
  LOGIN_SUCCESS:"bg-green-500/20 text-green-400",
  LOGIN_FAILED:"bg-red-500/20 text-red-400",
};

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data = mockLogs } = useQuery({
    queryKey: ["audit-logs", page, search, actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: page.toString() });
      if (search) params.set("actor_id", search);
      if (actionFilter) params.set("action", actionFilter);
      const r = await apiClient.get(`/admin/audit?${params}`);
      return r.data.data;
    },
  });

  const filtered = data.filter((l:any) =>
    l.actor_email.toLowerCase().includes(search.toLowerCase()) ||
    l.action.toLowerCase().includes(search.toLowerCase())
  ).filter((l:any) => !actionFilter || l.action === actionFilter);

  const exportCSV = () => {
    const rows = [["Time","Actor","Action","Target","IP","Result"],
      ...filtered.map((l:any)=>[new Date(l.created_at).toISOString(),l.actor_email,l.action,`${l.target_type}:${l.target_id}`,l.ip_address,l.result])
    ];
    const csv = rows.map(r=>r.join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="audit-log.csv"; a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-slate-400 text-sm mt-1">Tamper-resistant record of all platform actions</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by actor or action..."
          className="flex-1 min-w-[200px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"/>
        <select value={actionFilter} onChange={e=>setActionFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Actions</option>
          {["CONNECTOR_CREATED","ALERT_STATUS_CHANGED","USER_INVITED","USER_SUSPENDED","LOGIN_SUCCESS","LOGIN_FAILED"].map(a=>
            <option key={a}>{a}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              {["Timestamp","Actor","Action","Target","IP Address","Result"].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((log:any)=>(
              <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300 max-w-[160px] truncate">{log.actor_email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColor[log.action]??"bg-slate-700 text-slate-300"}`}>
                    {log.action.replace(/_/g," ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  <span className="font-mono">{log.target_type}</span>
                  {log.target_id!=="-"&&<><br/><span className="text-slate-500">{log.target_id}</span></>}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-slate-400">{log.ip_address}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${log.result==="success"?"text-green-400":"text-red-400"}`}>
                    {log.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{filtered.length} records</p>
        <div className="flex gap-2">
          <button disabled={page===1} onClick={()=>setPage(p=>p-1)}
            className="px-3 py-1.5 bg-slate-800 disabled:opacity-40 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors">← Prev</button>
          <span className="px-3 py-1.5 text-xs text-slate-400">Page {page}</span>
          <button onClick={()=>setPage(p=>p+1)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors">Next →</button>
        </div>
      </div>
    </div>
  );
}
