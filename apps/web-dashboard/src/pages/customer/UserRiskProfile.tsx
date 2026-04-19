import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mock = {
  user: { id:"1", name:"John Smith", email:"john.smith@acme.com", department:"Engineering", job_title:"Senior Developer", privilege_level:"elevated", mfa_enabled:false, last_login:"2026-04-13T02:31:00Z" },
  risk_score: 87, severity:"critical",
  score_history: Array.from({length:14},(_,i)=>({ date:new Date(Date.now()-(13-i)*86400000).toLocaleDateString("en",{month:"short",day:"numeric"}), score: 40+Math.floor(Math.random()*50) })),
  contributing_signals: [
    { signal:"Brute-force to successful login", weight:35, description:"23 failed attempts followed by success from Tor exit node" },
    { signal:"Impossible travel login", weight:28, description:"Login from Nigeria 2h after UK login — geographic impossibility" },
    { signal:"MFA not enforced", weight:15, description:"Account using legacy authentication without MFA challenge" },
    { signal:"Mass file download", weight:12, description:"847 files downloaded in under 3 minutes" },
    { signal:"New IAM key created", weight:10, description:"AWS IAM access key created post-compromise" },
  ],
  active_alerts: [
    { id:"1", title:"Brute-Force to Successful Login", severity:"critical", priority:"P1", status:"open", created_at:new Date(Date.now()-3600000).toISOString() },
    { id:"2", title:"Impossible Travel Login", severity:"high", priority:"P2", status:"investigating", created_at:new Date(Date.now()-7200000).toISOString() },
  ],
  login_heatmap: Array.from({length:7},(_,day)=>Array.from({length:24},(_,h)=>({ day, hour:h, count:Math.random()>0.7?Math.floor(Math.random()*5):0 }))).flat(),
};

const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const scoreColor = (s:number) => s>=85?"text-red-400":s>=70?"text-orange-400":s>=50?"text-yellow-400":"text-green-400";
const sevBg: Record<string,string> = { critical:"bg-red-500/10 border-red-500/30 text-red-400", high:"bg-orange-500/10 border-orange-500/30 text-orange-400", medium:"bg-yellow-500/10 border-yellow-500/30 text-yellow-400", low:"bg-green-500/10 border-green-500/30 text-green-400" };

export default function UserRiskProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data = mock } = useQuery({
    queryKey: ["user-risk", id],
    queryFn: async () => { const r = await apiClient.get(`/risk/users/${id}`); return r.data; },
  });

  const maxScore = Math.max(...data.score_history.map((s:any)=>s.score),1);
  const maxHeat = Math.max(...data.login_heatmap.map((h:any)=>h.count),1);

  return (
    <div className="space-y-6 max-w-5xl">
      <button onClick={()=>navigate("/risk/users")} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        Back to User Risk
      </button>

      {/* Header */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-xl font-bold text-white">
            {data.user.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{data.user.name}</h1>
            <p className="text-slate-400 text-sm">{data.user.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{data.user.department}</span>
              <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{data.user.job_title}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${data.user.privilege_level==="elevated"?"bg-orange-900/40 text-orange-400":"bg-slate-800 text-slate-300"}`}>
                {data.user.privilege_level} privilege
              </span>
              {!data.user.mfa_enabled && <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded">MFA disabled</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-5xl font-bold ${scoreColor(data.risk_score)}`}>{data.risk_score}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${sevBg[data.severity]}`}>{data.severity}</span>
        </div>
      </div>

      {/* Score History */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Risk Score — 14 Day History</h2>
        <div className="flex items-end gap-1 h-20">
          {data.score_history.map((s:any,i:number)=>(
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
              <div className={`w-full rounded-t transition-all ${scoreColor(s.score).replace("text-","bg-").replace("-400","-600/70")}`}
                style={{height:`${(s.score/maxScore)*72}px`}}>
              </div>
              {i%3===0&&<span className="text-xs text-slate-500">{s.date}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contributing Signals */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Contributing Signals</h2>
          <div className="space-y-3">
            {data.contributing_signals.map((sig:any,i:number)=>(
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">{sig.signal}</span>
                  <span className="text-slate-400">{sig.weight}pts</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mb-1">
                  <div className="h-1.5 rounded-full bg-red-500" style={{width:`${sig.weight}%`}}/>
                </div>
                <p className="text-xs text-slate-500">{sig.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Active Alerts */}
        <div className="bg-slate-900 rounded-xl border border-slate-800">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">Active Alerts</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {data.active_alerts.length===0 ? (
              <p className="text-slate-400 text-sm p-4">No active alerts</p>
            ) : data.active_alerts.map((a:any)=>(
              <div key={a.id} className="p-4 hover:bg-slate-800/50 cursor-pointer transition-colors" onClick={()=>navigate(`/alerts/${a.id}`)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${a.priority==="P1"?"bg-red-600 text-white":"bg-orange-500 text-white"}`}>{a.priority}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${sevBg[a.severity]}`}>{a.severity}</span>
                </div>
                <p className="text-sm text-white">{a.title}</p>
                <p className="text-xs text-slate-500 mt-1">{a.status} · {new Date(a.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Login Heatmap */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Login Activity Heatmap (Day × Hour)</h2>
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 mr-2">
            {days.map(d=><div key={d} className="h-5 flex items-center text-xs text-slate-500 w-7">{d}</div>)}
          </div>
          <div className="flex-1 overflow-x-auto">
            <div className="flex flex-col gap-1" style={{minWidth:"600px"}}>
              {days.map((_,day)=>(
                <div key={day} className="flex gap-1">
                  {Array.from({length:24},(_,h)=>{
                    const cell = data.login_heatmap.find((c:any)=>c.day===day&&c.hour===h);
                    const intensity = cell ? cell.count/maxHeat : 0;
                    return <div key={h} className="w-5 h-5 rounded-sm" style={{backgroundColor:intensity>0?`rgba(59,130,246,${0.2+intensity*0.8})`:"#1e293b"}} title={`${days[day]} ${h}:00`}/>;
                  })}
                </div>
              ))}
            </div>
            <div className="flex mt-1" style={{minWidth:"600px"}}>
              {Array.from({length:24},(_,h)=>(
                <div key={h} className="w-5 text-center" style={{fontSize:"9px",color:"#64748b"}}>{h%6===0?h:""}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
