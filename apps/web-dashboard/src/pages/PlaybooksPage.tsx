import { useState } from 'react'
import { clsx } from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Play, Plus, CheckCircle2, XCircle, Clock,
  AlertTriangle, Shield, Zap, Mail, MessageSquare,
  Ticket, Users, FileText, ChevronDown, ChevronUp,
} from 'lucide-react'

const H = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

const ACTION_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  document_only:               { label: 'Document Only',       icon: FileText,      color: 'text-gray-400' },
  disable_user_m365:           { label: 'Disable M365 User',   icon: Users,         color: 'text-red-400' },
  disable_user_google:         { label: 'Disable Google User', icon: Users,         color: 'text-red-400' },
  block_ip_cloudflare:         { label: 'Block IP (CF WAF)',   icon: Shield,        color: 'text-orange-400' },
  block_ip_aws_waf:            { label: 'Block IP (AWS WAF)',  icon: Shield,        color: 'text-orange-400' },
  create_jira_ticket:          { label: 'Create Jira Ticket',  icon: Ticket,        color: 'text-blue-400' },
  create_servicenow_incident:  { label: 'ServiceNow Incident', icon: Ticket,        color: 'text-purple-400' },
  notify_pagerduty:            { label: 'Page On-Call (PD)',   icon: Zap,           color: 'text-yellow-400' },
  notify_email:                { label: 'Send Email',          icon: Mail,          color: 'text-blue-400' },
  notify_slack:                { label: 'Slack Alert',         icon: MessageSquare, color: 'text-green-400' },
  require_mfa_reauthentication:{ label: 'Force MFA Re-auth',   icon: Shield,        color: 'text-amber-400' },
}

const EXEC_STATUS: Record<string, string> = {
  completed:       'bg-green-500/10 text-green-400',
  running:         'bg-blue-500/10 text-blue-400 animate-pulse',
  pending_approval:'bg-yellow-500/10 text-yellow-400',
  failed:          'bg-red-500/10 text-red-400',
  cancelled:       'bg-gray-700 text-gray-400',
}

const TEMPLATES = [
  { id: 't1', name: 'Account Takeover Response',  severity: 'critical',
    actions: ['notify_pagerduty','disable_user_m365','require_mfa_reauthentication'],
    desc: 'Auto-page on-call, disable account, force MFA re-auth.', star: true },
  { id: 't2', name: 'IP Threat Containment',       severity: 'high',
    actions: ['block_ip_cloudflare','block_ip_aws_waf','create_jira_ticket'],
    desc: 'Block IP across WAF layers, create tracking ticket.', star: false },
  { id: 't3', name: 'Incident Documentation',      severity: 'medium',
    actions: ['create_servicenow_incident','notify_slack','document_only'],
    desc: 'Open ServiceNow ticket, notify team, document.', star: false },
  { id: 't4', name: 'P1 Escalation Chain',         severity: 'critical',
    actions: ['notify_pagerduty','notify_email','create_jira_ticket'],
    desc: 'Full escalation: page on-call, email leadership, Jira P1.', star: false },
]

function ActionPill({ type }: { type: string }) {
  const meta = ACTION_META[type]
  if (!meta) return <span className="text-xs font-mono text-gray-600">{type}</span>
  const Icon = meta.icon
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-gray-800', meta.color)}>
      <Icon className="h-3 w-3 flex-shrink-0" />
      {meta.label}
    </span>
  )
}

