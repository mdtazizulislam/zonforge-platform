import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import ConnectorHealthPanel from '@/components/customer/ConnectorHealthPanel'
import { CustomerLayout } from '@/components/customer/CustomerLayout'
import InvestigationPreviewPanel from '@/components/customer/InvestigationPreviewPanel'
import KpiCard from '@/components/customer/KpiCard'
import RecentAlertsTable from '@/components/customer/RecentAlertsTable'
import RecommendedActionsPanel from '@/components/customer/RecommendedActionsPanel'
import RiskGaugeCard from '@/components/customer/RiskGaugeCard'
import RiskTrendChart from '@/components/customer/RiskTrendChart'
import TopThreatsPanel from '@/components/customer/TopThreatsPanel'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

type DashboardAlert = {
  id: string
  title: string
  severity: string
  source: string
  status: string
  createdAt: string
  priority: string
  context: string
}

type DashboardInvestigation = {
  id: string
  title: string
  status: string
  summary: string
  secondary: string
  createdAt: string
}

type DashboardRiskSummary = {
  riskScore: number
  trendPoints: number[]
  cloudExposure: number
  cloudExposureHelper: string
}

type DashboardConnectorItem = {
  id: string
  name: string
  status: string
  detail: string
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function safeNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function lower(value: unknown, fallback = ''): string {
  return safeText(value, fallback).toLowerCase()
}

function formatLabel(value: unknown, fallback: string): string {
  const text = safeText(value, fallback)
  return text.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback
}

function safeId(value: unknown, fallback: string): string {
  const text = safeText(value)
  return text || fallback
}

function candidateRecords(value: unknown): Record<string, unknown>[] {
  const seen = new Set<unknown>()
  const records: Record<string, unknown>[] = []
  const queue: unknown[] = [value]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || seen.has(current)) continue
    seen.add(current)

    const record = asRecord(current)
    if (!record) continue
    records.push(record)

    for (const key of ['data', 'result', 'payload', 'summary', 'meta']) {
      const nested = record[key]
      if (nested && !seen.has(nested)) queue.push(nested)
    }
  }

  return records
}

function findFirstArray(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value

  for (const record of candidateRecords(value)) {
    for (const key of keys) {
      const candidate = record[key]
      if (Array.isArray(candidate)) return candidate
    }
  }

  return []
}

function pickFirstNumber(value: unknown, keys: string[]): number {
  for (const record of candidateRecords(value)) {
    for (const key of keys) {
      const candidate = record[key]
      const numeric = safeNumber(candidate)
      if (numeric > 0 || candidate === 0 || candidate === '0') return numeric
    }
  }

  return 0
}

function severityRank(severity: string): number {
  const normalized = lower(severity, 'info')
  if (normalized === 'critical') return 4
  if (normalized === 'high') return 3
  if (normalized === 'medium') return 2
  if (normalized === 'low') return 1
  return 0
}

function severityTone(severity: string): 'default' | 'danger' | 'warning' | 'success' {
  const normalized = lower(severity)
  if (normalized === 'critical') return 'danger'
  if (normalized === 'high' || normalized === 'medium') return 'warning'
  if (normalized === 'resolved' || normalized === 'healthy') return 'success'
  return 'default'
}

