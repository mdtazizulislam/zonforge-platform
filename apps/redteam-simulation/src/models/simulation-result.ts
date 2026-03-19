import { z } from 'zod'

// ─────────────────────────────────────────────
// SIMULATION DOMAIN TYPES
// ─────────────────────────────────────────────

export type SimulationStatus =
  | 'pending'
  | 'running'
  | 'evaluating'
  | 'completed'
  | 'failed'
  | 'aborted'

export type StepStatus = 'pending' | 'injected' | 'skipped' | 'failed'

export type EvaluationStatus = 'pass' | 'fail' | 'partial' | 'timeout'

// ─────────────────────────────────────────────
// SCENARIO DEFINITION (parsed from YAML)
// ─────────────────────────────────────────────

export interface ScenarioStep {
  step:        number
  name:        string
  event_type:  string
  count:       number
  delay_ms:    number
  params:      Record<string, unknown>
  description: string
}

export interface ScenarioEvaluation {
  require_alert:        boolean
  require_severity:     string[]
  detection_window_ms:  number
  pass_threshold_pct:   number
}

export interface ScenarioDefinition {
  scenario:             string
  version:              string
  name:                 string
  description:          string
  mitre_tactics:        string[]
  mitre_techniques:     string[]
  severity:             string
  expected_detections:  string[]
  category:             string
  steps:                ScenarioStep[]
  evaluation:           ScenarioEvaluation
}

// ─────────────────────────────────────────────
// STEP EXECUTION RESULT
// ─────────────────────────────────────────────

export interface StepResult {
  step:           number
  name:           string
  status:         StepStatus
  eventsInjected: number
  injectedAt:     Date | null
  durationMs:     number
  error?:         string
}

// ─────────────────────────────────────────────
// DETECTION OBSERVATION
// ─────────────────────────────────────────────

export interface DetectionObservation {
  ruleId:           string
  alertId?:         string
  detectedAt:       Date
  severity:         string
  detectionGapMs:   number   // ms from first injected event to detection
  isExpected:       boolean
}

// ─────────────────────────────────────────────
// SIMULATION RUN RESULT
// ─────────────────────────────────────────────

export interface SimulationResult {
  id:              string
  tenantId:        string
  scenarioId:      string
  scenarioName:    string
  category:        string
  mitreTechniques: string[]
  expectedRules:   string[]
  status:          SimulationStatus

  // Execution
  startedAt:    Date
  completedAt:  Date | null
  durationMs:   number
  stepsTotal:   number
  stepsInjected: number
  eventsTotal:   number

  // Detection
  detectionsExpected: number
  detectionsFound:    number
  detections:         DetectionObservation[]

  // Evaluation
  evaluationStatus:  EvaluationStatus
  detectionRatePct:  number          // 0–100
  gapRules:          string[]        // rules that should have fired but didn't
  detectionGapMs?:   number          // avg gap between injection and detection

  // Narrative
  summary:         string
  gaps:            string[]
  recommendations: string[]

  // Safety
  sandboxed:  true
  simulationMarker: string   // unique marker injected into all events for easy cleanup
}

// ─────────────────────────────────────────────
// SECURITY SCORE
// ─────────────────────────────────────────────

export interface CategoryScore {
  category:        string
  lastRunAt:       Date
  totalRuns:       number
  passCount:       number
  failCount:       number
  partialCount:    number
  avgDetectionPct: number
  trend:           'improving' | 'degrading' | 'stable'
  trendDelta:      number   // percentage points change vs previous period
}

export interface SecurityScore {
  tenantId:          string
  overallScore:      number    // 0–100
  overallGrade:      'A' | 'B' | 'C' | 'D' | 'F'
  categoryScores:    CategoryScore[]
  totalSimulations:  number
  passRate:          number
  criticalGaps:      string[]  // categories with <70% detection
  lastCalculatedAt:  Date
  trend:             'improving' | 'degrading' | 'stable'
}

// ─────────────────────────────────────────────
// ZOD SCHEMAS (for API validation)
// ─────────────────────────────────────────────

export const RunSimulationSchema = z.object({
  scenarioId: z.string().optional(),
  category:   z.string().optional(),
  runAll:     z.boolean().default(false),
  dryRun:     z.boolean().default(false),
})

export const SimulationQuerySchema = z.object({
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  status:   z.string().optional(),
  category: z.string().optional(),
  scenarioId: z.string().optional(),
})

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

export const SIMULATION_MARKER_PREFIX = 'ZF_REDTEAM_SIM_'
export const SIMULATION_TENANT_PREFIX = 'sim-'

export const GRADE_THRESHOLDS: Record<SecurityScore['overallGrade'], number> = {
  A: 90,
  B: 80,
  C: 70,
  D: 60,
  F: 0,
}

export function scoreToGrade(score: number): SecurityScore['overallGrade'] {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}
