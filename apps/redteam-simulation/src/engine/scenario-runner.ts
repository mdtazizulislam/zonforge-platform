import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import { v4 as uuid } from 'uuid'
import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import { createLogger } from '@zonforge/logger'
import {
  generateEventsForStep,
  validateEventSafety,
  type GeneratedEvent,
} from './event-generator.js'
import type {
  ScenarioDefinition, ScenarioStep,
  SimulationResult, StepResult, StepStatus,
} from '../models/simulation-result.js'
import { SIMULATION_MARKER_PREFIX } from '../models/simulation-result.js'

const log = createLogger({ service: 'redteam:scenario-runner' })

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCENARIOS_DIR = join(__dirname, '../scenarios')

// ─────────────────────────────────────────────
// SCENARIO RUNNER
//
// Loads YAML scenario definitions, generates events,
// validates them for safety, injects them into the
// existing raw-events BullMQ queue (same queue as
// real collectors — so they flow through the full
// detection pipeline).
//
// Safety guarantees:
//   1. Every event has _simulation:true
//   2. Every event has _simMarker:<runId>
//   3. Safety validator must pass before injection
//   4. Uses TEST-NET IPs only
//   5. Uses @sim.zonforge.internal actor emails
//   6. Rejection blocks entire step (fail-safe)
// ─────────────────────────────────────────────

export class ScenarioRunner {
  private readonly rawEventsQueue: Queue

