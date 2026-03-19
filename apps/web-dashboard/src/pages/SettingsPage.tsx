import { useState } from 'react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/auth.store'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Divider } from '@/components/shared/ui'
import {
  Bell, Shield, Users, Key, CreditCard, Moon, Sun,
  Monitor, Save, Eye, EyeOff, Copy, CheckCircle2,
  ChevronRight, Settings, Palette,
} from 'lucide-react'

// ─────────────────────────────────────────────
// TOGGLE SWITCH
// ─────────────────────────────────────────────

function Toggle({
  enabled, onChange, label, description,
}: {
  enabled: boolean; onChange: (v: boolean) => void
  label: string; description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={clsx(
          'relative flex-shrink-0 h-6 w-11 rounded-full transition-colors',
          enabled ? 'bg-blue-600' : 'bg-gray-700',
        )}
      >
        <div className={clsx(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          enabled ? 'translate-x-5.5' : 'translate-x-0.5',
        )} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// SETTINGS SECTION
// ─────────────────────────────────────────────

function SettingsSection({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode
}) {
  return (
    <Card className="space-y-0">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-gray-800 p-2">
          <Icon className="h-4 w-4 text-gray-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      </div>
      {children}
    </Card>
  )
}

// ─────────────────────────────────────────────
// API KEY ROW
// ─────────────────────────────────────────────

function ApiKeyRow({ name, prefix, role, lastUsed, onRevoke }: {
  name: string; prefix: string; role: string
  lastUsed?: string; onRevoke: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copyPrefix() {
    navigator.clipboard.writeText(prefix)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-800 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-200">{name}</p>
          <Badge variant="neutral" size="xs">{role}</Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <code className="text-xs font-mono text-gray-500">{prefix}…</code>
          <button onClick={copyPrefix}
            className="text-gray-700 hover:text-gray-400 transition-colors">
            {copied ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        {lastUsed && (
          <p className="text-xs text-gray-700 mt-0.5">
            Last used: {new Date(lastUsed).toLocaleDateString()}
          </p>
        )}
      </div>
      <button onClick={onRevoke}
        className="text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1
                   rounded border border-red-500/20 hover:border-red-500/40">
        Revoke
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// SETTINGS PAGE
// ─────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuthStore()
  const { theme, setTheme } = useAuthStore((s: any) => ({
    theme: (s as any).theme ?? 'dark',
    setTheme: (s as any).setTheme ?? (() => {}),
  })) as any

  // Notification settings
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [slackAlerts, setSlackAlerts] = useState(false)
  const [p1Only, setP1Only]           = useState(false)
  const [slaAlerts, setSlaAlerts]     = useState(true)

  // Display settings
  const [compactMode, setCompact]     = useState(false)
  const [showTechIds, setShowTechIds] = useState(true)

  // State for saved indicators
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const activeTab = 'general' // simplified — single page

  return (
    <AppShell
      title="Settings"
      actions={
        <Button
          variant="primary"
          size="sm"
          icon={saved ? CheckCircle2 : Save}
          onClick={handleSave}
        >
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      }
    >
      <PageContent className="max-w-3xl">

        {/* Profile */}
        <SettingsSection title="Your Profile" icon={Users}>
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center
                            text-blue-400 font-bold text-lg">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-200">{user?.name ?? '—'}</p>
              <p className="text-xs text-gray-500">{user?.email ?? '—'}</p>
              <div className="mt-1">
                <Badge variant="neutral" size="xs">{user?.role ?? '—'}</Badge>
              </div>
            </div>
          </div>
          <Divider />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-gray-300">Change Password</p>
              <p className="text-xs text-gray-600">Last changed: unknown</p>
            </div>
            <Button variant="outline" size="sm">Update</Button>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-gray-300">Two-Factor Authentication</p>
              <p className="text-xs text-gray-600">Protect your account with TOTP</p>
            </div>
            <Button variant="outline" size="sm">Configure</Button>
          </div>
        </SettingsSection>

        {/* Appearance */}
        <SettingsSection title="Appearance" icon={Palette}>
          <p className="text-xs text-gray-500 mb-3">Choose your color scheme preference.</p>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: 'dark',   label: 'Dark',   icon: Moon },
              { value: 'light',  label: 'Light',  icon: Sun },
              { value: 'system', label: 'System', icon: Monitor },
            ] as const).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={clsx(
                  'flex flex-col items-center gap-2 py-4 rounded-xl border text-sm font-medium transition-all',
                  theme === value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-gray-800 text-gray-500 hover:border-gray-700',
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>

          <Divider />
          <Toggle
            enabled={compactMode} onChange={setCompact}
            label="Compact Mode"
            description="Reduce padding for denser information display"
          />
          <Toggle
            enabled={showTechIds} onChange={setShowTechIds}
            label="Show MITRE Technique IDs"
            description="Display T1234 codes alongside technique names"
          />
        </SettingsSection>

        {/* Notifications */}
        <SettingsSection title="Notifications" icon={Bell}>
          <Toggle
            enabled={emailAlerts} onChange={setEmailAlerts}
            label="Email Alerts"
            description="Receive alert emails for new P1/P2 detections"
          />
          <Toggle
            enabled={slackAlerts} onChange={setSlackAlerts}
            label="Slack Notifications"
            description="Send alerts to your configured Slack channel"
          />
          <Toggle
            enabled={p1Only} onChange={setP1Only}
            label="Critical Alerts Only"
            description="Only notify for P1 (critical) alerts"
          />
          <Toggle
            enabled={slaAlerts} onChange={setSlaAlerts}
            label="SLA Breach Notifications"
            description="Alert when MTTD SLA targets are exceeded"
          />

          {slackAlerts && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">Slack Webhook URL</p>
              <input
                type="url"
                placeholder="https://hooks.slack.com/services/…"
                className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800
                           text-sm text-gray-200 placeholder-gray-600
                           focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </SettingsSection>

        {/* Security */}
        <SettingsSection title="Security & Access" icon={Shield}>
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Tenant ID</span>
              <code className="font-mono text-gray-300 text-xs">{user?.tenantId}</code>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Region</span>
              <span className="text-gray-300 text-xs">{(user as any)?.region ?? 'us-east-1'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Session</span>
              <Badge variant="success" size="xs">Active</Badge>
            </div>
          </div>

          <Divider label="Data Retention" />
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Event retention</span>
              <span className="text-gray-300">90 days</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Alert history</span>
              <span className="text-gray-300">1 year</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Audit log</span>
              <div className="flex items-center gap-1.5 text-green-400">
                <Shield className="h-3 w-3" />
                <span className="text-xs">7 years (WORM)</span>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* API Keys */}
        <SettingsSection title="API Keys" icon={Key}>
          <p className="text-xs text-gray-500 mb-4">
            API keys allow programmatic access and are used by data collectors.
            Keys are shown once at creation.
          </p>

          {/* Mock keys for display */}
          <ApiKeyRow
            name="M365 Collector"
            prefix="sk_live_abc123"
            role="API_CONNECTOR"
            lastUsed={new Date(Date.now() - 5 * 60_000).toISOString()}
            onRevoke={() => {}}
          />
          <ApiKeyRow
            name="CloudTrail Collector"
            prefix="sk_live_def456"
            role="API_CONNECTOR"
            lastUsed={new Date(Date.now() - 15 * 60_000).toISOString()}
            onRevoke={() => {}}
          />

          <div className="mt-4">
            <Button variant="outline" size="sm" icon={Key}>
              Create New API Key
            </Button>
          </div>
        </SettingsSection>

        {/* Billing */}
        <SettingsSection title="Plan & Billing" icon={CreditCard}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-200">Current Plan</p>
              <p className="text-xs text-gray-500 mt-0.5">Renews monthly</p>
            </div>
            <Badge variant="neutral" size="md">Starter Trial</Badge>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            {[
              { label: 'Events/min',     value: '5K',  limit: '5K' },
              { label: 'Connectors',     value: '1',   limit: '3' },
              { label: 'Retention',      value: '30d', limit: '30d' },
            ].map(({ label, value, limit }) => (
              <div key={label} className="rounded-lg bg-gray-800/40 p-3">
                <p className="text-sm font-bold text-gray-200">{value}</p>
                <p className="text-xs text-gray-600">{label}</p>
                <p className="text-xs text-gray-700 mt-0.5">of {limit}</p>
              </div>
            ))}
          </div>
          <Button variant="primary" className="w-full justify-center">
            Upgrade Plan
          </Button>
        </SettingsSection>

      </PageContent>
    </AppShell>
  )
}
