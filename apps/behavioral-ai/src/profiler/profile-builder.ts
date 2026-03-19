import { createLogger } from '@zonforge/logger'
import { v4 as uuid } from 'uuid'
import {
  computeStats, computeZScore,
  type UserBehaviorProfile, type LoginTimeDistribution,
  type LocationProfile, type VolumeStats,
} from '../models/behavior.js'

const log = createLogger({ service: 'behavioral-ai:profiler' })

// ─────────────────────────────────────────────
// USER BEHAVIOR PROFILE BUILDER
//
// Queries ClickHouse for raw events and computes
// statistical baseline for each user dimension.
//
// Window: 30-day rolling (configurable 7-90 days)
// Minimum events: 50 for a stable profile
// ─────────────────────────────────────────────

export class ProfileBuilder {
  private readonly chHost: string

  constructor() {
    this.chHost = process.env['ZONFORGE_CLICKHOUSE_HOST'] ?? 'http://localhost:8123'
  }

  // ── Build profile for a single user ──────────

  async buildUserProfile(
    tenantId:   string,
    userId:     string,
    userEmail:  string,
    windowDays: number = 30,
  ): Promise<UserBehaviorProfile> {
    const cutoff = new Date(Date.now() - windowDays * 86_400_000)

    log.debug({ tenantId, userId, windowDays }, 'Building behavioral profile')

    // Fetch all required metrics in parallel from ClickHouse
    const [
      loginHours,
      loginCountries,
      loginCities,
      loginAsns,
      dailyFileAccess,
      dailyDownloads,
      hourlyApiCalls,
      dailyEmailCount,
      dailyAdminActions,
      offHoursEvents,
      totalEvents,
    ] = await Promise.all([
      this.queryLoginHours(tenantId, userId, cutoff),
      this.queryLoginCountries(tenantId, userId, cutoff),
      this.queryLoginCities(tenantId, userId, cutoff),
      this.queryLoginAsns(tenantId, userId, cutoff),
      this.queryDailyMetric(tenantId, userId, cutoff, 'file_access_per_day'),
      this.queryDailyMetric(tenantId, userId, cutoff, 'downloads_per_day'),
      this.queryHourlyMetric(tenantId, userId, cutoff, 'api_calls_per_hour'),
      this.queryDailyMetric(tenantId, userId, cutoff, 'email_recipients_per_day'),
      this.queryDailyMetric(tenantId, userId, cutoff, 'admin_actions_per_day'),
      this.queryOffHoursRatio(tenantId, userId, cutoff),
      this.queryTotalEventCount(tenantId, userId, cutoff),
    ])

    // Build hour-of-day distribution
    const hourCounts = Array(24).fill(0)
    for (const { hour, count } of loginHours) {
      hourCounts[hour] = count
    }

    // Find typical work hours (top 80% of activity)
    const maxCount = Math.max(...hourCounts)
    const threshold = maxCount * 0.2
    const activeHours = hourCounts.map((c, i) => c >= threshold ? i : -1).filter(h => h >= 0)
    const typicalStart = activeHours[0] ?? 8
    const typicalEnd   = activeHours[activeHours.length - 1] ?? 18

    // Build weekday distribution (simplified)
    const weekdayCounts = Array(7).fill(Math.round(totalEvents / 7))

    const loginTime: LoginTimeDistribution = {
      hourCounts,
      weekdayCounts,
      typicalStart,
      typicalEnd,
      timezone: 'UTC',   // would detect from events in production
    }

    // Location profile
    const primaryCountry = loginCountries[0]?.country ?? 'US'
    const primaryCity    = loginCities[0]?.city ?? 'Unknown'

    const locations: LocationProfile = {
      knownCountries: loginCountries.map(r => r.country),
      knownCities:    loginCities.map(r => r.city),
      knownAsns:      loginAsns.map(r => r.asn),
      primaryCountry,
      primaryCity,
      travelVelocityOk: true,
    }

    // Volume statistics
    const fileAccessVolume = computeStats(dailyFileAccess)
    const downloadVolume   = computeStats(dailyDownloads)
    const apiCallVolume    = computeStats(hourlyApiCalls)
    const emailRecipients  = computeStats(dailyEmailCount)
    const adminActionRate  = computeStats(dailyAdminActions)

    // Profile confidence (based on data volume)
    const confidence = Math.min(100, Math.round((totalEvents / 200) * 100))
    const isStable   = totalEvents >= 50

    log.info({
      tenantId, userId, totalEvents, confidence, isStable, windowDays,
    }, 'Behavioral profile built')

    return {
      id:           uuid(),
      tenantId,
      userId,
      userEmail,
      buildDate:    new Date(),
      windowDays,

      loginTime,
      locations,
      fileAccessVolume,
      downloadVolume,
      apiCallVolume,
      emailRecipients,
      adminActionRate,
      offHoursRatio: offHoursEvents,

      // Peer defaults (would be computed across cohort in production)
      peerGroup:         'default',
      peerCount:         0,
      peerFileAccessP50: fileAccessVolume.p50 * 0.9,
      peerDownloadP50:   downloadVolume.p50 * 0.9,

      dataPoints:  totalEvents,
      confidence,
      isStable,
    }
  }

