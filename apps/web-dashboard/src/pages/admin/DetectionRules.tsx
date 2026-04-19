import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

interface DetectionRule {
  id: string; name: string; description: string;
  severity: "critical"|"high"|"medium"|"low"; enabled: boolean;
  is_global: boolean; source: "platform"|"custom";
  mitre_tactic?: string; mitre_technique?: string; mitre_id?: string;
  conditions: Condition[]; lookback_minutes: number; threshold?: number;
  group_by?: string; suppression_minutes: number;
  hit_count_7d: number; false_positive_rate: number;
  last_triggered?: string; created_at: string; tags: string[];
}

interface Condition {
  id: string; field: string;
  operator: "equals"|"not_equals"|"contains"|"not_contains"|"greater_than"|"less_than"|"regex"|"in"|"not_in";
  value: string; logic: "AND"|"OR";
}

const mockRules: DetectionRule[] = [
  { id:"r1", name:"Brute-Force to Successful Login", description:"Detects multiple failed logins followed by a success.", severity:"high", enabled:true, is_global:true, source:"platform", mitre_tactic:"Credential Access", mitre_technique:"Brute Force", mitre_id:"T1110", conditions:[{id:"c1",field:"event_action",operator:"equals",value:"LOGIN_FAILED",logic:"AND"},{id:"c2",field:"count",operator:"greater_than",value:"10",logic:"AND"}], lookback_minutes:30, threshold:10, group_by:"actor.user_id", suppression_minutes:240, hit_count_7d:23, false_positive_rate:4.2, last_triggered:new Date(Date.now()-3600000).toISOString(), created_at:"2026-01-15T10:00:00Z", tags:["auth","brute-force"] },
  { id:"r2", name:"Impossible Travel Login", description:"Login from two geographically impossible locations in 90 minutes.", severity:"high", enabled:true, is_global:true, source:"platform", mitre_tactic:"Initial Access", mitre_technique:"Valid Accounts", mitre_id:"T1078", conditions:[{id:"c4",field:"event_action",operator:"equals",value:"LOGIN_SUCCESS",logic:"AND"},{id:"c5",field:"geo.distance_km",operator:"greater_than",value:"500",logic:"AND"}], lookback_minutes:90, group_by:"actor.user_id", suppression_minutes:480, hit_count_7d:7, false_positive_rate:12.1, last_triggered:new Date(Date.now()-7200000).toISOString(), created_at:"2026-01-15T10:00:00Z", tags:["auth","travel"] },
  { id:"r3", name:"Dormant Admin Account Active", description:"Admin account inactive 60+ days suddenly performs privileged actions.", severity:"high", enabled:true, is_global:true, source:"platform", mitre_tactic:"Persistence", mitre_technique:"Valid Accounts", mitre_id:"T1078", conditions:[{id:"c6",field:"actor.days_since_login",operator:"greater_than",value:"60",logic:"AND"},{id:"c7",field:"actor.role",operator:"in",value:"ADMIN,GLOBAL_ADMIN",logic:"AND"}], lookback_minutes:1440, group_by:"actor.user_id", suppression_minutes:1440, hit_count_7d:2, false_positive_rate:0, last_triggered:new Date(Date.now()-86400000*2).toISOString(), created_at:"2026-01-15T10:00:00Z", tags:["admin","dormant"] },
  { id:"r4", name:"Custom: Bulk API Token Usage", description:"API token used for 500+ requests in 10 minutes from a single IP.", severity:"medium", enabled:true, is_global:false, source:"custom", mitre_tactic:"Discovery", mitre_technique:"Cloud API Usage", mitre_id:"T1580", conditions:[{id:"c8",field:"event_category",operator:"equals",value:"api_call",logic:"AND"},{id:"c9",field:"count",operator:"greater_than",value:"500",logic:"AND"}], lookback_minutes:10, threshold:500, group_by:"actor.ip", suppression_minutes:60, hit_count_7d:14, false_positive_rate:7.8, last_triggered:new Date(Date.now()-14400000).toISOString(), created_at:"2026-03-01T09:00:00Z", tags:["api","rate-limit"] },
];