function ExecRow({ exec }: { exec: any }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  async function approve() {
    await fetch(`/api/v1/playbook-executions/${exec.id}/approve`, { method: 'POST', headers: H() })
    qc.invalidateQueries({ queryKey: ['playbook-executions'] })
  }

  return (
    <div className="border-b border-gray-800/50 last:border-0">
      <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/20 transition-colors">
        <span className={clsx('flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium capitalize', EXEC_STATUS[exec.status] ?? 'bg-gray-700 text-gray-400')}>
          {exec.status?.replace(/_/g, ' ')}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-300 truncate font-mono">{exec.playbookId?.slice(0,12)}…</p>
          <p className="text-xs text-gray-600">Alert {exec.alertId?.slice(0,8)}… · {exec.triggeredBy === 'auto' ? 'Auto-triggered' : `By ${exec.triggeredBy?.slice(0,8)}…`}</p>
        </div>
        <p className="text-xs text-gray-500 flex-shrink-0">{new Date(exec.createdAt).toLocaleString()}</p>
        {exec.status === 'pending_approval' && (
          <Button variant="primary" size="sm" onClick={approve}>Approve</Button>
        )}
        <button onClick={() => setOpen(v => !v)} className="text-gray-600 hover:text-gray-400">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {open && exec.actionsCompleted?.length > 0 && (
        <div className="px-5 pb-3 space-y-1.5 bg-gray-900/40">
          {exec.actionsCompleted.map((a: any, i: number) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              {a.status === 'success'
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                : a.status === 'pending_approval'
                ? <Clock className="h-3.5 w-3.5 text-yellow-400" />
                : <XCircle className="h-3.5 w-3.5 text-red-400" />}
              <ActionPill type={a.type} />
              <span className="text-gray-500 truncate">{a.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlaybooksPage() {
  const [tab, setTab]   = useState<'playbooks'|'executions'|'templates'>('playbooks')
  const [showNew, setNew] = useState(false)
  const qc = useQueryClient()

  const { data: pbData, isLoading: pbLoad }     = useQuery({ queryKey: ['playbooks'], queryFn: () => fetch('/api/v1/playbooks', { headers: H() }).then(r => r.json()), staleTime: 60_000 })
  const { data: exData, isLoading: exLoad }     = useQuery({ queryKey: ['playbook-executions'], queryFn: () => fetch('/api/v1/playbook-executions', { headers: H() }).then(r => r.json()), staleTime: 30_000, refetchInterval: 30_000, enabled: tab === 'executions' })

  const pbs  = pbData?.data ?? []
  const exes = exData?.data ?? []
  const pendingApproval = exes.filter((e: any) => e.status === 'pending_approval').length

  return (
    <AppShell title="Automated Playbooks"
      actions={
        <div className="flex items-center gap-2">
          {pendingApproval > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
              <AlertTriangle className="h-3.5 w-3.5" />
              {pendingApproval} pending approval
            </div>
          )}
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setNew(true)}>
            New Playbook
          </Button>
        </div>
      }
    >
      <PageContent>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active Playbooks', value: pbs.filter((p: any) => p.enabled).length, icon: Play, color: 'text-blue-400' },
            { label: 'Executions',       value: exes.length, icon: Zap, color: 'text-green-400' },
            { label: 'Pending Approval', value: pendingApproval, icon: Clock, color: pendingApproval > 0 ? 'text-yellow-400' : 'text-gray-500' },
            { label: 'Failed',           value: exes.filter((e: any) => e.status === 'failed').length, icon: XCircle, color: 'text-gray-500' },
          ].map(k => (
            <Card key={k.label} className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-800 p-2.5 flex-shrink-0">
                <k.icon className={clsx('h-4 w-4', k.color)} />
              </div>
              <div>
                <p className={clsx('text-2xl font-bold tabular-nums', k.color)}>{k.value}</p>
                <p className="text-xs text-gray-500">{k.label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-800 mb-5">
          {[
            { id: 'playbooks',  label: 'My Playbooks',       count: null },
            { id: 'executions', label: 'Execution Log',      count: pendingApproval },
            { id: 'templates',  label: 'Platform Templates', count: null },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300')}>
              {t.label}
              {(t.count ?? 0) > 0 && <span className="px-1.5 rounded-full text-xs font-bold bg-yellow-500 text-black">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* My Playbooks */}
        {tab === 'playbooks' && (
          pbLoad ? <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          : pbs.length === 0
          ? <EmptyState icon={Play} title="No playbooks yet"
              description="Create automated response playbooks to contain threats faster."
              action={<Button variant="primary" icon={Plus} onClick={() => setNew(true)}>Create Playbook</Button>} />
          : <div className="space-y-3">
              {pbs.map((pb: any) => (
                <Card key={pb.id} className="hover:border-gray-700 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-sm font-semibold text-gray-200">{pb.name}</h3>
                        <span className={clsx('px-2 py-0.5 rounded text-xs font-medium',
                          pb.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-500')}>
                          {pb.enabled ? '● Active' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">{pb.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {pb.actions?.map((a: any, i: number) => <ActionPill key={i} type={a.type} />)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500 mb-2">Ran <span className="text-gray-300 font-bold">{pb.executionCount ?? 0}</span>×</p>
                      {pb.triggerSeverities?.length > 0 && (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {pb.triggerSeverities.map((s: string) => (
                            <Badge key={s} variant={s as any} size="xs">{s}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
        )}

        {/* Execution Log */}
        {tab === 'executions' && (
          <Card padding="none">
            <div className="grid px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-800/40 border-b border-gray-800"
              style={{ gridTemplateColumns: '150px 1fr auto auto' }}>
              <span>Status</span>
              <span>Execution</span>
              <span>Time</span>
              <span />
            </div>
            {exLoad
              ? <div className="divide-y divide-gray-800">{[...Array(5)].map((_, i) => <div key={i} className="flex gap-4 p-4"><Skeleton className="h-5 w-24" /><Skeleton className="h-5 flex-1" /></div>)}</div>
              : exes.length === 0
              ? <EmptyState icon={Zap} title="No executions yet" description="Executions appear here when playbooks are triggered." />
              : exes.map((e: any) => <ExecRow key={e.id} exec={e} />)}
          </Card>
        )}

        {/* Platform Templates */}
        {tab === 'templates' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TEMPLATES.map(t => (
              <Card key={t.id} className={clsx('hover:border-gray-700 transition-colors', t.star && 'border-blue-500/20 bg-blue-500/3')}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    {t.star && <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white mb-2">★ Recommended</span>}
                    <h3 className="text-sm font-semibold text-gray-200">{t.name}</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.desc}</p>
                  </div>
                  <Badge variant={t.severity as any} size="xs">{t.severity}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {t.actions.map(a => <ActionPill key={a} type={a} />)}
                </div>
                <Button variant="outline" size="sm" icon={Plus} onClick={() => setNew(true)}>
                  Use Template
                </Button>
              </Card>
            ))}
          </div>
        )}

        {/* Create modal */}
        {showNew && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setNew(false)} />
            <Card className="relative w-full max-w-lg mx-4 z-10 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold text-gray-100">Create Playbook</h2>
                <button onClick={() => setNew(false)} className="text-gray-500 hover:text-gray-300 text-lg">×</button>
              </div>
              <div className="space-y-4">
                {[['Name','e.g. Account Takeover Response'],['Description','What this playbook does']].map(([l,ph]) => (
                  <div key={l}>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{l}</label>
                    <input type="text" placeholder={ph}
                      className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Trigger Severity</label>
                  <div className="mt-2 flex gap-2">
                    {['critical','high','medium','low'].map(s => (
                      <button key={s} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:border-blue-500 hover:text-blue-400 capitalize transition-colors">{s}</button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-600 bg-gray-800/60 rounded-lg p-3">
                  Actions can be added after creation. Start with a document_only action for testing, then add automated actions.
                </p>
              </div>
              <div className="flex gap-3 justify-end mt-5">
                <Button variant="ghost" onClick={() => setNew(false)}>Cancel</Button>
                <Button variant="primary" icon={Play} onClick={() => setNew(false)}>Create Playbook</Button>
              </div>
            </Card>
          </div>
        )}

      </PageContent>
    </AppShell>
  )
}
