import type { Config } from 'drizzle-kit'

export default {
  schema: './src/postgres/schema/index.ts',
  out: './src/postgres/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['ZONFORGE_POSTGRES_URL'] ?? 'postgresql://zonforge:changeme_local@localhost:5432/zonforge',
  },
  verbose: true,
  strict: true,
} satisfies Config