  // ── ClickHouse queries ────────────────────────

  private async query<T>(sql: string): Promise<T[]> {
    try {
      const ac = new AbortController()
      const timeout = setTimeout(() => ac.abort(), 15_000)
      let resp: Response
      try {
        resp = await fetch(
          `${this.chHost}/?readonly=1&output_format_json_quote_64bit_integers=1&format=JSON`,
          {
            method:  'POST',
            headers: {
              'X-ClickHouse-Database': 'zonforge_events',
              'X-ClickHouse-User':     process.env['ZONFORGE_CLICKHOUSE_USER'] ?? 'default',
              'X-ClickHouse-Key':      process.env['ZONFORGE_CLICKHOUSE_PASS'] ?? '',
            },
            body:   sql,
            signal: ac.signal,
          },
        )
      } finally {
        clearTimeout(timeout)
      }
      if (!resp.ok) return []
      const data = await resp.json() as { data?: T[] }
      return data.data ?? []
    } catch {
      return []
    }
  }

  private async queryLoginHours(
    tenantId: string, userId: string, cutoff: Date,
  ): Promise<Array<{ hour: number; count: number }>> {
    return this.query(`
      SELECT toHour(event_time) AS hour, count() AS count
      FROM events
      WHERE tenant_id = '${tenantId}'
        AND actor_user_id = '${userId.replace(/'/g, '')}'
        AND event_action IN ('login', 'authenticate')
        AND event_time >= '${cutoff.toISOString()}'
      GROUP BY hour ORDER BY hour
    `)
  }

  private async queryLoginCountries(
    tenantId: string, userId: string, cutoff: Date,
  ): Promise<Array<{ country: string; count: number }>> {
    return this.query(`
      SELECT actor_ip_country AS country, count() AS count
      FROM events
      WHERE tenant_id = '${tenantId}'
        AND actor_user_id = '${userId.replace(/'/g, '')}'
        AND actor_ip_country IS NOT NULL AND actor_ip_country != ''
        AND event_time >= '${cutoff.toISOString()}'
      GROUP BY country ORDER BY count DESC LIMIT 20
    `)
  }

  private async queryLoginCities(
    tenantId: string, userId: string, cutoff: Date,
  ): Promise<Array<{ city: string; count: number }>> {
    return this.query(`
      SELECT JSONExtractString(raw_event, 'city') AS city, count() AS count
      FROM events
      WHERE tenant_id = '${tenantId}'
        AND actor_user_id = '${userId.replace(/'/g, '')}'
        AND event_time >= '${cutoff.toISOString()}'
        AND city != ''
      GROUP BY city ORDER BY count DESC LIMIT 20
    `)
  }

