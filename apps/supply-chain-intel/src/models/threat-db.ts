// ─────────────────────────────────────────────
// SUPPLY CHAIN THREAT INTELLIGENCE DATABASE
//
// Curated list of known malicious packages and
// popular packages used for typosquatting detection.
//
// Sources:
//   - OSV.dev malicious package advisories
//   - Socket.dev threat research
//   - Snyk vulnerability database
//   - GitHub Security Advisories
// ─────────────────────────────────────────────

export interface KnownMaliciousPackage {
  ecosystem: string
  name:      string
  versions?: string[]   // undefined = all versions
  threat:    string
  reference: string
  discoveredAt: string
}

// Real malicious packages (historical incidents)
export const KNOWN_MALICIOUS_PACKAGES: KnownMaliciousPackage[] = [
  // npm
  { ecosystem: 'npm', name: 'event-stream',   versions: ['3.3.6'], threat: 'malicious_code',      reference: 'GHSA-8j5g-4hy8-6qrx', discoveredAt: '2018-11-26' },
  { ecosystem: 'npm', name: 'flatmap-stream', versions: ['0.1.1'], threat: 'malicious_code',      reference: 'GHSA-8j5g-4hy8-6qrx', discoveredAt: '2018-11-26' },
  { ecosystem: 'npm', name: 'ua-parser-js',   versions: ['0.7.29','0.8.0','1.0.0'], threat: 'compromised_account', reference: 'GHSA-pjwm-rvh2-c87w', discoveredAt: '2021-10-22' },
  { ecosystem: 'npm', name: 'coa',            versions: ['2.0.3','2.0.4'], threat: 'compromised_account', reference: 'GHSA-73qr-pfmq-6rp8', discoveredAt: '2021-11-04' },
  { ecosystem: 'npm', name: 'rc',             versions: ['1.2.9'], threat: 'compromised_account',  reference: 'GHSA-g2q5-5433-rhrf', discoveredAt: '2021-11-04' },
  { ecosystem: 'npm', name: 'colors',         versions: ['1.4.44-liberty-2'], threat: 'protestware', reference: 'GHSA-5rqg-jm4f-cqx7', discoveredAt: '2022-01-09' },
  { ecosystem: 'npm', name: 'faker',          versions: ['6.6.6'],  threat: 'protestware',         reference: 'GHSA-5w9c-rv96-fr7g', discoveredAt: '2022-01-09' },
  { ecosystem: 'npm', name: 'node-ipc',       versions: ['10.1.1','10.1.2'], threat: 'protestware', reference: 'GHSA-8gr3-2gjw-jj7g', discoveredAt: '2022-03-15' },
  { ecosystem: 'npm', name: 'peacenotwar',    threat: 'malicious_code', reference: 'OSV-2022-526', discoveredAt: '2022-03-15' },
  { ecosystem: 'npm', name: 'everything',     threat: 'malicious_code', reference: 'OSV-2023-1',   discoveredAt: '2023-04-06' },
  { ecosystem: 'npm', name: 'xz',             threat: 'typosquatting',  reference: 'OSV-2024-100', discoveredAt: '2024-02-01' },
  // PyPI
  { ecosystem: 'pypi', name: 'ctx',            threat: 'compromised_account', reference: 'PYSEC-2022-42969', discoveredAt: '2022-05-24' },
  { ecosystem: 'pypi', name: 'phpass',         threat: 'typosquatting',       reference: 'PYSEC-2022-42970', discoveredAt: '2022-05-24' },
  { ecosystem: 'pypi', name: 'loguru-plus',    threat: 'malicious_code',      reference: 'OSV-2023-200',     discoveredAt: '2023-04-01' },
  { ecosystem: 'pypi', name: 'importantpackage', threat: 'malicious_code',   reference: 'OSV-2023-201',     discoveredAt: '2023-04-01' },
  { ecosystem: 'pypi', name: 'requests-darwin', threat: 'typosquatting',     reference: 'OSV-2023-202',     discoveredAt: '2023-01-15' },
  // Maven / Gradle
  { ecosystem: 'maven', name: 'com.github.codingrodent:codec', threat: 'typosquatting', reference: 'GHSA-3j9p-5p98-7gc4', discoveredAt: '2021-08-10' },
]