  constructor(
    private readonly redis: Redis,
    private readonly queueName = 'zf:raw-events',
  ) {
    this.rawEventsQueue = new Queue(queueName, {
      connection: redis as unknown as any,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail:      50,
        attempts:          1,      // no retries for simulations
        backoff: { type: 'fixed', delay: 0 },
      },
    })
  }

  // ── Load scenario from YAML file ─────────────

  async loadScenario(scenarioId: string): Promise<ScenarioDefinition> {
    const filePath = join(SCENARIOS_DIR, `${scenarioId.replace(/_/g, '-')}.yaml`)
    let raw: string

    try {
      raw = await readFile(filePath, 'utf-8')
    } catch {
      throw new Error(`Scenario not found: ${scenarioId} (path: ${filePath})`)
    }

    const parsed = parseYaml(raw) as ScenarioDefinition
    if (!parsed.scenario || !parsed.steps || !parsed.expected_detections) {
      throw new Error(`Invalid scenario YAML: missing required fields in ${scenarioId}`)
    }

    return parsed
  }

  // ── Load all available scenarios ─────────────

  async loadAllScenarios(): Promise<ScenarioDefinition[]> {
    const { readdir } = await import('fs/promises')
    let files: string[]

    try {
      files = await readdir(SCENARIOS_DIR)
    } catch {
      return []
    }

    const scenarios: ScenarioDefinition[] = []
    for (const file of files.filter(f => f.endsWith('.yaml'))) {
      const scenarioId = file.replace('.yaml', '').replace(/-/g, '_')
      try {
        scenarios.push(await this.loadScenario(scenarioId))
      } catch (err) {
        log.warn({ file, err }, 'Failed to load scenario file')
      }
    }

    return scenarios
  }

  // ── Execute a full simulation run ────────────

  async runSimulation(
    scenario:  ScenarioDefinition,
    tenantId:  string,
    options:   { dryRun?: boolean } = {},
  ): Promise<SimulationResult> {
    const simId     = uuid()
    const simMarker = `${SIMULATION_MARKER_PREFIX}${simId.replace(/-/g, '').slice(0, 16)}`
    const startedAt = new Date()

    log.info({
      simId,
      scenario: scenario.scenario,
      tenantId,
      steps:    scenario.steps.length,
      dryRun:   options.dryRun ?? false,
    }, `🎯 Starting simulation: ${scenario.name}`)

    const stepResults: StepResult[] = []
    let totalEventsInjected = 0
    let allGeneratedEvents: GeneratedEvent[] = []

    // ── Execute each step ──────────────────────

    for (const step of scenario.steps) {
      const stepStart = Date.now()
      let   status: StepStatus = 'pending'
      let   injected = 0
      let   stepError: string | undefined

      try {
        // Generate events
        const events = generateEventsForStep(step, simMarker, tenantId, step.step)

        // Safety validation — fail-safe: reject entire step if any event fails
        const violations: string[] = []
        for (const event of events) {
          const check = validateEventSafety(event)
          if (!check.safe) violations.push(...check.violations)
        }

        if (violations.length > 0) {
          throw new Error(`Safety check failed: ${violations.join('; ')}`)
        }

        if (!options.dryRun) {
          // Inject events into BullMQ raw-events queue
          const jobs = events.map(e => ({
            name: `sim-event-${e.id}`,
            data: {
              // Match ingestion-service job format
              eventId:        e.id,
              tenantId:       e.tenantId,
              sourceType:     e.sourceType,
              eventAction:    e.eventAction,
              eventCategory:  e.eventCategory,
              actorUserId:    e.actorUserId,
              actorIp:        e.actorIp,
              actorIpCountry: e.actorCountry,
              targetAssetId:  e.targetAssetId,
              targetResource: e.targetResource,
              outcome:        e.outcome,
              eventTime:      e.eventTime.toISOString(),
              rawEvent:       e.rawEvent,
              // Safety fields
              _simulation:    true,
              _simMarker:     simMarker,
              _simStep:       step.step,
            },
          }))

          await this.rawEventsQueue.addBulk(jobs)
          injected  = events.length
          status    = 'injected'
          allGeneratedEvents.push(...events)
          totalEventsInjected += injected

          log.info({
            simId, step: step.step, stepName: step.name,
            injected, eventType: step.event_type,
          }, `  ↳ Step ${step.step} injected: ${step.name}`)

          // Respect step delay before next step
          if (step.delay_ms > 0 && step.step < scenario.steps.length) {
            await sleep(Math.min(step.delay_ms, 2000))   // cap at 2s for throughput
          }
        } else {
          status   = 'injected'   // dry-run: report as would-inject
          injected = events.length
          log.debug({ step: step.step, events: events.length }, 'DRY RUN — events not injected')
        }

      } catch (err) {
        status    = 'failed'
        stepError = err instanceof Error ? err.message : String(err)
        log.error({ err, simId, step: step.step }, `Step ${step.step} failed`)
      }

      stepResults.push({
        step:           step.step,
        name:           step.name,
        status,
        eventsInjected: injected,
        injectedAt:     status === 'injected' ? new Date() : null,
        durationMs:     Date.now() - stepStart,
        ...(stepError !== undefined ? { error: stepError } : {}),
      })
    }

    const completedAt = new Date()
    const durationMs  = completedAt.getTime() - startedAt.getTime()

    // ── Build initial result (evaluation happens separately) ──

    const result: SimulationResult = {
      id:             simId,
      tenantId,
      scenarioId:     scenario.scenario,
      scenarioName:   scenario.name,
      category:       scenario.category,
      mitreTechniques: scenario.mitre_techniques,
      expectedRules:  scenario.expected_detections,
      status:         options.dryRun ? 'completed' : 'evaluating',

      startedAt,
      completedAt,
      durationMs,
      stepsTotal:     scenario.steps.length,
      stepsInjected:  stepResults.filter(s => s.status === 'injected').length,
      eventsTotal:    totalEventsInjected,

      detectionsExpected: scenario.expected_detections.length,
      detectionsFound:    0,
      detections:         [],

      evaluationStatus:  'timeout',
      detectionRatePct:  0,
      gapRules:          [...scenario.expected_detections],

      summary:         `Simulation ${simId.slice(0, 8)} — ${totalEventsInjected} events injected across ${stepResults.filter(s => s.status === 'injected').length} steps`,
      gaps:            [],
      recommendations: [],

      sandboxed:         true,
      simulationMarker:  simMarker,
    }

    log.info({
      simId,
      scenario:  scenario.scenario,
      injected:  totalEventsInjected,
      steps:     scenario.steps.length,
      durationMs,
    }, `✅ Simulation injection complete: ${scenario.name}`)

    return result
  }

  async close(): Promise<void> {
    await this.rawEventsQueue.close()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
