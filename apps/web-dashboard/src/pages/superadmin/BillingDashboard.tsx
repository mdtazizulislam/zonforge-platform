import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mockBilling = {
  mrr: 38450, arr: 461400, new_this_month: 6, churn_rate: 2.1,
  mrr_trend: Array.from({length:12},(_,i)=>({ month:new Date(2025,i,1).toLocaleString("en",{month:"short"}), mrr:20000+i*1500+Math.floor(Math.random()*2000) })),
  tenants_by_plan: [
    { plan:"Starter", count:18, mrr:8982, color:"#3b82f6" },
    { plan:"Growth", count:14, mrr:20986, color:"#0d9488" },
    { plan:"Business", count:11, mrr:43989, color:"#8b5cf6" },
    { plan:"Enterprise", count:4, mrr:48000, color:"#f59e0b" },
  ],
  overages: [
    { tenant:"CloudSoft", type:"Events", overage:"2.1M over limit", amount:210 },
    { tenant:"DataDriven Co", type:"Identities", overage:"54 over limit", amount:162 },
  ],
  upcoming_renewals: [
    { tenant:"Acme Corp", plan:"Business", amount:3999, renewal_date:"2026-04-15" },
    { tenant:"FinTech Labs", plan:"Growth", amount:1499, renewal_date:"2026-04-18" },
    { tenant:"CloudSoft", plan:"Enterprise", amount:12000, renewal_date:"2026-04-22" },
  ],
};

export default function BillingDashboard() {
  const { data = mockBilling } = useQuery({
    queryKey: ["platform-billing"],
    queryFn: async () => {
      const r = await apiClient.get("/superadmin/billing");
      return r.data;
    },
  });

  const maxMRR = Math.max(...data.mrr_trend.map((m:any)=>m.mrr),1);
  const totalPlanMRR = data.tenants_by_plan.reduce((s:number,p:any)=>s+p.mrr,0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Billing</h1>
        <p className="text-slate-400 text-sm mt-1">Revenue and subscription metrics</p>
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:"MRR", value:`$${data.mrr.toLocaleString()}`, sub:"Monthly Recurring Revenue", color:"text-green-400" },
          { label:"ARR", value:`$${data.arr.toLocaleString()}`, sub:"Annual Recurring Revenue", color:"text-green-300" },
          { label:"New Tenants", value:data.new_this_month, sub:"This calendar month", color:"text-blue-400" },
          { label:"Churn Rate", value:`${data.churn_rate}%`, sub:"Monthly", color:data.churn_rate<3?"text-green-400":"text-red-400" },
        ].map((c,i)=>(
          <div key={i} className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* MRR Trend */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">MRR Trend — Last 12 Months</h2>
        <div className="flex items-end gap-2 h-28">
          {data.mrr_trend.map((m:any,i:number)=>(
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 whitespace-nowrap">${(m.mrr/1000).toFixed(1)}K</div>
              <div className="w-full bg-green-600/70 hover:bg-green-500 rounded-t transition-all" style={{height:`${(m.mrr/maxMRR)*96}px`}}/>
              <span className="text-xs text-slate-500">{m.month}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tenants by Plan */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Revenue by Plan</h2>
          <div className="space-y-3">
            {data.tenants_by_plan.map((p:any,i:number)=>{
              const pct = Math.round((p.mrr/totalPlanMRR)*100);
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{p.plan} ({p.count} tenants)</span>
                    <span className="text-slate-400">${p.mrr.toLocaleString()} · {pct}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{width:`${pct}%`,backgroundColor:p.color}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Renewals */}
        <div className="bg-slate-900 rounded-xl border border-slate-800">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">Upcoming Renewals (30 days)</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {data.upcoming_renewals.map((r:any,i:number)=>(
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{r.tenant}</p>
                  <p className="text-xs text-slate-400">{r.plan} · {r.renewal_date}</p>
                </div>
                <p className="text-sm font-bold text-green-400">${r.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Usage Overages */}
      {data.overages.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-orange-800/40 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">⚠ Usage Overages This Month</h2>
          <div className="space-y-2">
            {data.overages.map((o:any,i:number)=>(
              <div key={i} className="flex items-center justify-between bg-orange-900/20 px-4 py-3 rounded-lg border border-orange-800/30">
                <div>
                  <p className="text-sm font-medium text-white">{o.tenant}</p>
                  <p className="text-xs text-orange-300">{o.type}: {o.overage}</p>
                </div>
                <p className="text-sm font-bold text-orange-400">+${o.amount}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