function formatTimestamp(value: unknown): string {
  const text = safeText(value)
  if (!text) return 'No timestamp'
  const timestamp = new Date(text)
  if (Number.isNaN(timestamp.getTime())) return 'No timestamp'
  return timestamp.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function parseTimestamp(value: unknown): number {
  const text = safeText(value)
  if (!text) return 0
  const timestamp = new Date(text).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function normalizeAlert(alert: unknown, index: number): DashboardAlert {
  const record = asRecord(alert) ?? {}
  const severity = lower(
    record.severity ?? record.level ?? record.alertSeverity ?? record.priorityLabel,
    'info',
  )
  const title =
    safeText(record.title) ||
    safeText(record.name) ||
    safeText(record.alertTitle) ||
    safeText(record.summary) ||
    'Untitled alert'
  const source =
    safeText(record.source) ||
    safeText(record.connectorName) ||
    safeText(record.feed) ||
    safeText(record.detector) ||
    safeText(record.provider) ||
    safeText(record.affectedIp) ||
    safeText(ensureArray(record.mitreTactics)[0]) ||
    safeText(ensureArray(record.mitreTechniques)[0]) ||
    'Security feed'
  const status = formatLabel(record.status ?? record.state ?? record.workflowStatus, 'Open')
  const priority = safeText(record.priority ?? record.alertPriority, '')
  const contextParts = [source, priority, formatLabel(record.status ?? record.state, '')].filter(Boolean)

  return {
    id: safeId(record.id ?? record.alertId ?? record.uuid, `alert-${index}`),
    title,
    severity,
    source,
    status,
    createdAt: safeText(record.createdAt ?? record.timestamp ?? record.occurredAt ?? record.updatedAt),
    priority,
    context: contextParts.join(' • '),
  }
}

function normalizeInvestigation(item: unknown, index: number): DashboardInvestigation {
  const record = asRecord(item) ?? {}
  const summary =
    safeText(record.executiveSummary) ||
    safeText(record.summary) ||
    safeText(record.description) ||
    'Summary pending from the investigation service.'
  const secondary =
    safeText(record.entity) ||
    safeText(record.source) ||
    safeText(record.alertId) ||
    safeText(record.target) ||
    'No related entity or source yet'

  return {
    id: safeId(record.id ?? record.investigationId, `investigation-${index}`),
    title:
      safeText(record.title) ||
      safeText(record.alertTitle) ||
      safeText(record.name) ||
      `Investigation ${index + 1}`,
    status: formatLabel(record.status ?? record.state, 'Queued'),
    summary,
    secondary,
    createdAt: safeText(record.createdAt ?? record.updatedAt ?? record.startedAt),
  }
}

function normalizeRiskSummary(payload: unknown): DashboardRiskSummary {
  const riskScore = pickFirstNumber(payload, [
    'orgRiskScore',
    'riskScore',
    'score',
    'organizationRiskScore',
    'postureScore',
  ])

  let trendPoints: number[] = []
  for (const record of candidateRecords(payload)) {
    for (const key of ['trend', 'trends', 'series', 'points', 'trendSeries', 'riskTrend']) {
      const candidate = record[key]
      if (!Array.isArray(candidate)) continue

      const points = candidate
        .map((point) => {
          if (typeof point === 'number' || typeof point === 'string') return safeNumber(point)
          const pointRecord = asRecord(point)
          return safeNumber(
            pointRecord?.value ??
            pointRecord?.score ??
            pointRecord?.riskScore ??
            pointRecord?.count ??
            pointRecord?.y,
          )
        })
        .filter((point) => Number.isFinite(point))

      if (points.length > 0) {
        trendPoints = points.slice(-8)
        break
      }
    }

    if (trendPoints.length > 0) break
  }

  const cloudExposure = pickFirstNumber(payload, [
    'cloudExposure',
    'cloudAssetsExposed',
    'internetFacingAssets',
    'exposedAssets',
    'assetsAtRisk',
  ])
  const assetIds = findFirstArray(payload, ['topRiskAssetIds', 'assets', 'riskyAssets'])
  const derivedExposure = cloudExposure > 0 ? cloudExposure : assetIds.length

  return {
    riskScore,
    trendPoints,
    cloudExposure: derivedExposure,
    cloudExposureHelper:
      derivedExposure > 0
        ? cloudExposure > 0
          ? 'Exposure surfaced by the risk summary'
          : 'Assets currently driving exposure'
        : 'No exposed cloud assets reported yet',
  }
}

function normalizeAlerts(payload: unknown): DashboardAlert[] {
  return findFirstArray(payload, ['items', 'data', 'alerts', 'results'])
    .map((alert, index) => normalizeAlert(alert, index))
    .filter((alert) => Boolean(alert.id) && Boolean(alert.title))
    .sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt))
}

function normalizeInvestigations(payload: unknown): DashboardInvestigation[] {
  return findFirstArray(payload, ['items', 'data', 'investigations', 'results'])
    .map((item, index) => normalizeInvestigation(item, index))
    .sort((left, right) => {
      const leftActive = lower(left.status) === 'completed' ? 0 : 1
      const rightActive = lower(right.status) === 'completed' ? 0 : 1
      if (leftActive !== rightActive) return rightActive - leftActive
      return parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt)
    })
    .slice(0, 3)
}

function buildRecentAlerts(alerts: DashboardAlert[]) {
  return alerts.slice(0, 5).map((alert) => ({
    id: alert.id,
    title: alert.title,
    severity: formatLabel(alert.severity, 'Info'),
    source: alert.source,
    status: alert.status,
  }))
}

