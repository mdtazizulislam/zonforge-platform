import { Worker, Queue } from 'bullmq'
import type Redis from 'ioredis'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import { ScenarioRunner }    from '../engine/scenario-runner.js'
import { EvaluationEngine }  from '../engine/evaluation-engine.js'
import type { ScenarioDefinition, SimulationResult } from '../models/simulation-result.js'

const log = createLogger({ service: 'redteam:simulation-worker' })

// ─────────────────────────────────────────────
// SIMULATION WORKER
//
// Consumes jobs from the redteam-simulation queue.
// Each job represents a single scenario run.
//
// Job data:
//   { scenarioId, tenantId, triggeredBy, dryRun }
//
// Processing:
//   1. Load scenario YAML
//   2. Run injection via ScenarioRunner
//   3. Wait for evaluation window
//   4. Check detections via EvaluationEngine
//   5. Persist result to PostgreSQL
//   6. Update security score cache
// ─────────────────────────────────────────────

export const SIMULATION_QUEUE_NAME = 'zf:redteam-simulations'

export interface SimulationJobData {
  scenarioId:  string
  tenantId:    string
  triggeredBy: string   // userId or 'scheduler'
  dryRun?:     boolean
  runId?:      string
}

export function createSimulationWorker(redis: Redis): Worker {
  const runner   = new ScenarioRunner(redis)
  const evaluator = new EvaluationEngine()

  const worker = new Worker<SimulationJobData>(
    SIMULATION_QUEUE_NAME,

    async (job) => {
      const { scenarioId, tenantId, triggeredBy, dryRun = false } = job.data
      const jobId = job.id ?? uuid()

      log.info({ jobId, scenarioId, tenantId, triggeredBy, dryRun },
        `▶ Simulation job started: ${scenarioId}`)

      // ── 1. Load scenario ───────────────────

      let scenario: ScenarioDefinition
      try {
        scenario = await runner.loadScenario(scenarioId)
      } catch (err) {
        log.error({ err, scenarioId }, 'Failed to load scenario')
        throw err
      }

      // ── 2. Persist initial "running" record ─

      const db = getDb()
      const simId = uuid()

      await db.insert(schema.simulationResults).values({
        id:              simId,
        tenantId,
        scenarioId:      scenario.scenario,
        scenarioName:    scenario.name,
        category:        scenario.category,
        mitreTechniques: scenario.mitre_techniques,
        expectedRules:   scenario.expected_detections,
        status:          'running',
        evaluationStatus: 'timeout',
        detectionRatePct: 0,
        detectionsFound:  0,
        eventsInjected:   0,
        gapRules:         [],
        detections:       [],
        gaps:             [],
        recommendations:  [],
        summary:          `Simulation in progress: ${scenario.name}`,
        sandboxed:        true,
        simulationMarker: `ZF_REDTEAM_SIM_${simId.replace(/-/g,'').slice(0,16)}`,
        triggeredBy,
        createdAt:        new Date(),
        updatedAt:        new Date(),
      })

      // ── 3. Run injection ───────────────────

      let result: SimulationResult
      try {
        result = await runner.runSimulation(scenario, tenantId, { dryRun })
        result = { ...result, id: simId }
      } catch (err) {
        log.error({ err, simId, scenarioId }, 'Simulation injection failed')
        await db.update(schema.simulationResults)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(schema.simulationResults.id === simId as any)
        throw err
      }

      // ── 4. Evaluate detections ─────────────

      let evaluated: SimulationResult
      try {
        evaluated = await evaluator.evaluate(result, scenario)
      } catch (err) {
        log.error({ err, simId }, 'Evaluation failed — saving partial result')
        evaluated = {
          ...result,
          status:          'completed',
          evaluationStatus: 'timeout',
          summary:         `Evaluation incomplete: ${err instanceof Error ? err.message : 'unknown'}`,
        }
      }

      // ── 5. Persist final result ────────────

      await db.update(schema.simulationResults)
        .set({
          status:           evaluated.status,
          evaluationStatus: evaluated.evaluationStatus,
          detectionRatePct: evaluated.detectionRatePct,
          detectionsFound:  evaluated.detectionsFound,
          eventsInjected:   evaluated.eventsTotal,
          gapRules:         evaluated.gapRules,
          detections:       evaluated.detections,
          gaps:             evaluated.gaps,
          recommendations:  evaluated.recommendations,
          summary:          evaluated.summary,
          simulationMarker: evaluated.simulationMarker,
          completedAt:      evaluated.completedAt ?? new Date(),
          durationMs:       evaluated.durationMs,
          updatedAt:        new Date(),
        })
        .where(schema.simulationResults.id === simId as any)

      // ── 6. Update security score ───────────

      try {
        const score = await evaluator.calculateSecurityScore(tenantId)
        await db.insert(schema.securityScores)
          .values({
            id:               uuid(),
            tenantId,
            overallScore:     score.overallScore,
            overallGrade:     score.overallGrade,
            categoryScores:   score.categoryScores,
            totalSimulations: score.totalSimulations,
            passRate:         score.passRate,
            criticalGaps:     score.criticalGaps,
            trend:            score.trend,
            calculatedAt:     new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.securityScores.tenantId],
            set: {
              overallScore:     score.overallScore,
              overallGrade:     score.overallGrade,
              categoryScores:   score.categoryScores,
              totalSimulations: score.totalSimulations,
              passRate:         score.passRate,
              criticalGaps:     score.criticalGaps,
              trend:            score.trend,
              calculatedAt:     new Date(),
            },
          })
      } catch (err) {
        log.warn({ err }, 'Security score update failed (non-fatal)')
      }

      log.info({
        simId,
        scenarioId,
        status:          evaluated.evaluationStatus,
        detectionRatePct: evaluated.detectionRatePct,
        gapCount:        evaluated.gapRules.length,
      }, `✅ Simulation complete: ${scenario.name}`)

      return {
        simId,
        evaluationStatus: evaluated.evaluationStatus,
        detectionRatePct: evaluated.detectionRatePct,
      }
    },

    {
      connection:  redis,
      concurrency: 2,   // max 2 simulations running simultaneously
      limiter: {
        max:      10,
        duration: 60_000,  // max 10 simulations per minute
      },
    },
  )

  worker.on('completed', (job, result) => {
    log.info({ jobId: job.id, ...result }, 'Simulation job completed')
  })

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err }, 'Simulation job failed')
  })

  worker.on('error', (err) => {
    log.error({ err }, 'Simulation worker error')
  })

  return worker
}

// ─────────────────────────────────────────────
// SCHEDULER
//
// Enqueues 3 random simulations every 6 hours.
// ─────────────────────────────────────────────

export function createScheduler(
  redis:     Redis,
  tenantId:  string,
  allScenarios: string[],
): NodeJS.Timeout {
  const queue = new Queue(SIMULATION_QUEUE_NAME, { connection: redis })

  const INTERVAL_MS = 6 * 60 * 60_000   // 6 hours
  const BATCH_SIZE  = 3

  async function scheduleRun() {
    // Pick 3 random scenarios
    const shuffled = [...allScenarios].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, BATCH_SIZE)

    log.info({ tenantId, scenarios: selected }, '⏰ Scheduled simulation run starting')

    for (const scenarioId of selected) {
      await queue.add(`scheduled-${scenarioId}`, {
        scenarioId,
        tenantId,
        triggeredBy: 'scheduler',
        dryRun:      false,
      }, {
        delay:       selected.indexOf(scenarioId) * 30_000,   // stagger by 30s each
        priority:    10,   // lower priority than manual runs
      })
    }
  }

  return setInterval(scheduleRun, INTERVAL_MS)
}
