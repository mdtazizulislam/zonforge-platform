import { useState } from "react";

export default function TenantSettings() {
  const [safeIPs, setSafeIPs] = useState(["10.0.0.0/8","192.168.1.0/24"]);
  const [newIP, setNewIP] = useState("");
  const [bizStart, setBizStart] = useState("08:00");
  const [bizEnd, setBizEnd] = useState("19:00");
  const [timezone, setTimezone] = useState("UTC");
  const [slack, setSlack] = useState("");
  const [email, setEmail] = useState("security@acme.com");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"general"|"notifications"|"retention">("general");

  const save = () => { setSaved(true); setTimeout(()=>setSaved(false),2000); };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Tenant Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Configure your organization's security platform settings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        {(["general","notifications","retention"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab===t?"bg-teal-600 text-white":"text-slate-400 hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab==="general" && (
        <div className="space-y-6">
          {/* Business Hours */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Business Hours</h2>
            <p className="text-xs text-slate-400 mb-4">Activity outside these hours will receive higher anomaly scores.</p>
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Start Time</label>
                <input type="time" value={bizStart} onChange={e=>setBizStart(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"/>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">End Time</label>
                <input type="time" value={bizEnd} onChange={e=>setBizEnd(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"/>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Timezone</label>
                <select value={timezone} onChange={e=>setTimezone(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  {["UTC","US/Eastern","US/Pacific","Europe/London","Asia/Tokyo"].map(tz=>(
                    <option key={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Safe IP List */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Safe IP List</h2>
            <p className="text-xs text-slate-400 mb-4">Logins from these IPs will not trigger location anomaly alerts.</p>
            <div className="space-y-2 mb-3">
              {safeIPs.map((ip,i)=>(
                <div key={i} className="flex items-center justify-between bg-slate-800 px-3 py-2 rounded-lg">
                  <span className="text-sm font-mono text-slate-300">{ip}</span>
                  <button onClick={()=>setSafeIPs(s=>s.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newIP} onChange={e=>setNewIP(e.target.value)} placeholder="192.168.1.0/24"
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-teal-500"/>
              <button onClick={()=>{if(newIP){setSafeIPs(s=>[...s,newIP]);setNewIP("");}}}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors">Add</button>
            </div>
          </div>
        </div>
      )}

      {tab==="notifications" && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Notification Channels</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Email Address</label>
                <div className="flex gap-2">
                  <input value={email} onChange={e=>setEmail(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"/>
                  <button className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">Test</button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Slack Webhook URL</label>
                <div className="flex gap-2">
                  <input value={slack} onChange={e=>setSlack(e.target.value)} placeholder="https://hooks.slack.com/..."
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"/>
                  <button className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">Test</button>
                </div>
              </div>
            </div>
            {/* Alert Thresholds */}
            <div className="mt-6">
              <p className="text-xs font-semibold text-white mb-3">Send notifications for:</p>
              <div className="space-y-2">
                {[["P1 — Critical","Always notify immediately","checked"],
                  ["P2 — High","Notify within 15 minutes","checked"],
                  ["P3 — Medium","Daily digest","unchecked"],
                  ["P4 — Low","Weekly digest","unchecked"],
                ].map(([label,desc,checked])=>(
                  <label key={label} className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked={checked==="checked"} className="mt-0.5 rounded border-slate-600 bg-slate-800 text-teal-600"/>
                    <div>
                      <p className="text-sm text-white">{label}</p>
                      <p className="text-xs text-slate-400">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab==="retention" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Data Retention</h2>
          <p className="text-xs text-slate-400 mb-4">Current plan: <span className="text-teal-400 font-medium">Business — 180 days</span></p>
          <div className="space-y-3">
            {[["Normalized Events","180 days","Upgrade for 365 days"],
              ["Alerts & Findings","Forever","Included in all plans"],
              ["Audit Logs","Forever (immutable)","Cannot be reduced"],
              ["Risk Score History","90 days rolling","Plan-dependent"],
            ].map(([label,value,note])=>(
              <div key={label} className="flex items-center justify-between bg-slate-800 px-4 py-3 rounded-lg">
                <div>
                  <p className="text-sm text-white">{label}</p>
                  <p className="text-xs text-slate-500">{note}</p>
                </div>
                <span className="text-sm font-medium text-teal-400">{value}</span>
              </div>
            ))}
          </div>
          <a href="/admin/billing" className="mt-4 block text-center text-xs text-blue-400 hover:text-blue-300">
            Upgrade plan to extend retention →
          </a>
        </div>
      )}

      <button onClick={save} className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
        {saved ? <>✓ Saved!</> : "Save Settings"}
      </button>
    </div>
  );
}
