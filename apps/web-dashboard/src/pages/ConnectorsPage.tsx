import { type ElementType, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/auth.store'
import { ApiError, type ConnectorSummary, type ConnectorType, type ValidationResult } from '@/lib/api'
import {
  useConnectors,
  useCreateConnector,
  useDeleteConnector,
  useTestConnector,
  useUpdateConnector,
} from '@/hooks/queries'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/shared/ui'
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Cloud,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react'

type ConnectorFormState = {
  name: string
  type: ConnectorType
  pollIntervalMinutes: string
  enabled: boolean
  settings: Record<string, string>
  secrets: Record<string, string>
}

type FormField = {
  key: string
  label: string
  placeholder: string
  description: string
  multiline?: boolean
  secret?: boolean
}

type ConnectorMeta = {
  label: string
  description: string
  accent: string
  icon: ElementType
  settings: FormField[]
  secrets: FormField[]
}

const MANAGE_ROLES = new Set(['owner', 'admin'])

const CONNECTOR_META: Record<ConnectorType, ConnectorMeta> = {
  aws: {
    label: 'AWS',
    description: 'CloudTrail-style cloud telemetry with IAM role and optional access key support.',
    accent: 'from-orange-500/20 via-amber-500/10 to-transparent',
    icon: Cloud,
    settings: [
      { key: 'accountId', label: 'Account ID', placeholder: '123456789012', description: 'Twelve-digit AWS account identifier.' },
      { key: 'roleArn', label: 'Role ARN', placeholder: 'arn:aws:iam::123456789012:role/ZonForgeCollector', description: 'Cross-account role trusted by ZonForge.' },
      { key: 'externalId', label: 'External ID', placeholder: 'optional-external-id', description: 'Optional external ID used for the trust policy.' },
      { key: 'regions', label: 'Regions', placeholder: 'us-east-1, us-west-2', description: 'Comma-separated list of collection regions.' },
    ],
    secrets: [
      { key: 'accessKeyId', label: 'Access Key ID', placeholder: 'AKIA...', description: 'Optional if role-based trust is enough.', secret: true },
      { key: 'secretAccessKey', label: 'Secret Access Key', placeholder: '••••••••', description: 'Stored encrypted at rest when provided.', secret: true },
    ],
  },
  microsoft_365: {
    label: 'Microsoft 365',
    description: 'Tenant-scoped identity and audit integration for Microsoft 365 and Entra workloads.',
    accent: 'from-sky-500/20 via-cyan-500/10 to-transparent',
    icon: Building2,
    settings: [
      { key: 'tenantId', label: 'Tenant ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', description: 'Microsoft tenant identifier.' },
      { key: 'clientId', label: 'Client ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', description: 'Application registration client ID.' },
      { key: 'defaultDomain', label: 'Default Domain', placeholder: 'contoso.onmicrosoft.com', description: 'Optional tenant domain for operator context.' },
    ],
    secrets: [
      { key: 'clientSecret', label: 'Client Secret', placeholder: '••••••••', description: 'Application secret used for token acquisition.', secret: true },
    ],
  },
  google_workspace: {
    label: 'Google Workspace',
    description: 'Workspace admin and identity telemetry using a delegated service account.',
    accent: 'from-emerald-500/20 via-lime-500/10 to-transparent',
    icon: Mail,
    settings: [
      { key: 'clientEmail', label: 'Service Account Email', placeholder: 'zonforge-collector@project.iam.gserviceaccount.com', description: 'Service account email used for domain-wide delegation.' },
      { key: 'delegatedAdminEmail', label: 'Delegated Admin Email', placeholder: 'security-admin@example.com', description: 'Workspace admin subject used for impersonation.' },
      { key: 'customerId', label: 'Customer ID', placeholder: 'C0123abc', description: 'Optional Google customer identifier.' },
    ],
    secrets: [
      { key: 'privateKey', label: 'Private Key', placeholder: '-----BEGIN PRIVATE KEY-----', description: 'Paste the PEM-formatted private key.', multiline: true, secret: true },
    ],
  },
}

function normalizeStatus(status: string): 'connected' | 'failed' | 'pending' | 'disabled' {
  if (status === 'connected' || status === 'failed' || status === 'disabled') {
    return status
  }
  return 'pending'
}

function getStatusBadgeVariant(status: string): 'success' | 'error' | 'warning' | 'neutral' {
  const normalized = normalizeStatus(status)
  if (normalized === 'connected') return 'success'
  if (normalized === 'failed') return 'error'
  if (normalized === 'disabled') return 'neutral'
  return 'warning'
}

function getStatusLabel(status: string) {
  const normalized = normalizeStatus(status)
  if (normalized === 'connected') return 'Connected'
  if (normalized === 'failed') return 'Failed'
  if (normalized === 'disabled') return 'Disabled'
  return 'Pending'
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function connectorSettingsValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function createInitialForm(type: ConnectorType, connector?: ConnectorSummary | null): ConnectorFormState {
  const settings = connector?.settings ?? {}
  const metadata = CONNECTOR_META[type]

  return {
    name: connector?.name ?? '',
    type,
    pollIntervalMinutes: String(connector?.pollIntervalMinutes ?? 15),
    enabled: connector ? connector.status !== 'disabled' : true,
    settings: Object.fromEntries(
      metadata.settings.map((field) => [field.key, connectorSettingsValue(settings[field.key])]),
    ),
    secrets: Object.fromEntries(metadata.secrets.map((field) => [field.key, ''])),
  }
}

function buildRequestBody(form: ConnectorFormState) {
  const settings = Object.fromEntries(
    Object.entries(form.settings)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value.length > 0),
  )
  const secrets = Object.fromEntries(
    Object.entries(form.secrets)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value.length > 0),
  )

  return {
    name: form.name.trim(),
    type: form.type,
    settings,
    secrets,
    enabled: form.enabled,
    pollIntervalMinutes: Math.max(5, Number(form.pollIntervalMinutes) || 15),
  }
}

