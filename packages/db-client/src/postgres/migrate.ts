import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'path'
import { fileURLToPath } from 'url'

// ─────────────────────────────────────────────
// ZonForge Sentinel — Database Migration Runner
// Run: node dist/postgres/migrate.js
// ─────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function runMigrations() {
  const url = process.env['ZONFORGE_POSTGRES_URL']
  if (!url) {
    throw new Error('ZONFORGE_POSTGRES_URL environment variable is required')
  }

  console.log('[zonforge:migrate] Connecting to PostgreSQL...')

  const client = postgres(url, {
    max: 1,
    ssl: process.env['ZONFORGE_POSTGRES_SSL'] === 'true'
      ? { rejectUnauthorized: true }
      : false,
  })

  const db = drizzle(client)

  try {
    console.log('[zonforge:migrate] Running migrations...')
    await migrate(db, {
      migrationsFolder: path.join(__dirname, 'migrations'),
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
