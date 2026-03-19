import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

// ─────────────────────────────────────────────
// PostgreSQL Connection
// ─────────────────────────────────────────────

let _client: ReturnType<typeof postgres> | null = null
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export interface PostgresConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl: boolean
  poolMin: number
  poolMax: number
}

export function createPostgresClient(config: PostgresConfig) {
  const client = postgres({
    host:     config.host,
    port:     config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl:      config.ssl ? { rejectUnauthorized: true } : false,
    max:      config.poolMax,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: postgres.camel,
    onnotice: () => {},
  })

  return drizzle(client, { schema, logger: process.env['ZONFORGE_ENV'] === 'development' })
}

export function getDb() {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

export function initDb(config: PostgresConfig) {
  if (_db) return _db
  const client = postgres({
    host:     config.host,
    port:     config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    ssl:      config.ssl ? { rejectUnauthorized: true } : false,
    max:      config.poolMax,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: postgres.camel,
  })
  _client = client
  _db = drizzle(client, { schema })
  return _db
}

export async function closeDb() {
  if (_client) {
    await _client.end()
    _client = null
    _db = null
  }
}

// Re-export schema and drizzle operators for convenience
export { schema }
export { eq, and, or, not, gt, gte, lt, lte, inArray, notInArray,
         isNull, isNotNull, like, ilike, desc, asc, count, sum, avg,
         max, min, sql } from 'drizzle-orm'