function getConnectorHighlights(connector: ConnectorSummary) {
  const settings = connector.settings ?? {}

  if (connector.type === 'aws') {
    return [
      settings.accountId ? `Account ${String(settings.accountId)}` : null,
      settings.roleArn ? 'IAM role configured' : null,
      settings.regions ? `${String(settings.regions).split(',').length} region scope` : null,
    ].filter(Boolean)
  }

  if (connector.type === 'microsoft_365') {
    return [
      settings.tenantId ? 'Tenant registered' : null,
      settings.clientId ? 'Application ID present' : null,
      settings.defaultDomain ? String(settings.defaultDomain) : null,
    ].filter(Boolean)
  }

  return [
    settings.clientEmail ? 'Service account configured' : null,
    settings.delegatedAdminEmail ? String(settings.delegatedAdminEmail) : null,
    settings.customerId ? `Customer ${String(settings.customerId)}` : null,
  ].filter(Boolean)
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Request failed.'
}

function ConnectorModal({
  mode,
  connector,
  isPending,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  connector?: ConnectorSummary | null
  isPending: boolean
  onClose: () => void
  onSubmit: (form: ConnectorFormState) => Promise<void>
}) {
  const initialType = (connector?.type === 'aws' || connector?.type === 'microsoft_365' || connector?.type === 'google_workspace')
    ? connector.type
    : 'aws'
  const [form, setForm] = useState<ConnectorFormState>(() => createInitialForm(initialType, connector))
  const [error, setError] = useState<string | null>(null)

  const metadata = CONNECTOR_META[form.type]

  function setField(group: 'settings' | 'secrets', key: string, value: string) {
    setForm((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [key]: value,
      },
    }))
  }

  async function handleSubmit() {
    setError(null)
    try {
      await onSubmit(form)
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-gray-950/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">SERIAL 10</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-100">
              {mode === 'create' ? 'Add Connector' : `Edit ${connector?.name ?? 'Connector'}`}
            </h2>
          </div>
          <button aria-label="Close connector modal" onClick={onClose} className="text-gray-500 transition-colors hover:text-gray-300">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-y-auto lg:grid-cols-[1.05fr_1.2fr]">
          <div className="border-b border-gray-800 bg-gray-950/40 p-6 lg:border-b-0 lg:border-r">
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Connector Family</p>
            <div className="mt-4 space-y-3">
              {(Object.entries(CONNECTOR_META) as Array<[ConnectorType, ConnectorMeta]>).map(([type, item]) => {
                const Icon = item.icon
                const selected = form.type === type
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={mode === 'edit'}
                    onClick={() => setForm(createInitialForm(type, mode === 'edit' ? connector : null))}
                    className={clsx(
                      'w-full rounded-2xl border p-4 text-left transition-all',
                      selected ? 'border-blue-500 bg-blue-500/10' : 'border-gray-800 bg-gray-900/70 hover:border-gray-700',
                      mode === 'edit' && 'cursor-not-allowed opacity-80',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={clsx('rounded-xl p-2.5 text-white', type === 'aws' ? 'bg-orange-500/20' : type === 'microsoft_365' ? 'bg-sky-500/20' : 'bg-emerald-500/20')}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-100">{item.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">{item.description}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className={clsx('mt-6 rounded-2xl border border-gray-800 bg-gradient-to-br p-4', metadata.accent)}>
              <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Handling</p>
              <div className="mt-3 space-y-3 text-sm text-gray-300">
                <div className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4 text-gray-400" />
                  <p>Secrets are stored separately from connector settings and encrypted before they reach the database.</p>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-gray-400" />
                  <p>Owners and admins can create, edit, test, disable, and delete connector records.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Connector Name</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={`Production ${metadata.label}`}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 outline-none transition-colors focus:border-blue-500"
                />
              </label>

              <label>
                <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Poll Interval</span>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={form.pollIntervalMinutes}
                  onChange={(event) => setForm((current) => ({ ...current, pollIntervalMinutes: event.target.value }))}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 outline-none transition-colors focus:border-blue-500"
                />
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-200">Connector enabled</p>
                  <p className="text-xs text-gray-500">Disabled connectors remain stored but do not validate as connected.</p>
                </div>
              </label>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Settings</p>
                <div className="mt-3 space-y-4">
                  {metadata.settings.map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-200">{field.label}</span>
                      {field.multiline ? (
                        <textarea
                          rows={5}
                          value={form.settings[field.key] ?? ''}
                          onChange={(event) => setField('settings', field.key, event.target.value)}
                          placeholder={field.placeholder}
                          className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 outline-none transition-colors focus:border-blue-500"
                        />
                      ) : (
                        <input
                          value={form.settings[field.key] ?? ''}
                          onChange={(event) => setField('settings', field.key, event.target.value)}
                          placeholder={field.placeholder}
                          className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 outline-none transition-colors focus:border-blue-500"
                        />
                      )}
                      <span className="mt-1 block text-xs text-gray-500">{field.description}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Secrets</p>
                <div className="mt-3 space-y-4">
                  {metadata.secrets.map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-200">
                        {field.label}
                        <Lock className="h-3.5 w-3.5 text-gray-500" />
                      </span>
                      {field.multiline ? (
                        <textarea
                          rows={7}
                          value={form.secrets[field.key] ?? ''}
                          onChange={(event) => setField('secrets', field.key, event.target.value)}
                          placeholder={mode === 'edit' ? 'Leave blank to keep the encrypted value already stored.' : field.placeholder}
                          className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 outline-none transition-colors focus:border-blue-500"
                        />
                      ) : (
                        <input
                          type={field.secret ? 'password' : 'text'}
                          value={form.secrets[field.key] ?? ''}
                          onChange={(event) => setField('secrets', field.key, event.target.value)}
                          placeholder={mode === 'edit' ? 'Leave blank to keep the encrypted value already stored.' : field.placeholder}
                          className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 outline-none transition-colors focus:border-blue-500"
                        />
                      )}
                      <span className="mt-1 block text-xs text-gray-500">{field.description}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-800 pt-5">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" loading={isPending} onClick={handleSubmit} icon={mode === 'create' ? Plus : Pencil}>
                {mode === 'create' ? 'Create Connector' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConnectorCard({
  connector,
  canManage,
  validation,
  activeAction,
  onEdit,
  onTest,
  onToggle,
  onDelete,
}: {
  connector: ConnectorSummary
  canManage: boolean
  validation?: ValidationResult
  activeAction: string | null
  onEdit: (connector: ConnectorSummary) => void
  onTest: (connector: ConnectorSummary) => void
  onToggle: (connector: ConnectorSummary) => void
  onDelete: (connector: ConnectorSummary) => void
}) {
  const metadata = CONNECTOR_META[(connector.type === 'aws' || connector.type === 'microsoft_365' || connector.type === 'google_workspace')
    ? connector.type
    : 'aws']
  const Icon = metadata.icon
  const highlights = getConnectorHighlights(connector)
  const statusLabel = getStatusLabel(connector.status)
  const statusVariant = getStatusBadgeVariant(connector.status)

  return (
    <Card className="overflow-hidden border-gray-800/90 bg-gray-900/90" padding="none">
      <div className={clsx('border-b border-gray-800 bg-gradient-to-br p-5', metadata.accent)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-xl border border-white/10 bg-gray-950/50 p-2.5 text-gray-100">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-gray-100">{connector.name}</h3>
                <Badge variant={statusVariant} size="xs">{statusLabel}</Badge>
              </div>
              <p className="mt-1 text-sm text-gray-400">{connector.typeLabel}</p>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">{metadata.description}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full border border-gray-700 bg-gray-950/60 px-2.5 py-1 text-xs font-medium text-gray-300">
              {connector.pollIntervalMinutes}m cadence
            </span>
            <span className="text-xs text-gray-500">Updated {formatDateTime(connector.updatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Last Event</p>
            <p className="mt-2 text-sm font-medium text-gray-200">{formatDateTime(connector.lastEventAt)}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Last Validation</p>
            <p className="mt-2 text-sm font-medium text-gray-200">{formatDateTime(connector.lastValidatedAt)}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Lag</p>
            <p className={clsx('mt-2 text-sm font-medium', connector.lagMinutes == null ? 'text-gray-500' : connector.lagMinutes > 60 ? 'text-red-400' : connector.lagMinutes > 30 ? 'text-yellow-400' : 'text-gray-200')}>
              {connector.lagMinutes == null ? 'No data yet' : `${connector.lagMinutes} minutes`}
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Secrets</p>
            <p className="mt-2 text-sm font-medium text-gray-200">{connector.hasStoredSecrets ? 'Encrypted values stored' : 'None stored'}</p>
          </div>
        </div>

        {highlights.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {highlights.map((item) => (
              <span key={String(item)} className="rounded-full border border-gray-800 bg-gray-950/50 px-2.5 py-1 text-xs text-gray-400">
                {item}
              </span>
            ))}
          </div>
        )}

        {connector.lastErrorMessage && normalizeStatus(connector.status) === 'failed' && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-red-300">Failure Detail</p>
                <p className="mt-1 text-sm leading-relaxed text-red-200">{connector.lastErrorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {validation && (
          <div className="rounded-xl border border-gray-800 bg-gray-950/50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Latest Test Result</p>
                <p className="mt-1 text-sm text-gray-200">{validation.message}</p>
              </div>
              <Badge variant={validation.valid ? 'success' : 'error'} size="xs">
                {validation.valid ? 'Passed' : 'Failed'}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {validation.checks.map((check) => (
                <div key={check.key} className="flex items-start justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2 text-xs">
                  <div>
                    <p className="font-medium text-gray-200">{check.label}</p>
                    <p className="mt-0.5 text-gray-500">{check.detail}</p>
                  </div>
                  {check.passed ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-400" /> : <ShieldAlert className="h-4 w-4 flex-shrink-0 text-red-400" />}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={Activity} loading={activeAction === `test:${connector.id}`} onClick={() => onTest(connector)}>
            Test Connection
          </Button>
          {canManage && (
            <>
              <Button variant="outline" size="sm" icon={Pencil} loading={activeAction === `edit:${connector.id}`} onClick={() => onEdit(connector)}>
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={connector.status === 'disabled' ? ShieldCheck : ShieldAlert}
                loading={activeAction === `toggle:${connector.id}`}
                onClick={() => onToggle(connector)}
              >
                {connector.status === 'disabled' ? 'Enable' : 'Disable'}
              </Button>
              <Button variant="danger" size="sm" icon={Trash2} loading={activeAction === `delete:${connector.id}`} onClick={() => onDelete(connector)}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function ConnectorsPage() {
  const user = useAuthStore((state) => state.user)
  const role = (user?.membership?.role ?? user?.role ?? '').toLowerCase()
  const canManage = MANAGE_ROLES.has(role)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [selectedConnector, setSelectedConnector] = useState<ConnectorSummary | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string; upgradeHref?: string } | null>(null)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({})

  const { data, isLoading, isFetching, refetch } = useConnectors()
  const createConnector = useCreateConnector()
  const updateConnector = useUpdateConnector()
  const testConnector = useTestConnector()
  const deleteConnector = useDeleteConnector()
  const connectors = data?.data ?? []

  const counts = useMemo(() => ({
    connected: connectors.filter((connector) => normalizeStatus(connector.status) === 'connected').length,
    pending: connectors.filter((connector) => normalizeStatus(connector.status) === 'pending').length,
    failed: connectors.filter((connector) => normalizeStatus(connector.status) === 'failed').length,
    disabled: connectors.filter((connector) => normalizeStatus(connector.status) === 'disabled').length,
  }), [connectors])

  async function submitForm(form: ConnectorFormState) {
    const payload = buildRequestBody(form)
    if (!payload.name) {
      throw new Error('Connector name is required.')
    }

    try {
      if (modalMode === 'edit' && selectedConnector) {
        setActiveAction(`edit:${selectedConnector.id}`)
        await updateConnector.mutateAsync({ id: selectedConnector.id, updates: payload })
        setNotice({ tone: 'success', text: `Updated ${payload.name}.` })
      } else {
        setActiveAction('create')
        await createConnector.mutateAsync(payload)
        setNotice({ tone: 'success', text: `Created ${payload.name}.` })
      }
    } catch (error) {
      if (error instanceof ApiError && (error.code.toLowerCase() === 'upgrade_required' || error.code.toLowerCase() === 'plan_limit_exceeded')) {
        setNotice({
          tone: 'error',
          text: error.message,
          upgradeHref: '/app/billing',
        })
      }
      throw error
    } finally {
      setActiveAction(null)
    }

    setModalMode(null)
    setSelectedConnector(null)
  }

  async function handleTest(connector: ConnectorSummary) {
    setNotice(null)
    setActiveAction(`test:${connector.id}`)
    try {
      const result = await testConnector.mutateAsync(connector.id)
      setValidationResults((current) => ({ ...current, [connector.id]: result }))
      setNotice({ tone: result.valid ? 'success' : 'error', text: `${connector.name}: ${result.message}` })
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error) })
    } finally {
      setActiveAction(null)
    }
  }

  async function handleToggle(connector: ConnectorSummary) {
    setNotice(null)
    setActiveAction(`toggle:${connector.id}`)
    try {
      const enabling = connector.status === 'disabled'
      await updateConnector.mutateAsync({ id: connector.id, updates: { enabled: enabling } })
      setNotice({ tone: 'success', text: `${connector.name} ${enabling ? 'enabled' : 'disabled'}.` })
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error) })
    } finally {
      setActiveAction(null)
    }
  }

  async function handleDelete(connector: ConnectorSummary) {
    const confirmed = window.confirm(`Delete connector ${connector.name}? This removes the tenant-scoped configuration record.`)
    if (!confirmed) return

    setNotice(null)
    setActiveAction(`delete:${connector.id}`)
    try {
      await deleteConnector.mutateAsync(connector.id)
      setNotice({ tone: 'success', text: `${connector.name} deleted.` })
      setValidationResults((current) => {
        const next = { ...current }
        delete next[connector.id]
        return next
      })
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error) })
    } finally {
      setActiveAction(null)
    }
  }

  function openCreateModal() {
    setNotice(null)
    setSelectedConnector(null)
    setModalMode('create')
  }

  function openEditModal(connector: ConnectorSummary) {
    setNotice(null)
    setSelectedConnector(connector)
    setModalMode('edit')
  }

  return (
    <AppShell
      title="Connector Foundation"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} loading={isFetching} onClick={() => refetch()}>
            Refresh
          </Button>
          {canManage && (
            <Button variant="primary" size="sm" icon={Plus} onClick={openCreateModal}>
              Add Connector
            </Button>
          )}
        </div>
      }
    >
      <PageContent>
        <div className="mb-6 rounded-2xl border border-gray-800 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_35%),linear-gradient(180deg,rgba(17,24,39,0.96),rgba(10,15,25,0.96))] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.24em] text-blue-300/70">Tenant-scoped integrations</p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-100">Secure connector records for AWS, Microsoft 365, and Google Workspace.</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-400">
                Connector settings stay visible to operators, secrets stay encrypted, and validation results map directly to the SERIAL 10 health states: pending, connected, failed, and disabled.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="min-w-[120px] border-green-500/15 bg-green-500/5" padding="sm">
                <p className="text-xs uppercase tracking-[0.18em] text-green-300/70">Connected</p>
                <p className="mt-2 text-2xl font-semibold text-green-300">{counts.connected}</p>
              </Card>
              <Card className="min-w-[120px] border-yellow-500/15 bg-yellow-500/5" padding="sm">
                <p className="text-xs uppercase tracking-[0.18em] text-yellow-300/70">Pending</p>
                <p className="mt-2 text-2xl font-semibold text-yellow-300">{counts.pending}</p>
              </Card>
              <Card className="min-w-[120px] border-red-500/15 bg-red-500/5" padding="sm">
                <p className="text-xs uppercase tracking-[0.18em] text-red-300/70">Failed</p>
                <p className="mt-2 text-2xl font-semibold text-red-300">{counts.failed}</p>
              </Card>
              <Card className="min-w-[120px] border-gray-700 bg-gray-950/60" padding="sm">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Disabled</p>
                <p className="mt-2 text-2xl font-semibold text-gray-300">{counts.disabled}</p>
              </Card>
            </div>
          </div>
        </div>

        {!canManage && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-medium text-amber-100">Read-only access</p>
                <p className="mt-1 text-sm text-amber-200/80">Connector management is restricted to workspace owners and admins. Analysts and viewers can review status and recent validation output only.</p>
              </div>
            </div>
          </div>
        )}

        {notice && (
          <div className={clsx(
            'mb-6 rounded-2xl border px-5 py-4 text-sm',
            notice.tone === 'success' ? 'border-green-500/20 bg-green-500/10 text-green-200' : 'border-red-500/20 bg-red-500/10 text-red-200',
          )}>
            <div className="flex items-center justify-between gap-3">
              <span>{notice.text}</span>
              {notice.upgradeHref && (
                <Link to={notice.upgradeHref} className="flex-shrink-0 text-xs font-semibold text-blue-300 hover:text-blue-200">
                  Upgrade plan
                </Link>
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-[420px] rounded-2xl" />)}
          </div>
        ) : connectors.length === 0 ? (
          <EmptyState
            icon={Wifi}
            title="No connectors configured"
            description="Add a tenant-scoped integration to begin collecting cloud and identity telemetry."
            action={
              canManage ? (
                <Button variant="primary" icon={Plus} onClick={openCreateModal}>
                  Add First Connector
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {connectors.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                canManage={canManage}
                validation={validationResults[connector.id]}
                activeAction={activeAction}
                onEdit={openEditModal}
                onTest={handleTest}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-gray-800/90 bg-gray-950/50">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 text-blue-400" />
              <div>
                <p className="text-sm font-medium text-gray-100">Credential handling</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-400">
                  Connector secrets are submitted independently from visible settings, persisted as encrypted ciphertext, and only surfaced back to operators as a boolean that stored credentials exist.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-gray-800/90 bg-gray-950/50">
            <div className="flex items-start gap-3">
              <ExternalLink className="mt-0.5 h-5 w-5 text-blue-400" />
              <div>
                <p className="text-sm font-medium text-gray-100">Validation model</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-400">
                  Test Connection runs the tenant-scoped readiness checks, updates connector status, and records an auditable create, update, test, or delete event on the backend.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </PageContent>

      {modalMode && (
        <ConnectorModal
          mode={modalMode}
          connector={selectedConnector}
          isPending={createConnector.isPending || updateConnector.isPending}
          onClose={() => {
            setModalMode(null)
            setSelectedConnector(null)
            setActiveAction(null)
          }}
          onSubmit={submitForm}
        />
      )}
    </AppShell>
  )
}