function buildTopThreats(alerts: DashboardAlert[]) {
  return alerts
    .slice()
    .sort((left, right) => {
      const score = severityRank(right.severity) - severityRank(left.severity)
      if (score !== 0) return score
      return parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt)
    })
    .slice(0, 3)
    .map((alert) => ({
      id: alert.id,
      title: alert.title,
      severity: formatLabel(alert.severity, 'Info'),
      context: alert.context || 'No additional context available.',
      ts: formatTimestamp(alert.createdAt),
    }))
}

function buildConnectorItems(payload: unknown): DashboardConnectorItem[] {
  const records = candidateRecords(payload)
  const componentMap = new Map<string, DashboardConnectorItem>()

  for (const record of records) {
    const components = record.components ?? record.services ?? record.statuses

    if (Array.isArray(components)) {
      for (const component of components) {
        const item = asRecord(component)
        if (!item) continue

        const name = safeText(item.name ?? item.component ?? item.service)
        const status = formatLabel(item.status ?? item.state ?? item.health, 'Unknown')
        const detail = safeText(item.detail ?? item.message ?? item.lastEventAt, 'Telemetry received')
        const key = lower(name)

        if (key.includes('api')) componentMap.set('api', { id: 'api', name: name || 'API', status, detail })
        if (key.includes('ingest')) componentMap.set('ingestion', { id: 'ingestion', name: name || 'Ingestion', status, detail })
        if (key.includes('detect')) componentMap.set('detection', { id: 'detection', name: name || 'Detection', status, detail })
      }
    }

    const connectors = asRecord(record.connectors)
    const summary = asRecord(record.summary)
    const connectorDetails = ensureArray(connectors?.details)
    const connectorTotal = safeNumber(connectors?.total)
    const connectorHealthy = safeNumber(connectors?.healthy)
    const overallStatus = formatLabel(summary?.overallStatus ?? record.status ?? record.health, 'Healthy')
    const queueEntries = Object.values(asRecord(record.queues) ?? {}) as unknown[]
    const totalFailed = queueEntries.reduce<number>((sum, entry) => sum + safeNumber(asRecord(entry)?.failed), 0)
    const totalWaiting = queueEntries.reduce<number>((sum, entry) => sum + safeNumber(asRecord(entry)?.waiting), 0)

    if (!componentMap.has('api')) {
      componentMap.set('api', {
        id: 'api',
        name: 'API',
        status: overallStatus,
        detail: overallStatus ? `Pipeline status: ${overallStatus}` : 'Pipeline healthy',
      })
    }

    if (!componentMap.has('ingestion')) {
      const ingestionStatus =
        totalFailed > 0 ? 'Error' : connectorTotal > 0 && connectorHealthy < connectorTotal ? 'Degraded' : overallStatus

      componentMap.set('ingestion', {
        id: 'ingestion',
        name: 'Ingestion',
        status: ingestionStatus,
        detail:
          connectorDetails.length > 0
            ? `${connectorDetails.length} connector streams reporting`
            : connectorTotal > 0
              ? `${connectorHealthy}/${connectorTotal} connectors healthy`
              : 'No connector telemetry yet',
      })
    }

    if (!componentMap.has('detection')) {
      const detectionStatus = totalFailed > 0 ? 'Error' : totalWaiting > 0 ? 'Degraded' : overallStatus

      componentMap.set('detection', {
        id: 'detection',
        name: 'Detection',
        status: detectionStatus,
        detail:
          totalFailed > 0
            ? `${totalFailed} failed jobs detected`
            : totalWaiting > 0
              ? `${totalWaiting} queued jobs pending`
              : 'Detection flow stable',
      })
    }
  }

  return ['api', 'ingestion', 'detection']
    .map((key) => componentMap.get(key))
    .filter((item): item is DashboardConnectorItem => Boolean(item))
}