  private async queryLoginAsns(
    tenantId: string, userId: string, cutoff: Date,
  ): Promise<Array<{ asn: string }>> {
    return this.query(`
      SELECT DISTINCT JSONExtractString(raw_event, 'asn') AS asn
      FROM events
      WHERE tenant_id = '${tenantId}'
        AND actor_user_id = '${userId.replace(/'/g, '')}'
        AND event_time >= '${cutoff.toISOString()}'
        AND asn != ''
      LIMIT 20
    `)
  }

  private async queryDailyMetric(
    tenantId: string, userId: string, cutoff: Date, metric: string,
  ): Promise<number[]> {
    let eventFilter = ''
    switch (metric) {
      case 'file_access_per_day':
        eventFilter = `AND event_action IN ('FileAccessed','FileDownloaded','GetObject','file_access')`; break
      case 'downloads_per_day':
        eventFilter = `AND event_action IN ('FileDownloaded','GetObject','file_download')`; break
      case 'email_recipients_per_day':
        eventFilter = `AND event_category = 'email'`; break
      case 'admin_actions_per_day':
        eventFilter = `AND event_category = 'iam'`; break
    }

    const rows = await this.query<{ day: string; cnt: number }>(`
      SELECT toDate(event_time) AS day, count() AS cnt
      FROM events
      WHERE tenant_id = '${tenantId}'
        AND actor_user_id = '${userId.replace(/'/g, '')}'
        AND event_time >= '${cutoff.toISOString()}'
        ${eventFilter}
      GROUP BY day ORDER BY day
    `)

    return rows.map(r => Number(r.cnt))
  }

  private async queryHourlyMetric(
    tenantId: string, userId: string, cutoff: Date, _metric: string,
  ): Promise<number[]> {
    const rows = await this.query<{ hour: string; cnt: number }>(`
      SELECT toStartOfHour(event_time) AS hour, count() AS cnt
      FROM events
      WHERE tenant_id = '${tenantId}'
        AND actor_user_id = '${userId.replace(/'/g, '')}'
        AND event_time >= '${cutoff.toISOString()}'
      GROUP BY hour ORDER BY hour
    `)
    return rows.map(r => Number(r.cnt))
  }

  private async queryOffHoursRatio(
    tenantId: string, userId: string, cutoff: Date,
  ): Promise<number> {
    const rows = await this.query<{ off_hours: number; total: number }>(`
      SELECT
        countIf(toHour(event_time) < 7 OR toHour(event_time) >= 22) AS off_hours,
        count() AS total
      FROM events
      WHERE tenant_id = '${tenantId}'
        AND actor_user_id = '${userId.replace(/'/g, '')}'
        AND event_time >= '${cutoff.toISOString()}'
    `)
    const row = rows[0]
    if (!row || !row.total) return 0
    return Math.round((Number(row.off_hours) / Number(row.total)) * 100) / 100
  }

  private async queryTotalEventCount(
    tenantId: string, userId: string, cutoff: Date,
  ): Promise<number> {
    const rows = await this.query<{ cnt: number }>(`
      SELECT count() AS cnt
      FROM events
      WHERE tenant_id = '${tenantId}'
        AND actor_user_id = '${userId.replace(/'/g, '')}'
        AND event_time >= '${cutoff.toISOString()}'
    `)
    return Number(rows[0]?.cnt ?? 0)
  }

  // ── Get distinct users from events ───────────

  async getActiveUsers(
    tenantId:   string,
    windowDays: number,
  ): Promise<Array<{ userId: string; email: string }>> {
    const cutoff = new Date(Date.now() - windowDays * 86_400_000)

    const rows = await this.query<{ user_id: string; email: string }>(`
      SELECT
        actor_user_id AS user_id,
        actor_user_id AS email
      FROM events
      WHERE tenant_id = '${tenantId}'
        AND actor_user_id IS NOT NULL
        AND actor_user_id != ''
        AND event_time >= '${cutoff.toISOString()}'
      GROUP BY actor_user_id
      HAVING count() >= 10
      LIMIT 1000
    `)

    return rows.map(r => ({ userId: r.user_id, email: r.email }))
  }
}
