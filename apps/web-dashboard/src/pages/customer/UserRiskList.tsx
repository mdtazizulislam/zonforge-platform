import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mock = [
  { id:"1", name:"John Smith", email:"john.smith@acme.com", department:"Engineering", role:"SECURITY_ANALYST", score:87, severity:"critical", score_delta:+12, alerts:3 },
  { id:"2", name:"Jane Doe", email:"jane.doe@acme.com", department:"Finance", role:"READ_ONLY", score:72, severity:"high", score_delta:+5, alerts:1 },
  { id:"3", name:"Admin User", email:"admin@acme.com", department:"IT", role:"TENANT_ADMIN", score:65, severity:"medium", score_delta:-3, alerts:2 },
  { id:"4", name:"Bob Wilson", email:"bob@acme.com", department:"Sales", role:"READ_ONLY", score:34, severity:"low", score_delta:0, alerts:0 },
  { id:"5", name:"Alice Chen", email:"alice@acme.com", department:"Engineering", role:"SECURITY_ANALYST", score:91, severity:"critical", score_delta:+23, alerts:5 },
];

const sevColor: Record<string,string> = {
  critical:"text-red-400 bg-red-500/10 border-red-500/30",
  high:"text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium:"text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low:"text-green-400 bg-green-500/10 border-green-500/30",
};

const scoreColor = (s: number) =>
  s>=85?"text-red-400":s>=70?"text-orange-400":s>=50?"text-yellow-400":"text-green-400";

export default function UserRiskList() {
  const navigate = useNavigate();
  const [sort, setSort] = useState<"score"|"name">("score");
  const [sev, setSev] = useState("");

  const { data = mock } = useQuery({
    queryKey: ["risk-users"],
    queryFn: async () => { const r = await apiClient.get("/risk/users"); return r.data.data; },
  });

  const filtered = [...data]
    .filter((u:any) => !sev || u.severity === sev)
    .sort((a:any,b:any) => sort==="score" ? b.score-a.score : a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">User Risk</h1>
        <p className="text-slate-400 text-sm mt-1">{filtered.length} monitored identities</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[["critical","Critical",data.filter((u:any)=>u.severity==="critical").length,"text-red-400","border-red-900/40"],
          ["high","High",data.filter((u:any)=>u.severity==="high").length,"text-orange-400","border-orange-900/40"],
          ["medium","Medium",data.filter((u:any)=>u.severity==="medium").length,"text-yellow-400","border-yellow-900/40"],
          ["low","Low",data.filter((u:any)=>u.severity==="low").length,"text-green-400","border-green-900/40"],
        ].map(([key,label,count,color,border]:any)=>(
          <button key={key} onClick={()=>setSev(sev===key?"":key)}
            className={`bg-slate-900 rounded-xl p-4 border ${sev===key?border.replace("/40",""):"border-slate-800"} text-center hover:border-slate-600 transition-all`}>
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
            <p className="text-xs text-slate-400 mt-1">{label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <button onClick={()=>setSort("score")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort==="score"?"bg-blue-600 text-white":"text-slate-400 hover:text-white"}`}>Sort by Risk</button>
        <button onClick={()=>setSort("name")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort==="name"?"bg-blue-600 text-white":"text-slate-400 hover:text-white"}`}>Sort by Name</button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((u:any)=>(
          <div key={u.id} onClick={()=>navigate(`/risk/users/${u.id}`)}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-600 cursor-pointer transition-all flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
              {u.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{u.name}</p>
              <p className="text-xs text-slate-400">{u.email} · {u.department}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {u.alerts > 0 && <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full">{u.alerts} alerts</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full border ${sevColor[u.severity]}`}>{u.severity}</span>
              <div className="text-right">
                <p className={`text-xl font-bold ${scoreColor(u.score)}`}>{u.score}</p>
                <p className={`text-xs ${u.score_delta>0?"text-red-400":u.score_delta<0?"text-green-400":"text-slate-500"}`}>
                  {u.score_delta>0?`+${u.score_delta}`:u.score_delta===0?"—":u.score_delta}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
