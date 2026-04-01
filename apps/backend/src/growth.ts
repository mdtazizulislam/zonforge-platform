import { getPool } from './db.js';

export type ConversionEventName = 'signup' | 'login' | 'checkout_started' | 'checkout_completed';

export async function trackConversionEvent(input: {
  eventName: ConversionEventName;
  userId?: number | null;
  tenantId?: number | null;
  sessionId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO conversion_events (
      event_name,
      user_id,
      tenant_id,
      session_id,
      source,
      metadata_json
    ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.eventName,
      input.userId ?? null,
      input.tenantId ?? null,
      input.sessionId ?? null,
      input.source ?? 'backend',
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

export async function trackAnalyticsEvent(input: {
  eventName: string;
  userId?: number | null;
  tenantId?: number | null;
  pagePath?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO analytics_events (
      event_name,
      user_id,
      tenant_id,
      page_path,
      source,
      metadata_json
    ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.eventName,
      input.userId ?? null,
      input.tenantId ?? null,
      input.pagePath ?? null,
      input.source ?? 'web',
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

export async function storeSupportRequest(input: {
  name: string;
  email: string;
  topic: string;
  message: string;
  userId?: number | null;
  tenantId?: number | null;
}) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO support_requests (
      name,
      email,
      topic,
      message,
      user_id,
      tenant_id
    ) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id, created_at`,
    [
      input.name,
      input.email,
      input.topic,
      input.message,
      input.userId ?? null,
      input.tenantId ?? null,
    ],
  );

  return result.rows[0];
}

export async function storeErrorReport(input: {
  message: string;
  pagePath?: string | null;
  stack?: string | null;
  userId?: number | null;
  tenantId?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO error_reports (
      message,
      page_path,
      stack,
      user_id,
      tenant_id,
      metadata_json
    ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.message,
      input.pagePath ?? null,
      input.stack ?? null,
      input.userId ?? null,
      input.tenantId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

export async function createEmailVerificationToken(userId: number): Promise<string> {
  const pool = getPool();
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at)
     VALUES ($1,$2,$3)`,
    [userId, token, expiresAt],
  );

  return token;
}

export async function consumeEmailVerificationToken(token: string): Promise<number | null> {
  const pool = getPool();

  const result = await pool.query(
    `UPDATE email_verification_tokens
     SET consumed_at = NOW()
     WHERE token = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     RETURNING user_id`,
    [token],
  );

  if (!result.rows[0]?.user_id) {
    return null;
  }

  const userId = Number(result.rows[0].user_id);
  await pool.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [userId]);
  return userId;
}

export async function getConversionFunnelSummary(hours = 24) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT event_name, COUNT(*)::int AS count
     FROM conversion_events
     WHERE created_at > NOW() - ($1::text || ' hours')::interval
     GROUP BY event_name`,
    [String(hours)],
  );

  const summary: Record<string, number> = {
    signup: 0,
    login: 0,
    checkout_started: 0,
    checkout_completed: 0,
  };

  for (const row of result.rows) {
    summary[String(row.event_name)] = Number(row.count);
  }

  return summary;
}
