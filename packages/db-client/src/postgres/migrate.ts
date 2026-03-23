import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// ─────────────────────────────────────────────
// ZonForge Sentinel — Database Migration Runner
// Run: node dist/postgres/migrate.js
// ─────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolvePostgresUrl(): string {
  const explicitUrl = process.env['ZONFORGE_POSTGRES_URL']
  if (explicitUrl) return explicitUrl

  const host = process.env['ZONFORGE_POSTGRES_HOST']
  const port = process.env['ZONFORGE_POSTGRES_PORT'] ?? '5432'
  const db   = process.env['ZONFORGE_POSTGRES_DB']
  const user = process.env['ZONFORGE_POSTGRES_USER']
  const pass = process.env['ZONFORGE_POSTGRES_PASSWORD']

  if (!host || !db || !user || !pass) {
    throw new Error('Missing PostgreSQL configuration: set ZONFORGE_POSTGRES_URL or host/db/user/password variables')
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`
}

async function runMigrations() {
  const url = resolvePostgresUrl()

  console.log('[zonforge:migrate] Connecting to PostgreSQL...')

  const client = postgres(url, {
    max: 1,
    ssl: process.env['ZONFORGE_POSTGRES_SSL'] === 'true'
      ? { rejectUnauthorized: true }
      : false,
  })

  const db = drizzle(client)
  const migrationsFolder = path.join(__dirname, 'migrations')
  const migrationJournal = path.join(migrationsFolder, 'meta', '_journal.json')

  try {
    if (!fs.existsSync(migrationJournal)) {
      console.log('[zonforge:migrate] No migrations found, skipping')
      return
    }

    console.log('[zonforge:migrate] Running migrations...')
    await migrate(db, {
      migrationsFolder,
    })
    console.log('[zonforge:migrate] ✅ Migrations completed successfully')
  } catch (err) {
    console.error('[zonforge:migrate] ❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
