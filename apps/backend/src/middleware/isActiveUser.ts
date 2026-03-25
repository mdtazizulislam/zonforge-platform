import type { MiddlewareHandler } from 'hono'
import { getPool } from '../db.js'
import { verifyJWT } from '../auth.js'

export const isActiveUser: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.replace('Bearer ', '')
  const payload = verifyJWT(token)
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  const pool = getPool()
  const result = await pool.query(
    `SELECT status
     FROM subscriptions
     WHERE user_id = $1
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [payload.userId],
  )

  const status = String(result.rows[0]?.status ?? '').toLowerCase()
  if (status !== 'active') {
    return c.json({ error: 'Active subscription required' }, 403)
  }

  c.set('authUserId', payload.userId)
  await next()
}