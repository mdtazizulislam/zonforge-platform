import { useState } from 'react'
import { clsx } from 'clsx'
import { useConnectors, useCreateConnector } from '@/hooks/queries'
import { ApiError } from '@/lib/api'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Activity, Plus, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Clock, Loader2, Settings, Trash2,
  Wifi, WifiOff, Database, ChevronRight, ExternalLink,
} from 'lucide-react'

// ─────────────────────────────────────────────
// CONNECTOR TYPE METADATA
// ─────────────────────────────────────────────

const CONNECTOR_META: Record<string, {
  label: string; icon: string; description: string; category: string
}> = {
  m365_entra:             { label: 'Microsoft 365 / Entra ID', icon: '🔷', description: 'Sign-in logs, audit logs, identity protection', category: 'identity' },
  aws_cloudtrail:         { label: 'AWS CloudTrail',           icon: '🟠', description: 'API calls, console logins, IAM events', category: 'cloud' },
  google_workspace:       { label: 'Google Workspace',         icon: '🟡', description: 'Login, admin, drive, token events', category: 'identity' },
  azure_activity:         { label: 'Azure Activity Log',       icon: '🔵', description: 'Resource management, policy changes', category: 'cloud' },
  gcp_audit:              { label: 'GCP Audit Logs',           icon: '🟢', description: 'Admin activity, data access logs', category: 'cloud' },
  cloudflare_waf:         { label: 'Cloudflare WAF',           icon: '🟤', description: 'Web threat events, blocked requests', category: 'network' },
  aws_waf:                { label: 'AWS WAF',                  icon: '🟠', description: 'Web ACL rule matches, blocked IPs', category: 'network' },
  generic_webhook:        { label: 'Generic Webhook',          icon: '⚙️', description: 'Custom JSON events via webhook', category: 'custom' },
  generic_syslog:         { label: 'Syslog',                   icon: '📋', description: 'Standard syslog over TCP/UDP', category: 'custom' },
  vulnerability_scan_upload: { label: 'Vulnerability Scanner', icon: '🔍', description: 'Upload scan results (Qualys, Tenable, etc.)', category: 'vulnerability' },
}

const CATEGORY_COLORS: Record<string, string> = {
  identity:      'text-blue-400  bg-blue-500/10',
  cloud:         'text-orange-400 bg-orange-500/10',
  network:       'text-purple-400 bg-purple-500/10',
  vulnerability: 'text-red-400   bg-red-500/10',
  custom:        'text-gray-400  bg-gray-700',
}

// ─────────────────────────────────────────────
// CONNECTOR CARD
// ─────────────────────────────────────────────

