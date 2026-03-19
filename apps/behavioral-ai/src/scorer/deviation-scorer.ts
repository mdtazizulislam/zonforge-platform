import { v4 as uuid } from 'uuid'
import { createLogger } from '@zonforge/logger'
import {
  computeZScore, zScoreToSeverity, zScoreToAnomalyScore,
  type UserBehaviorProfile, type BehavioralAnomaly,
  type DeviationCheckRequest, type DeviationCheckResult,
  type AnomalyMethod,
} from '../models/behavior.js'

const log = createLogger({ service: 'behavioral-ai:scorer' })

// ─────────────────────────────────────────────
// REAL-TIME DEVIATION SCORER
//
// Receives live event metrics and compares against
// the stored behavioral baseline. Returns anomaly
// list with severity and z-scores.
//
// Checks run in <5ms (all in-memory math).
// ─────────────────────────────────────────────

export class DeviationScorer {

  // ── Main check entry point ────────────────────

  scoreDeviation(
    request: DeviationCheckRequest,
    profile: UserBehaviorProfile,
  ): DeviationCheckResult {
    if (!profile.isStable) {
      // Not enough data for reliable baseline
      return {
        userId:      request.userId,
        anomalies:   [],
        maxScore:    0,
        shouldAlert: false,
        summary:     `Insufficient baseline data (${profile.dataPoints} events, need 50+)`,
      }
    }

    const anomalies: BehavioralAnomaly[] = []
    const m = request.metrics

    // ── 1. Login time anomaly ──────────────────

    if (m.hour !== undefined) {
      const anomaly = this.checkLoginTime(request, profile, m.hour)
      if (anomaly) anomalies.push(anomaly)
    }

    // ── 2. New country / location anomaly ─────

    if (m.country) {
      const anomaly = this.checkNewLocation(request, profile, m.country, m.city)
      if (anomaly) anomalies.push(anomaly)
    }

    // ── 3. File access volume anomaly ─────────

    if (m.fileCount !== undefined && m.fileCount > 0) {
      const anomaly = this.checkVolumeAnomaly(
        request, profile,
        'file_access_volume',
        profile.fileAccessVolume,
        m.fileCount,
        'files accessed in session',
        'z_score',
      )
      if (anomaly) anomalies.push(anomaly)
    }

    // ── 4. Download volume anomaly ────────────

    if (m.downloadCount !== undefined && m.downloadCount > 0) {
      const anomaly = this.checkVolumeAnomaly(
        request, profile,
        'download_volume',
        profile.downloadVolume,
        m.downloadCount,
        'files downloaded today',
        'z_score',
      )
      if (anomaly) anomalies.push(anomaly)
    }

    // ── 5. API call volume anomaly ────────────

    if (m.apiCalls !== undefined && m.apiCalls > 0) {
      const anomaly = this.checkVolumeAnomaly(
        request, profile,
        'api_call_volume',
        profile.apiCallVolume,
        m.apiCalls,
        'API calls this hour',
        'iqr_fence',
      )
      if (anomaly) anomalies.push(anomaly)
    }

    // ── 6. Off-hours activity ─────────────────

    if (m.isOffHours) {
      const anomaly = this.checkOffHours(request, profile)
      if (anomaly) anomalies.push(anomaly)
    }

    // ── 7. Admin action anomaly ───────────────

    if (m.isAdminAction) {
      const anomaly = this.checkAdminAction(request, profile)
      if (anomaly) anomalies.push(anomaly)
    }

    // ── 8. Peer comparison (file downloads) ───

    if (m.downloadCount !== undefined && profile.peerCount > 5) {
      const anomaly = this.checkPeerComparison(request, profile, m.downloadCount)
      if (anomaly) anomalies.push(anomaly)
    }

    // Aggregate
    const maxScore    = anomalies.length > 0 ? Math.max(...anomalies.map(a => a.anomalyScore)) : 0
    const shouldAlert = anomalies.some(a => ['critical','high'].includes(a.severity))

    const summary = anomalies.length === 0
      ? 'Activity within normal behavioral baseline'
      : `${anomalies.length} behavioral anomal${anomalies.length === 1 ? 'y' : 'ies'} detected. Max score: ${maxScore}. ${anomalies.filter(a => a.severity === 'critical').length > 0 ? '⚠️ CRITICAL anomaly present.' : ''}`

    return { userId: request.userId, anomalies, maxScore, shouldAlert, summary }
  }

  // ── Individual check methods ──────────────────

  private checkLoginTime(
    req:     DeviationCheckRequest,
    profile: UserBehaviorProfile,
    hour:    number,
  ): BehavioralAnomaly | null {
    const dist = profile.loginTime
    const total = dist.hourCounts.reduce((s, c) => s + c, 0)
    if (total === 0) return null

    const hourActivity = dist.hourCounts[hour] ?? 0
    const hourFraction = hourActivity / total

    // Flag if this hour has < 2% of normal activity
    if (hourFraction > 0.02) return null

    const typicalActivity = dist.hourCounts
      .slice(dist.typicalStart, dist.typicalEnd + 1)
      .reduce((s, c) => s + c, 0)

    // Off typical hours
    if (hour >= dist.typicalStart && hour <= dist.typicalEnd) return null

    const severity  = hourFraction === 0 ? 'high' : 'medium'
    const score     = hourFraction === 0 ? 75 : 50

    return this.makeAnomaly(req, 'login_time', 'temporal_pattern', severity, score,
      `${hour}:00 UTC (${hourActivity > 0 ? hourFraction.toFixed(1) + '% of usual' : 'never seen'})`,
      `${dist.typicalStart}:00–${dist.typicalEnd}:00 UTC`,
      `Login at ${hour}:00 UTC is outside normal work hours (${dist.typicalStart}:00–${dist.typicalEnd}:00)`,
    )
  }