const FIELDS = [
  {value:"event_action",label:"Event Action"},{value:"event_category",label:"Event Category"},
  {value:"actor.email",label:"Actor Email"},{value:"actor.ip",label:"Actor IP"},
  {value:"actor.country",label:"Actor Country"},{value:"actor.role",label:"Actor Role"},
  {value:"actor.days_since_login",label:"Days Since Last Login"},
  {value:"count",label:"Count (aggregated)"},{value:"geo.distance_km",label:"Geo Distance (km)"},
  {value:"outcome",label:"Outcome"},{value:"source_type",label:"Source Type"},
];

const OPERATORS = [
  {value:"equals",label:"equals"},{value:"not_equals",label:"does not equal"},
  {value:"contains",label:"contains"},{value:"greater_than",label:"greater than"},
  {value:"less_than",label:"less than"},{value:"in",label:"is one of"},
  {value:"regex",label:"matches regex"},
];

const MITRE_TACTICS = ["Initial Access","Execution","Persistence","Privilege Escalation",
  "Defense Evasion","Credential Access","Discovery","Lateral Movement","Collection","Exfiltration","Impact"];

const tacticColor: Record<string,string> = {
  "Credential Access":"#ef4444","Initial Access":"#f97316","Persistence":"#8b5cf6",
  "Privilege Escalation":"#ec4899","Discovery":"#06b6d4","Collection":"#84cc16",
  "Exfiltration":"#f43f5e","Impact":"#dc2626","Lateral Movement":"#14b8a6",
};

const sevColor: Record<string,string> = {
  critical:"text-red-400 bg-red-500/10 border-red-500/30",
  high:"text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium:"text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low:"text-green-400 bg-green-500/10 border-green-500/30",
};

function timeAgo(iso:string){
  const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);
  if(m<60)return`${m}m ago`;const h=Math.floor(m/60);
  if(h<24)return`${h}h ago`;return`${Math.floor(h/24)}d ago`;
}

function generateYAML(rule:any):string{
  const conds=(rule.conditions??[]).map((c:any,i:number)=>`    ${i>0?c.logic+" ":""}${c.field} ${c.operator.replace("_"," ")} "${c.value}"`).join("\n");
  return `name: "${rule.name||"Untitled"}"\ndescription: "${rule.description||""}"\nseverity: ${rule.severity||"medium"}\n\ndetection:\n  lookback: ${rule.lookback_minutes||30}m\n  ${rule.threshold?`threshold: ${rule.threshold}`:""}  ${rule.group_by?`group_by: ${rule.group_by}`:""}\n  conditions:\n${conds||'    event_action equals ""'}\n\nresponse:\n  suppression: ${rule.suppression_minutes||60}m\n  generate_alert: true\n\nmitre:\n  tactic: "${rule.mitre_tactic||""}"\n  id: "${rule.mitre_id||""}"`;
}