function buildRecommendedActions({
  alerts,
  risk,
  connectorItems,
}: {
  alerts: DashboardAlert[]
  risk: DashboardRiskSummary
  connectorItems: DashboardConnectorItem[]
}) {
  const actions: string[] = []
  const criticalAlerts = alerts.filter((alert) => lower(alert.severity) === 'critical').length
  const activeThreats = alerts.filter((alert) => {
    const severity = lower(alert.severity)
    const status = lower(alert.status)
    return status === 'open' && (severity === 'critical' || severity === 'high')
  }).length
  const unhealthyConnectors = connectorItems.filter((item) => {
    const status = lower(item.status)
    return status === 'error' || status === 'degraded' || status === 'failed'
  }).length

  if (criticalAlerts > 0) actions.push('Review latest critical alerts')
  if (activeThreats > 0 || risk.riskScore >= 60) actions.push('Investigate unusual login behavior')
  if (unhealthyConnectors > 0) actions.push('Validate connector coverage')
  if (risk.riskScore >= 75) actions.push('Escalate elevated organization risk to the response team')

  if (actions.length === 0) {
    actions.push('Review latest critical alerts')
    actions.push('Investigate unusual login behavior')
    actions.push('Validate connector coverage')
  }

  return Array.from(new Set(actions)).slice(0, 5)
}

function countCriticalAlerts(alerts: DashboardAlert[]): number {
  return alerts.filter((alert) => lower(alert.severity) === 'critical').length
}

function countActiveThreats(alerts: DashboardAlert[]): number {
  return alerts.filter((alert) => {
    const severity = lower(alert.severity)
    const status = lower(alert.status)
    return status === 'open' && (severity === 'critical' || severity === 'high')
  }).length
}

function filterAlerts(alerts: DashboardAlert[], query: string): DashboardAlert[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return alerts

  return alerts.filter((alert) => [alert.title, alert.severity, alert.source, alert.status, alert.context]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery))
}

function filterInvestigations(items: DashboardInvestigation[], query: string): DashboardInvestigation[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return items

  return items.filter((item) => [item.title, item.status, item.summary, item.secondary]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery))
}

function hasDashboardData({
  alerts,
  investigations,
  connectors,
  risk,
}: {
  alerts: DashboardAlert[]
  investigations: DashboardInvestigation[]
  connectors: DashboardConnectorItem[]
  risk: DashboardRiskSummary
}) {
  return alerts.length > 0 || investigations.length > 0 || connectors.length > 0 || risk.riskScore > 0 || risk.trendPoints.length > 0
}

function formatCountLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

function buildInvestigationPanelItems(items: DashboardInvestigation[]) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    summary: item.summary,
    secondary: item.secondary,
  }))
}

function buildLoadingCards(): number[] {
  return [0, 1, 2, 3]
}

function queryKey(suffix: string) {
  return ['customer-dashboard', suffix]
}

