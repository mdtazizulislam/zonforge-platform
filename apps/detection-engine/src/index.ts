import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { Redis } from 'ioredis'
import { initDb, initClickHouse, closeDb, closeClickHouse } from '@zonforge/db-client'
import {
  postgresConfig, clickhouseConfig, redisConfig, env,
} from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { RuleLoader, getDefaultRulesPath } from './rules/rule-loader.js'
import { RuleEvaluator } from './engine/rule-evaluator.js'
import { SignalEmitter } from './engine/signal-emitter.js'
import { createDetectionWorker } from './workers/detection.worker.js'
import {
  createQueue, getQueueConnection, QUEUE_NAMES,
} from '@zonforge/ingestion-service/queues'

const log = createLogger({ service: 'detection-engine' })

async function start() {
  // ── Databases ───────────────────────────────
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')
  initClickHouse(clickhouseConfig)
  log.info('✅ ClickHouse connected')

  // ── Redis ───────────────────────────────────
  const redis = new Redis({
    host:     redisConfig.host,
    port:     redisConfig.port,
    password: redisConfig.password,
    tls:      redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error',   (e: Error) => log.error({ err: e }, 'Redis error'))

  // ── Load rules ──────────────────────────────
  const ruleLoader  = new RuleLoader()
  const rulesPath   = process.env['ZONFORGE_RULES_PATH'] ?? getDefaultRulesPath()
  const loadResult  = ruleLoader.loadFromDirectory(rulesPath)

  if (loadResult.failed > 0) {
    log.warn({ failed: loadResult.failed, errors: loadResult.errors },
      'Some rules failed to load')
  }

  log.info({
    loaded:   loadResult.loaded,
    enabled:  ruleLoader.getEnabledRules().length,
    rulesPath,
  }, '✅ Detection rules loaded')

  // Log ATT&CK coverage summary
  const coverage = ruleLoader.getCoverageSummary()
  log.info({ techniquesCount: coverage.size },
    `ATT&CK coverage: ${coverage.size} techniques covered`)

  // ── Detection queue ─────────────────────────
  const connection       = getQueueConnection(redisConfig)
  const detectionQueue   = createQueue(QUEUE_NAMES.DETECTION_SIGNALS, connection)

  // ── Services ────────────────────────────────
  const ruleEvaluator = new RuleEvaluator()
  const signalEmitter = new SignalEmitter(detectionQueue, redis)

  // ── Workers ─────────────────────────────────
  const { worker, stopSweep } = createDetectionWorker(
    redis, ruleLoader, ruleEvaluator, signalEmitter,
  )

  // ── Health + metrics HTTP server ─────────────
  const app = new Hono()

  app.get('/health', (ctx) => ctx.json({
    status:   'ok',
    service:  'detection-engine',
    rules: {
      total:   ruleLoader.getAllRules().length,
      enabled: ruleLoader.getEnabledRules().length,
    },
    coverage: { techniques: coverage.size },
    timestamp: new Date(),
  }))

  app.get('/rules', (ctx) => ctx.json({
    success: true,
    data:    ruleLoader.getEnabledRules().map(r => ({
      id:         r.id,
      name:       r.name,
      severity:   r.severity,
      confidence: r.confidence_score,
      mitre:      r.mitre.techniques.map(t => `${t.id} ${t.name}`),
      sourceTypes: r.source_types,
    })),
  }))

  app.get('/coverage', (ctx) => {
    const cov = Array.from(coverage.values())
    return ctx.json({ success: true, data: cov })
  })

  const port = parseInt(process.env['PORT'] ?? '3003', 10)
  serve({ fetch: app.fetch, port }, (info) => {
    log.info(`🚀 ZonForge Detection Engine on port ${info.port}`)
    log.info(`   Rules loaded: ${ruleLoader.getEnabledRules().length}`)
    log.info(`   ATT&CK techniques covered: ${coverage.size}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  // ── Graceful shutdown ────────────────────────
  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down detection engine...')
    stopSweep()
    await worker.close()
    await detectionQueue.close()
    await closeClickHouse()
    await closeDb()
    await redis.quit()
    log.info('✅ Detection engine shut down cleanly')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Detection engine failed to start')
  process.exit(1)
})