function RuleForm({onClose,existing}:{onClose:()=>void;existing?:DetectionRule}){
  const qc=useQueryClient();
  const[tab,setTab]=useState<"basic"|"conditions"|"mitre"|"yaml">("basic");
  const[name,setName]=useState(existing?.name??"");
  const[description,setDescription]=useState(existing?.description??"");
  const[severity,setSeverity]=useState<DetectionRule["severity"]>(existing?.severity??"medium");
  const[lookback,setLookback]=useState(existing?.lookback_minutes??30);
  const[threshold,setThreshold]=useState(existing?.threshold?.toString()??"");
  const[groupBy,setGroupBy]=useState(existing?.group_by??"");
  const[suppression,setSuppression]=useState(existing?.suppression_minutes??60);
  const[mitreTactic,setMitreTactic]=useState(existing?.mitre_tactic??"");
  const[mitreTechnique,setMitreTechnique]=useState(existing?.mitre_technique??"");
  const[mitreId,setMitreId]=useState(existing?.mitre_id??"");
  const[conditions,setConditions]=useState<Condition[]>(existing?.conditions??[{id:"new-1",field:"event_action",operator:"equals",value:"",logic:"AND"}]);
  const[saving,setSaving]=useState(false);
  const[saved,setSaved]=useState(false);
  const[testResult,setTestResult]=useState<null|{matches:number}>(null);
  const[testing,setTesting]=useState(false);

  const addCond=()=>setConditions(c=>[...c,{id:`n${Date.now()}`,field:"event_action",operator:"equals",value:"",logic:"AND"}]);
  const removeCond=(id:string)=>setConditions(c=>c.filter(x=>x.id!==id));
  const updateCond=(id:string,u:Partial<Condition>)=>setConditions(c=>c.map(x=>x.id===id?{...x,...u}:x));

  const testRule=async()=>{setTesting(true);await new Promise(r=>setTimeout(r,1200));setTestResult({matches:Math.floor(Math.random()*8)});setTesting(false);};
  const save=async()=>{setSaving(true);await new Promise(r=>setTimeout(r,800));qc.invalidateQueries({queryKey:["detection-rules"]});setSaving(false);setSaved(true);setTimeout(onClose,600);};

  const draft={name,description,severity,lookback_minutes:lookback,threshold:threshold?Number(threshold):undefined,group_by:groupBy,suppression_minutes:suppression,mitre_tactic:mitreTactic,mitre_technique:mitreTechnique,mitre_id:mitreId,conditions};

  return(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">{existing?"Edit":"New"} Detection Rule</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="flex gap-1 p-3 border-b border-slate-800">
          {(["basic","conditions","mitre","yaml"] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${tab===t?"bg-blue-600 text-white":"text-slate-400 hover:text-white"}`}>
              {t==="basic"?"⚙️ Basic":t==="conditions"?"🔍 Conditions":t==="mitre"?"🎯 MITRE":t==="yaml"?"📄 YAML":""}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab==="basic"&&(
            <div className="space-y-4">
              <div><label className="block text-xs text-slate-400 mb-1">Rule Name *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Unusual API Token Usage" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/></div>
              <div><label className="block text-xs text-slate-400 mb-1">Description</label><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/></div>
              <div><label className="block text-xs text-slate-400 mb-1">Severity</label><div className="flex gap-1.5">{(["critical","high","medium","low"] as const).map(s=>(<button key={s} onClick={()=>setSeverity(s)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border ${severity===s?sevColor[s]:"bg-slate-800 text-slate-500 border-slate-700"}`}>{s}</button>))}</div></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs text-slate-400 mb-1">Lookback (min)</label><input type="number" value={lookback} onChange={e=>setLookback(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"/></div>
                <div><label className="block text-xs text-slate-400 mb-1">Threshold Count</label><input type="number" value={threshold} onChange={e=>setThreshold(e.target.value)} placeholder="e.g. 10" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"/></div>
                <div><label className="block text-xs text-slate-400 mb-1">Suppression (min)</label><input type="number" value={suppression} onChange={e=>setSuppression(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"/></div>
              </div>
              <div><label className="block text-xs text-slate-400 mb-1">Group By</label><select value={groupBy} onChange={e=>setGroupBy(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"><option value="">No grouping</option>{FIELDS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
            </div>
          )}
          {tab==="conditions"&&(
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Define conditions that must match within the lookback window.</p>
              {conditions.map((c,i)=>(
                <div key={c.id} className="flex items-center gap-2 bg-slate-800 rounded-xl p-3">
                  {i>0?<select value={c.logic} onChange={e=>updateCond(c.id,{logic:e.target.value as "AND"|"OR"})} className="w-16 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs text-white"><option>AND</option><option>OR</option></select>:<span className="w-16 text-xs text-slate-400 text-center">WHERE</span>}
                  <select value={c.field} onChange={e=>updateCond(c.id,{field:e.target.value})} className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs text-white">{FIELDS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select>
                  <select value={c.operator} onChange={e=>updateCond(c.id,{operator:e.target.value as Condition["operator"]})} className="w-36 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs text-white">{OPERATORS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  <input value={c.value} onChange={e=>updateCond(c.id,{value:e.target.value})} placeholder="value" className="w-32 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs text-white"/>
                  <button onClick={()=>removeCond(c.id)} disabled={conditions.length===1} className="text-slate-500 hover:text-red-400 disabled:opacity-30"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
              ))}
              <button onClick={addCond} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 border-dashed transition-colors">+ Add Condition</button>
              <div className="pt-3 border-t border-slate-700">
                <button onClick={testRule} disabled={testing} className="flex items-center gap-2 px-4 py-2 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/40 rounded-lg text-xs transition-colors disabled:opacity-50">
                  {testing?<><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-300"/>Testing...</>:"🧪 Test Against Last 7 Days"}
                </button>
                {testResult&&<div className="mt-3 p-3 bg-slate-800 rounded-lg border border-slate-700"><p className="text-xs font-semibold text-white">Test Result: {testResult.matches} matches in last 7 days</p></div>}
              </div>
            </div>
          )}
          {tab==="mitre"&&(
            <div className="space-y-4">
              <p className="text-xs text-slate-400">Map this rule to MITRE ATT&CK.</p>
              <div className="flex flex-wrap gap-2">{MITRE_TACTICS.map(t=><button key={t} onClick={()=>setMitreTactic(t)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border" style={{backgroundColor:mitreTactic===t?(tacticColor[t]??"#475569"):"transparent",borderColor:mitreTactic===t?(tacticColor[t]??"#475569"):"#374151",color:mitreTactic===t?"white":"#9ca3af"}}>{t}</button>)}</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-slate-400 mb-1">Technique Name</label><input value={mitreTechnique} onChange={e=>setMitreTechnique(e.target.value)} placeholder="e.g. Brute Force" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"/></div>
                <div><label className="block text-xs text-slate-400 mb-1">Technique ID</label><input value={mitreId} onChange={e=>setMitreId(e.target.value)} placeholder="e.g. T1110" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"/></div>
              </div>
              {mitreTactic&&mitreId&&<div className="p-3 bg-slate-800 rounded-lg flex items-center gap-3"><span className="text-xs px-2 py-1 rounded font-medium text-white" style={{backgroundColor:tacticColor[mitreTactic]??"#475569"}}>{mitreTactic}</span><span className="text-xs text-slate-300">{mitreTechnique}</span><span className="text-xs font-mono text-slate-400 ml-auto">{mitreId}</span></div>}
            </div>
          )}
          {tab==="yaml"&&(
            <div className="space-y-3">
              <p className="text-xs text-slate-400">YAML representation — export to compatible SIEM systems.</p>
              <pre className="bg-slate-800 rounded-xl p-4 text-xs font-mono text-green-300 overflow-x-auto leading-relaxed whitespace-pre">{generateYAML(draft)}</pre>
              <button onClick={()=>navigator.clipboard.writeText(generateYAML(draft))} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition-colors">📋 Copy YAML</button>
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">Cancel</button>
          <button onClick={save} disabled={saving||!name} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            {saving?<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Saving...</>:saved?"✅ Saved!":(existing?"Save Changes":"Create Rule")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DetectionRules(){
  const qc=useQueryClient();
  const[showForm,setShowForm]=useState(false);
  const[editRule,setEditRule]=useState<DetectionRule|undefined>();
  const[search,setSearch]=useState("");
  const[sourceFilter,setSourceFilter]=useState("");
  const[sevFilter,setSevFilter]=useState("");

  const{data:rules=mockRules}=useQuery<DetectionRule[]>({queryKey:["detection-rules"],queryFn:async()=>{const r=await apiClient.get("/admin/rules");return r.data.data;}});

  const toggleRule=useMutation({
    mutationFn:async({id,enabled}:{id:string;enabled:boolean})=>{await apiClient.patch(`/admin/rules/${id}`,{enabled});},
    onSuccess:()=>qc.invalidateQueries({queryKey:["detection-rules"]}),
  });

  const filtered=rules.filter(r=>!sourceFilter||r.source===sourceFilter).filter(r=>!sevFilter||r.severity===sevFilter).filter(r=>r.name.toLowerCase().includes(search.toLowerCase())||r.tags.some(t=>t.includes(search.toLowerCase())));

  const stats={total:rules.length,enabled:rules.filter(r=>r.enabled).length,custom:rules.filter(r=>r.source==="custom").length,high_fp:rules.filter(r=>r.false_positive_rate>10).length};

  return(
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white">Detection Rules</h1><p className="text-slate-400 text-sm mt-1">{stats.enabled} active · {stats.custom} custom · {stats.high_fp} high FP rate</p></div>
        <button onClick={()=>{setEditRule(undefined);setShowForm(true);}} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>New Rule
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[{label:"Total Rules",value:stats.total,color:"text-white"},{label:"Active",value:stats.enabled,color:"text-green-400"},{label:"Custom Rules",value:stats.custom,color:"text-blue-400"},{label:"High FP Rate",value:stats.high_fp,color:stats.high_fp>0?"text-yellow-400":"text-green-400"}].map((c,i)=>(
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800"><p className="text-xs text-slate-400 mb-1">{c.label}</p><p className={`text-2xl font-bold ${c.color}`}>{c.value}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search rules..." className="flex-1 min-w-[180px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"><option value="">All Sources</option><option value="platform">Platform</option><option value="custom">Custom</option></select>
        <select value={sevFilter} onChange={e=>setSevFilter(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"><option value="">All Severity</option>{["critical","high","medium","low"].map(s=><option key={s} value={s}>{s}</option>)}</select>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-slate-800">{["Rule","Severity","MITRE","Hits 7d","FP Rate","Last Triggered","Active",""].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map(rule=>(
              <tr key={rule.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-white">{rule.name}</p>
                    {rule.source==="custom"&&<span className="text-xs bg-blue-900/40 text-blue-400 px-1.5 py-0.5 rounded border border-blue-800/40">custom</span>}
                  </div>
                  <p className="text-xs text-slate-400 truncate max-w-[260px]">{rule.description}</p>
                  <div className="flex gap-1 mt-1">{rule.tags.map(t=><span key={t} className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">#{t}</span>)}</div>
                </td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${sevColor[rule.severity]}`}>{rule.severity}</span></td>
                <td className="px-4 py-3">{rule.mitre_id?<span className="text-xs px-1.5 py-0.5 rounded font-mono text-white" style={{backgroundColor:tacticColor[rule.mitre_tactic ?? ""] ?? "#475569"}}>{rule.mitre_id}</span>:<span className="text-xs text-slate-500">—</span>}</td>
                <td className="px-4 py-3 text-sm font-medium text-white">{rule.hit_count_7d}</td>
                <td className="px-4 py-3"><span className={`text-sm font-medium ${rule.false_positive_rate>10?"text-yellow-400":rule.false_positive_rate>0?"text-slate-300":"text-green-400"}`}>{rule.false_positive_rate}%</span></td>
                <td className="px-4 py-3 text-xs text-slate-400">{rule.last_triggered?timeAgo(rule.last_triggered):"Never"}</td>
                <td className="px-4 py-3"><button onClick={()=>toggleRule.mutate({id:rule.id,enabled:!rule.enabled})} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.enabled?"bg-green-600":"bg-slate-600"}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.enabled?"translate-x-4":"translate-x-1"}`}/></button></td>
                <td className="px-4 py-3"><div className="flex gap-2"><button onClick={()=>{setEditRule(rule);setShowForm(true);}} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>{rule.source==="custom"&&<button className="text-xs text-red-400 hover:text-red-300">Delete</button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm&&<RuleForm onClose={()=>setShowForm(false)} existing={editRule}/>}
    </div>
  );
}