export default function CustomerDashboardPage() {
  const [searchValue, setSearchValue] = useState('')

  const [riskQuery, alertsQuery, investigationsQuery, pipelineQuery] = useQueries({
    queries: [
      {
        queryKey: queryKey('risk-summary'),
        queryFn: () => api.risk.summary() as Promise<unknown>,
      },
      {
        queryKey: queryKey('alerts'),
        queryFn: () => api.alerts.list({ limit: 24 }) as Promise<unknown>,
      },
      {
        queryKey: queryKey('investigations'),
        queryFn: () => api.ai.investigations({ limit: 6 }) as Promise<unknown>,
      },
      {
        queryKey: queryKey('pipeline-health'),
        queryFn: () => api.health.pipeline() as Promise<unknown>,
      },
    ],
  })

  const risk = useMemo(() => normalizeRiskSummary(riskQuery.data), [riskQuery.data])
  const alerts = useMemo(() => normalizeAlerts(alertsQuery.data), [alertsQuery.data])
  const investigations = useMemo(() => normalizeInvestigations(investigationsQuery.data), [investigationsQuery.data])
  const connectorItems = useMemo(() => buildConnectorItems(pipelineQuery.data), [pipelineQuery.data])

  const searchableAlerts = useMemo(() => filterAlerts(alerts, searchValue), [alerts, searchValue])
  const searchableInvestigations = useMemo(() => filterInvestigations(investigations, searchValue), [investigations, searchValue])

  const recentAlerts = useMemo(() => buildRecentAlerts(searchableAlerts), [searchableAlerts])
  const topThreats = useMemo(() => buildTopThreats(searchableAlerts), [searchableAlerts])
  const investigationItems = useMemo(() => buildInvestigationPanelItems(searchableInvestigations), [searchableInvestigations])

  const criticalAlerts = useMemo(() => countCriticalAlerts(searchableAlerts), [searchableAlerts])
  const activeThreats = useMemo(() => countActiveThreats(searchableAlerts), [searchableAlerts])
  const recommendedActions = useMemo(() => buildRecommendedActions({
    alerts: searchableAlerts,
    risk,
    connectorItems,
  }), [connectorItems, risk, searchableAlerts])

  const isInitialLoading =
    (riskQuery.isLoading || alertsQuery.isLoading || investigationsQuery.isLoading || pipelineQuery.isLoading) &&
    !hasDashboardData({ alerts, investigations, connectors: connectorItems, risk })

  const isEmptyState = !isInitialLoading && !hasDashboardData({
    alerts: searchableAlerts,
    investigations: searchableInvestigations,
    connectors: connectorItems,
    risk,
  })

  return (
    <CustomerLayout
      title="Security Dashboard"
      subtitle="Executive posture, active threats, and action-ready customer insights."
    >
      <div className="zf-page">
        <div className="zf-container">
          <section className="zf-section">
            <div className="zf-section-head">
              <h1 className="zf-page-title">Security Dashboard</h1>
              <p className="zf-page-subtitle">Executive posture, active threats, and action-ready customer insights in a premium enterprise shell.</p>
            </div>

            <div className="zf-grid zf-grid-2">
              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Search the executive view</h2>
                  <p className="zf-card-subtitle">Filter alerts and investigations without leaving the customer workspace.</p>
                </div>
                <label className="zf-customer-search" aria-label="Search customer dashboard content">
                  <input
                    type="search"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Search alerts, sources, and investigations..."
                  />
                </label>
              </section>

              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Executive posture</h2>
                  <p className="zf-card-subtitle">A cleaner KPI, chart, and side-panel composition for customer-facing security review.</p>
                </div>
              {isInitialLoading ? (
                <div className="zf-customer-loading" aria-label="Loading customer dashboard">
                  {buildLoadingCards().map((index) => <div key={index} className="zf-customer-loading__card" />)}
                </div>
              ) : (
                <div className="zf-dashboard-grid">
                  <section className="zf-kpi-grid">
                    <RiskGaugeCard
                      score={risk.riskScore}
                      helper={risk.riskScore > 0 ? 'Current organization posture score' : 'No risk score yet'}
                    />

                    <KpiCard
                      title="Critical Alerts"
                      value={criticalAlerts}
                      helper={
                        criticalAlerts > 0
                          ? `${criticalAlerts} ${formatCountLabel(criticalAlerts, 'critical issue requires immediate review', 'critical issues require immediate review')}`
                          : 'No critical alerts detected in the current feed'
                      }
                      tone={criticalAlerts > 0 ? 'danger' : 'success'}
                    />

                    <KpiCard
                      title="Active Threats"
                      value={activeThreats}
                      helper={
                        activeThreats > 0
                          ? `${activeThreats} ${formatCountLabel(activeThreats, 'active high-severity threat is still open', 'active high-severity threats are still open')}`
                          : 'No active high-severity threats currently surfaced'
                      }
                      tone={activeThreats > 0 ? 'warning' : 'success'}
                    />

                    <KpiCard
                      title="Cloud Exposure"
                      value={risk.cloudExposure}
                      helper={risk.cloudExposureHelper}
                      tone={risk.cloudExposure > 0 ? severityTone(risk.cloudExposure > 3 ? 'high' : 'medium') : 'default'}
                    />
                  </section>

                  <div className="zf-span-8">
                    <RiskTrendChart points={risk.trendPoints} />
                  </div>

                  <div className="zf-span-4">
                    <TopThreatsPanel items={topThreats} />
                  </div>

                  <div className="zf-span-8">
                    <RecentAlertsTable alerts={recentAlerts} />
                  </div>

                  <div className="zf-span-4">
                    <RecommendedActionsPanel actions={recommendedActions} />
                  </div>

                  <div className="zf-span-8">
                    <InvestigationPreviewPanel items={investigationItems} />
                  </div>

                  <div className="zf-span-4">
                    <ConnectorHealthPanel items={connectorItems} />
                  </div>
                </div>
              )}

              {isEmptyState ? (
                <div className="zf-customer-empty">The dashboard is live, but the current APIs did not return customer dashboard data yet.</div>
              ) : null}
              </section>
            </div>
          </section>
        </div>
      </div>
    </CustomerLayout>
  )
}