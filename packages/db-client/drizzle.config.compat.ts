// Temporary drizzle config compatible with drizzle-kit v0.20.18 (old API format)
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/postgres/schema/index.ts',
  out: './src/postgres/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env['ZONFORGE_POSTGRES_URL'] ?? 'postgresql://zonforge:changeme_local@localhost:5432/zonforge',
  },
  verbose: true,
  strict: false,
} satisfies Config