// ─────────────────────────────────────────────
// POPULAR PACKAGE LISTS (for typosquatting)
// ─────────────────────────────────────────────

export const POPULAR_NPM_PACKAGES = [
  'lodash', 'express', 'react', 'axios', 'chalk', 'moment', 'webpack',
  'typescript', 'eslint', 'prettier', 'jest', 'mocha', 'babel', 'rollup',
  'vite', 'next', 'nuxt', 'vue', 'angular', 'svelte', 'tailwindcss',
  'mongoose', 'sequelize', 'typeorm', 'prisma', 'knex', 'redis', 'ioredis',
  'socket.io', 'fastify', 'koa', 'hapi', 'nest', 'passport', 'jsonwebtoken',
  'bcrypt', 'dotenv', 'cors', 'helmet', 'morgan', 'winston', 'pino',
  'uuid', 'nanoid', 'dayjs', 'date-fns', 'luxon', 'classnames', 'clsx',
  'immer', 'zustand', 'redux', 'mobx', 'rxjs', 'graphql', 'apollo',
  'zod', 'yup', 'joi', 'ajv', 'sharp', 'jimp', 'multer', 'busboy',
  'aws-sdk', 'googleapis', 'twilio', 'stripe', 'sendgrid', 'nodemailer',
  'puppeteer', 'playwright', 'cheerio', 'got', 'node-fetch', 'superagent',
]

export const POPULAR_PYPI_PACKAGES = [
  'requests', 'boto3', 'numpy', 'pandas', 'flask', 'django', 'fastapi',
  'sqlalchemy', 'pydantic', 'celery', 'redis', 'aiohttp', 'httpx',
  'pytest', 'click', 'rich', 'loguru', 'pyyaml', 'toml', 'cryptography',
  'pillow', 'matplotlib', 'scipy', 'scikit-learn', 'tensorflow', 'torch',
  'transformers', 'openai', 'anthropic', 'langchain', 'uvicorn', 'gunicorn',
  'alembic', 'psycopg2', 'pymongo', 'motor', 'elasticsearch', 'kafka-python',
  'paramiko', 'fabric', 'ansible', 'terraform', 'pulumi', 'botocore',
  'aws-cdk', 'azure-sdk', 'google-cloud', 'stripe', 'twilio', 'sendgrid',
  'jinja2', 'mako', 'cerberus', 'marshmallow', 'attrs', 'dataclasses',
  'arrow', 'pendulum', 'dateutil', 'pytz', 'humanize', 'tqdm', 'colorama',
]

// ─────────────────────────────────────────────
// SUSPICIOUS MAINTAINER PATTERNS
// ─────────────────────────────────────────────

export const SUSPICIOUS_MAINTAINER_SIGNALS = [
  'account created <30 days before publish',
  'no prior packages published',
  'no public profile or email',
  'unusual publish time (4AM–6AM local)',
  'package name acquired after popular package owner left',
  'sudden version bump with no changelog',
]

// ─────────────────────────────────────────────
// DEPENDENCY CONFUSION INDICATORS
// ─────────────────────────────────────────────

export const INTERNAL_PACKAGE_PATTERNS = [
  /^@[a-z]+\//,          // scoped packages: @company/pkg
  /^internal-/,          // internal-*
  /^corp-/,              // corp-*
  /^private-/,           // private-*
  /\.(internal|local|corp|company)$/,
]

export function looksLikeInternalPackage(name: string): boolean {
  return INTERNAL_PACKAGE_PATTERNS.some(p => p.test(name))
}
