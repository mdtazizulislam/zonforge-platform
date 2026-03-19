import { createLogger } from '@zonforge/logger'
import { env } from '@zonforge/config'
import { M365Collector } from './m365.collector.js'

const log = createLogger({ service: 'collector:m365' })

// ─────────────────────────────────────────────
// M365 Collector — Entry Point
//
// Configuration loaded from environment variables
// injected by the platform when a connector is
// provisioned. Each connector instance runs as
// a separate process (or Kubernetes Job/CronJob).
// ─────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Required env var missing: ${name}`)
  return value
}

async function start() {
  const collectorConfig = {
    tenantId:        requireEnv('ZF_TENANT_ID'),
    connectorId:     requireEnv('ZF_CONNECTOR_ID'),
    sourceType:      'm365_entra',
    pollIntervalMs:  parseInt(process.env['ZF_POLL_INTERVAL_MS'] ?? '300000', 10),
    batchSize:       parseInt(process.env['ZF_BATCH_SIZE'] ?? '500', 10),
    ingestionApiUrl: requireEnv('ZF_INGESTION_API_URL'),
    apiKey:          requireEnv('ZF_API_KEY'),
    hmacSecret:      requireEnv('ZF_HMAC_SECRET'),
  }

  const authConfig = {
    azureTenantId: requireEnv('ZF_M365_AZURE_TENANT_ID'),
    clientId:      requireEnv('ZF_M365_CLIENT_ID'),
    clientSecret:  requireEnv('ZF_M365_CLIENT_SECRET'),
  }

  const collector = new M365Collector({ collectorConfig, authConfig })

  log.info({
    tenantId:    collectorConfig.tenantId,
    connectorId: collectorConfig.connectorId,
    azureTenantId: authConfig.azureTenantId,
    pollIntervalMs: collectorConfig.pollIntervalMs,
  }, '🚀 Starting M365 / Entra ID collector')

  await collector.start()

  // Graceful shutdown
  const shutdown = async (sig: string) => {
    log.info({ sig }, 'Shutting down M365 collector...')
    await collector.stop()
    log.info('✅ M365 collector stopped cleanly')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch((err) => {
  log.fatal({ err }, '❌ M365 collector failed to start')
  process.exit(1)
})
