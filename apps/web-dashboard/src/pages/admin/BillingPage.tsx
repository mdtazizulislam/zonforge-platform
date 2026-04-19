import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mockBilling = {
  subscription: { plan:"Business", status:"active", identity_limit:200, current_period_end:"2026-05-13", stripe_subscription_id:"sub_abc123" },
  usage: { identities_used:87, events_this_month:2847293, event_limit:10000000, api_calls:184729, connector_count:4, connector_limit:10 },
  invoices: [
    { id:"inv_001", date:"2026-04-01", amount:3999, status:"paid", pdf:"#" },
    { id:"inv_002", date:"2026-03-01", amount:3999, status:"paid", pdf:"#" },
    { id:"inv_003", date:"2026-02-01", amount:1499, status:"paid", pdf:"#" },
  ],
};

export default function BillingPage() {
  const { data = mockBilling } = useQuery({
    queryKey: ["billing"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/billing/usage");
      return r.data;
    },
  });

  const idPct = Math.round((data.usage.identities_used / data.subscription.identity_limit) * 100);
  const evPct = Math.round((data.usage.events_this_month / data.usage.event_limit) * 100);
  const conPct = Math.round((data.usage.connector_count / data.usage.connector_limit) * 100);

  const UsageBar = ({ label, used, limit, pct, format }: any) => (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-400">{format(used)} / {format(limit)}</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full transition-all ${pct>=90?"bg-red-500":pct>=70?"bg-yellow-500":"bg-teal-500"}`} style={{width:`${pct}%`}}/>
      </div>
      <p className="text-xs text-slate-500 mt-0.5">{pct}% used</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing & Usage</h1>
        <p className="text-slate-400 text-sm mt-1">Manage your subscription and monitor usage</p>
      </div>

      {/* Current Plan */}
      <div className="bg-slate-900 rounded-xl border border-teal-800/40 p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-bold text-white">{data.subscription.plan} Plan</span>
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">{data.subscription.status}</span>
            </div>
            <p className="text-sm text-slate-400">Next renewal: <span className="text-white">{data.subscription.current_period_end}</span></p>
            <p className="text-xs text-slate-500 mt-1">Subscription ID: {data.subscription.stripe_subscription_id}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-teal-400">$3,999</p>
            <p className="text-xs text-slate-400">/month</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors">Upgrade Plan</button>
          <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-700 transition-colors">Manage Payment</button>
        </div>
      </div>

      {/* Usage */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Current Period Usage</h2>
        <div className="space-y-4">
          <UsageBar label="Monitored Identities" used={data.usage.identities_used} limit={data.subscription.identity_limit} pct={idPct} format={(n:number)=>n.toLocaleString()} />
          <UsageBar label="Events Ingested" used={data.usage.events_this_month} limit={data.usage.event_limit} pct={evPct} format={(n:number)=>n>=1000000?`${(n/1000000).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(0)}K`:n} />
          <UsageBar label="Active Connectors" used={data.usage.connector_count} limit={data.usage.connector_limit} pct={conPct} format={(n:number)=>n} />
        </div>
        {idPct >= 80 && (
          <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-800/50 rounded-lg text-sm text-yellow-400">
            ⚠ You're at {idPct}% of your identity limit. <a href="#" className="underline">Upgrade to avoid service interruption.</a>
          </div>
        )}
      </div>

      {/* Invoices */}
      <div className="bg-slate-900 rounded-xl border border-slate-800">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Invoice History</h2>
        </div>
        <div className="divide-y divide-slate-800">
          {data.invoices.map((inv:any)=>(
            <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{inv.date}</p>
                <p className="text-xs text-slate-400">{inv.id}</p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-sm font-medium text-white">${inv.amount.toLocaleString()}</p>
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">{inv.status}</span>
                <a href={inv.pdf} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Download PDF</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