  private checkNewLocation(
    req:     DeviationCheckRequest,
    profile: UserBehaviorProfile,
    country: string,
    city?:   string,
  ): BehavioralAnomaly | null {
    const known = profile.locations.knownCountries

    if (known.includes(country)) return null

    const isPrimary   = profile.locations.primaryCountry === country
    if (isPrimary) return null

    const severity = known.length > 0 ? 'high' : 'medium'
    const score    = known.length > 0 ? 80 : 50
    const location = city ? `${city}, ${country}` : country

    return this.makeAnomaly(req, 'login_location', 'peer_comparison', severity, score,
      location,
      `Known locations: ${known.slice(0, 3).join(', ')}${known.length > 3 ? '…' : ''}`,
      `Login from previously unseen country: ${country}. User has ${known.length} known locations.`,
    )
  }

  private checkVolumeAnomaly(
    req:       DeviationCheckRequest,
    profile:   UserBehaviorProfile,
    dimension: any,
    stats:     { mean: number; stddev: number; p99: number; sampleCount: number },
    observed:  number,
    label:     string,
    method:    AnomalyMethod,
  ): BehavioralAnomaly | null {
    if (stats.sampleCount < 5) return null
    if (observed <= stats.p99) return null  // within historical max

    let anomalyScore: number
    let zScore: number | undefined

    if (method === 'z_score') {
      zScore       = computeZScore(observed, stats.mean, stats.stddev)
      anomalyScore = zScoreToAnomalyScore(zScore)
      if (zScore < 2.0) return null
    } else {
      // IQR fence
      const q75      = stats.p99 * 0.75   // simplified
      const iqr      = stats.p99 - stats.mean
      const fence    = q75 + 1.5 * iqr
      if (observed <= fence) return null
      zScore        = computeZScore(observed, stats.mean, stats.stddev)
      anomalyScore  = zScoreToAnomalyScore(zScore)
    }

    const severity = zScoreToSeverity(zScore ?? 2)

    return {
      ...this.makeAnomaly(req, dimension, method, severity, anomalyScore,
        `${observed} ${label}`,
        `Normal: μ=${stats.mean.toFixed(0)} σ=${stats.stddev.toFixed(0)} p99=${stats.p99}`,
        `${observed} ${label} is ${Math.round(observed / Math.max(stats.mean, 1))}× above average (z=${zScore?.toFixed(1)})`,
      ),
      zScore,
    }
  }

  private checkOffHours(
    req:     DeviationCheckRequest,
    profile: UserBehaviorProfile,
  ): BehavioralAnomaly | null {
    // Only flag if user historically has < 10% off-hours activity
    if (profile.offHoursRatio > 0.10) return null

    return this.makeAnomaly(req, 'off_hours_activity', 'temporal_pattern', 'medium', 55,
      'Activity at off-hours time',
      `Historical off-hours ratio: ${(profile.offHoursRatio * 100).toFixed(0)}%`,
      `User has ${(profile.offHoursRatio * 100).toFixed(0)}% off-hours baseline but is active now`,
    )
  }

  private checkAdminAction(
    req:     DeviationCheckRequest,
    profile: UserBehaviorProfile,
  ): BehavioralAnomaly | null {
    // Flag admin actions from users who rarely perform them
    const { mean, p99 } = profile.adminActionRate
    if (mean >= 1.0) return null  // admin actions are normal for this user

    return this.makeAnomaly(req, 'admin_actions', 'z_score', 'high', 70,
      'Admin action performed',
      `Average: ${mean.toFixed(2)} admin actions/day`,
      `User rarely performs admin actions (avg ${mean.toFixed(2)}/day) but did one now`,
    )
  }

  private checkPeerComparison(
    req:      DeviationCheckRequest,
    profile:  UserBehaviorProfile,
    observed: number,
  ): BehavioralAnomaly | null {
    const peerMedian = profile.peerDownloadP50
    if (peerMedian === 0 || observed <= peerMedian * 5) return null

    const ratio = Math.round(observed / peerMedian)
    return this.makeAnomaly(req, 'download_volume', 'peer_comparison', 'high', Math.min(90, ratio * 10),
      `${observed} (${ratio}× peer median)`,
      `Peer median: ${peerMedian}`,
      `${observed} downloads is ${ratio}× peer median (${peerMedian}). Statistical outlier.`,
    )
  }

  // ── Helper ────────────────────────────────────

  private makeAnomaly(
    req:           DeviationCheckRequest,
    dimension:     any,
    method:        AnomalyMethod,
    severity:      any,
    anomalyScore:  number,
    observedValue: string,
    expectedValue: string,
    deviation:     string,
  ): BehavioralAnomaly {
    return {
      id:             uuid(),
      tenantId:       req.tenantId,
      userId:         req.userId,
      userEmail:      req.userEmail,
      detectedAt:     new Date(),
      dimension,
      method,
      severity,
      anomalyScore,
      observedValue,
      expectedValue,
      deviation,
      triggerContext: req.metrics as Record<string, unknown>,
      suppressed:     false,
    }
  }
}
