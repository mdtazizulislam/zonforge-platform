import { z } from 'zod'

// ─────────────────────────────────────────────
// BEHAVIORAL AI — DOMAIN TYPES
// ─────────────────────────────────────────────

export type BehaviorDimension =
  | 'login_time'           // hour-of-day distribution
  | 'login_location'       // country/city distribution
  | 'login_device'         // device/OS fingerprint
  | 'file_access_volume'   // files accessed per session
  | 'download_volume'      // bytes/files downloaded per day
  | 'api_call_volume'      // API calls per hour
  | 'email_recipients'     // unique recipients per day
  | 'admin_actions'        // privilege-use frequency
  | 'off_hours_activity'   // activity outside normal hours
  | 'geo_velocity'         // speed between login locations

export type AnomalyMethod =
  | 'z_score'              // statistical deviation from mean
  | 'iqr_fence'            // interquartile range outlier
  | 'peer_comparison'      // vs. cohort median
  | 'temporal_pattern'     // time-of-day anomaly
  | 'velocity_check'       // impossible travel / rapid change

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low' | 'normal'

// ─────────────────────────────────────────────
// USER BEHAVIORAL PROFILE
// ─────────────────────────────────────────────

export interface LoginTimeDistribution {
  hourCounts:    number[]    // 24 values, count per hour
  weekdayCounts: number[]    // 7 values, count per weekday
  typicalStart:  number      // typical workday start hour
  typicalEnd:    number      // typical workday end hour
  timezone:      string
}

export interface LocationProfile {
  knownCountries:  string[]
  knownCities:     string[]
  knownAsns:       string[]
  primaryCountry:  string
  primaryCity:     string
  travelVelocityOk: boolean
}

export interface VolumeStats {
  mean:   number
  stddev: number
  p50:    number
  p75:    number
  p90:    number
  p99:    number
  max:    number
  sampleCount: number
}

export interface UserBehaviorProfile {
  id:           string
  tenantId:     string
  userId:       string
  userEmail:    string
  buildDate:    Date
  windowDays:   number    // rolling window used

  // Baseline metrics
  loginTime:          LoginTimeDistribution
  locations:          LocationProfile
  fileAccessVolume:   VolumeStats   // files/session
  downloadVolume:     VolumeStats   // files/day
  apiCallVolume:      VolumeStats   // calls/hour
  emailRecipients:    VolumeStats   // unique recipients/day
  adminActionRate:    VolumeStats   // admin actions/day
  offHoursRatio:      number        // 0–1, fraction of activity off-hours

  // Peer context
  peerGroup:          string        // e.g. "finance_dept", "engineering"
  peerCount:          number
  peerFileAccessP50:  number
  peerDownloadP50:    number

  // Profile quality
  dataPoints:         number        // total events used to build profile
  confidence:         number        // 0–100, how reliable this profile is
  isStable:           boolean       // enough data for reliable baseline
}

// ─────────────────────────────────────────────
// BEHAVIORAL ANOMALY
// ─────────────────────────────────────────────

export interface BehavioralAnomaly {
  id:             string
  tenantId:       string
  userId:         string
  userEmail:      string
  detectedAt:     Date

  dimension:      BehaviorDimension
  method:         AnomalyMethod
  severity:       AnomalySeverity
  anomalyScore:   number     // 0–100 (100 = most anomalous)
  zScore?:        number     // statistical z-score when applicable

  // What was observed vs. expected
  observedValue:  number | string
  expectedValue:  number | string
  deviation:      string        // human-readable deviation description

  // Context
  eventId?:       string
  alertId?:       string
  triggerContext: Record<string, unknown>

  // Suppression
  suppressed:     boolean
  suppressReason?: string
}

// ─────────────────────────────────────────────
// REAL-TIME DEVIATION CHECK
// ─────────────────────────────────────────────

export interface DeviationCheckRequest {
  tenantId:   string
  userId:     string
  userEmail:  string
  eventType:  string
  metrics: {
    hour?:           number   // 0-23
    country?:        string
    city?:           string
    asn?:            string
    fileCount?:      number
    downloadCount?:  number
    apiCalls?:       number
    emailCount?:     number
    isOffHours?:     boolean
    isAdminAction?:  boolean
    sourceIp?:       string
  }
}

export interface DeviationCheckResult {
  userId:      string
  anomalies:   BehavioralAnomaly[]
  maxScore:    number
  shouldAlert: boolean
  summary:     string
}

// ─────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────

export const BuildProfileSchema = z.object({
  userId:     z.string().optional(),  // all users if omitted
  windowDays: z.number().int().min(7).max(90).default(30),
  force:      z.boolean().default(false),
})

export const DeviationCheckSchema = z.object({
  tenantId:  z.string(),
  userId:    z.string(),
  userEmail: z.string(),
  eventType: z.string(),
  metrics:   z.record(z.unknown()).default({}),
})

// ─────────────────────────────────────────────
// STATISTICAL HELPERS
// ─────────────────────────────────────────────

export function computeStats(values: number[]): VolumeStats {
  if (values.length === 0) {
    return { mean: 0, stddev: 0, p50: 0, p75: 0, p90: 0, p99: 0, max: 0, sampleCount: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const n      = sorted.length
  const mean   = values.reduce((s, v) => s + v, 0) / n
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const stddev = Math.sqrt(variance)

  const pct = (p: number) => sorted[Math.floor((p / 100) * (n - 1))] ?? 0

  return {
    mean:   Math.round(mean * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    p50:    pct(50),
    p75:    pct(75),
    p90:    pct(90),
    p99:    pct(99),
    max:    sorted[n - 1] ?? 0,
    sampleCount: n,
  }
}

export function computeZScore(value: number, mean: number, stddev: number): number {
  if (stddev === 0) return value > mean ? 10 : 0
  return Math.abs((value - mean) / stddev)
}

export function zScoreToSeverity(z: number): AnomalySeverity {
  if (z >= 5)   return 'critical'
  if (z >= 3.5) return 'high'
  if (z >= 2.5) return 'medium'
  if (z >= 2.0) return 'low'
  return 'normal'
}

export function zScoreToAnomalyScore(z: number): number {
  // Map z-score to 0-100 anomaly score
  // z=2 → 50, z=3 → 70, z=5 → 90+
  return Math.min(100, Math.round(z * 18))
}