function ConnectorCard({
  connector, onValidate, onToggle,
}: {
  connector: any
  onValidate: (id: string) => void
  onToggle: (id: string, status: string) => void
}) {
  const meta = CONNECTOR_META[connector.type] ?? {
    label: connector.type, icon: '⚙️',
    description: '', category: 'custom',
  }

  const lagMinutes = connector.lagMinutes

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors
                    hover:border-gray-700">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{meta.icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-gray-200">{connector.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{meta.label}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Status badge */}
          <div className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            connector.status === 'active' && connector.isHealthy
              ? 'bg-green-500/10 text-green-400'
              : connector.status === 'active' && !connector.isHealthy
              ? 'bg-yellow-500/10 text-yellow-400'
              : connector.status === 'error'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-gray-700 text-gray-500',
          )}>
            <div className={clsx('h-1.5 w-1.5 rounded-full', {
              'bg-green-400':  connector.status === 'active' && connector.isHealthy,
              'bg-yellow-400 animate-pulse': connector.status === 'active' && !connector.isHealthy,
              'bg-red-400':    connector.status === 'error',
              'bg-gray-600':   !['active', 'error'].includes(connector.status),
            })} />
            {connector.status === 'active' && connector.isHealthy ? 'Healthy'
             : connector.status === 'active' ? 'Lagging'
             : connector.status === 'error' ? 'Error'
             : connector.status === 'paused' ? 'Paused'
             : 'Pending'}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-gray-800/40 p-3">
          <p className="text-xs text-gray-600 mb-1">Last Event</p>
          <p className="text-sm font-medium text-gray-300">
            {connector.lastEventAt
              ? new Date(connector.lastEventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-gray-800/40 p-3">
          <p className="text-xs text-gray-600 mb-1">Lag</p>
          <p className={clsx('text-sm font-medium',
            lagMinutes == null ? 'text-gray-500'
            : lagMinutes > 60   ? 'text-red-400'
            : lagMinutes > 30   ? 'text-yellow-400'
            : 'text-green-400')}>
            {lagMinutes != null ? `${lagMinutes}m` : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-gray-800/40 p-3">
          <p className="text-xs text-gray-600 mb-1">Poll Interval</p>
          <p className="text-sm font-medium text-gray-300">
            {connector.pollIntervalMinutes}m
          </p>
        </div>
        <div className="rounded-lg bg-gray-800/40 p-3">
          <p className="text-xs text-gray-600 mb-1">Errors</p>
          <p className={clsx('text-sm font-medium',
            connector.consecutiveErrors > 0 ? 'text-red-400' : 'text-gray-300')}>
            {connector.consecutiveErrors ?? 0}
          </p>
        </div>
      </div>

      {/* Error message */}
      {connector.lastErrorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/8 border border-red-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 leading-relaxed line-clamp-2">
              {connector.lastErrorMessage}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onValidate(connector.id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs
                     font-medium text-gray-400 border border-gray-700 hover:text-gray-200
                     hover:border-gray-600 transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Validate
        </button>
        <button
          onClick={() => onToggle(connector.id, connector.status)}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium',
            'border transition-colors',
            connector.status === 'active'
              ? 'text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10'
              : 'text-green-400 border-green-500/20 hover:bg-green-500/10',
          )}
        >
          {connector.status === 'active' ? 'Pause' : 'Resume'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ADD CONNECTOR MODAL
// ─────────────────────────────────────────────

function AddConnectorModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const { mutate: createConnector, isPending } = useCreateConnector()

  const grouped: Record<string, [string, typeof CONNECTOR_META[string]][]> = {}
  for (const [key, meta] of Object.entries(CONNECTOR_META)) {
    if (!grouped[meta.category]) grouped[meta.category] = []
    grouped[meta.category]!.push([key, meta])
  }

  function handleCreate() {
    if (!selected || !name.trim()) return
    createConnector(
      { name: name.trim(), type: selected, config: {} },
      {
        onSuccess: onClose,
        onError: (err) => {
          const apiErr = err as ApiError
          if (apiErr?.code === 'UPGRADE_REQUIRED') {
            setUpgradeMessage('Upgrade required to continue adding connectors for your current plan.')
          }
        },
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-gray-900 rounded-2xl border border-gray-700
                      shadow-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-bold text-gray-100">Add Data Connector</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {upgradeMessage && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-300">Upgrade required to continue</p>
                  <p className="text-xs text-yellow-200 mt-0.5">{upgradeMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Type selection */}
          <div>
            <p className="text-sm font-semibold text-gray-300 mb-3">Select Source Type</p>
            <div className="space-y-4">
              {Object.entries(grouped).map(([category, types]) => (
                <div key={category}>
                  <p className="text-xs text-gray-600 uppercase tracking-wider mb-2 capitalize">
                    {category}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {types.map(([key, meta]) => (
                      <button
                        key={key}
                        onClick={() => setSelected(key)}
                        className={clsx(
                          'flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                          selected === key
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-gray-800 hover:border-gray-700 bg-gray-800/40',
                        )}
                      >
                        <span className="text-xl flex-shrink-0">{meta.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">{meta.label}</p>
                          <p className="text-xs text-gray-600 truncate">{meta.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Name input */}
          {selected && (
            <div>
              <p className="text-sm font-semibold text-gray-300 mb-2">Connector Name</p>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={`e.g. Production ${CONNECTOR_META[selected]?.label}`}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-700 bg-gray-800
                           text-sm text-gray-200 placeholder-gray-600
                           focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selected || !name.trim() || isPending}
            className={clsx(
              'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-blue-600 text-white hover:bg-blue-500',
              (!selected || !name.trim()) && 'opacity-50 cursor-not-allowed',
            )}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Connector
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// CONNECTORS PAGE
// ─────────────────────────────────────────────

export default function ConnectorsPage() {
  const [showAdd, setShowAdd]     = useState(false)
  const [validating, setValid]    = useState<string | null>(null)

  const { data, isLoading, refetch, isFetching } = useConnectors()
  const connectors = data?.data ?? []

  const healthyCount = connectors.filter((c: any) => c.isHealthy).length
  const errorCount   = connectors.filter((c: any) => c.status === 'error').length

  async function handleValidate(id: string) {
    setValid(id)
    await fetch(`/api/v1/connectors/${id}/validate`)
    setValid(null)
  }

  function handleToggle(id: string, currentStatus: string) {
    fetch(`/api/v1/connectors/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        status: currentStatus === 'active' ? 'paused' : 'active',
      }),
    }).then(() => refetch())
  }

  return (
    <AppShell
      title="Data Connectors"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                       text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowAdd(true)}>
            Add Connector
          </Button>
        </div>
      }
    >
      <PageContent>

        {/* Health summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2.5">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-100">{healthyCount}</p>
                <p className="text-sm text-gray-500">Healthy</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className={clsx('rounded-lg p-2.5', errorCount > 0 ? 'bg-red-500/10' : 'bg-gray-800')}>
                <XCircle className={clsx('h-5 w-5', errorCount > 0 ? 'text-red-400' : 'text-gray-600')} />
              </div>
              <div>
                <p className={clsx('text-2xl font-bold', errorCount > 0 ? 'text-red-400' : 'text-gray-400')}>
                  {errorCount}
                </p>
                <p className="text-sm text-gray-500">Errors</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2.5">
                <Database className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-100">{connectors.length}</p>
                <p className="text-sm text-gray-500">Total</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Connector cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : connectors.length === 0 ? (
          <EmptyState
            icon={Wifi}
            title="No connectors configured"
            description="Add your first data source to start collecting security events."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setShowAdd(true)}>
                Add First Connector
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {connectors.map((c: any) => (
              <ConnectorCard
                key={c.id}
                connector={c}
                onValidate={handleValidate}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}

        {/* Documentation link */}
        <div className="mt-8 rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
          <div className="flex items-start gap-3">
            <ExternalLink className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-300">Connector Documentation</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Each connector type requires specific API permissions and credentials.
                Refer to the setup guide for your data source.
              </p>
            </div>
          </div>
        </div>

      </PageContent>

      {showAdd && <AddConnectorModal onClose={() => setShowAdd(false)} />}
    </AppShell>
  )
}
