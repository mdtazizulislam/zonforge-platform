import type { Config } from 'drizzle-kit'

function resolveDrizzleDatabaseUrl(): string {
  const url = process.env['ZONFORGE_POSTGRES_URL'] ?? process.env['DATABASE_URL'] ?? '';
  if (!url) {
    throw new Error(
      'Set ZONFORGE_POSTGRES_URL or DATABASE_URL in the environment for Drizzle Kit (no default URL in repo).',
    );
  }
  return url;
}

export default {
  schema: './src/postgres/schema/index.ts',
  out: './src/postgres/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: resolveDrizzleDatabaseUrl(),
  },
  verbose: true,
  strict: true,
} satisfies Config
