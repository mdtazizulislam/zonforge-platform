import { z } from 'zod'

// ─────────────────────────────────────────────
// SUPPLY CHAIN INTELLIGENCE — DOMAIN TYPES
// ─────────────────────────────────────────────

export type Ecosystem = 'npm' | 'pypi' | 'maven' | 'gradle' | 'nuget' | 'rubygems' | 'cargo' | 'go'

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'safe'

export type ThreatCategory =
  | 'typosquatting'       // fake package mimicking popular one
  | 'dependency_confusion' // internal package name hijacked
  | 'malicious_code'      // backdoor / stealer / cryptominer
  | 'compromised_account'  // legitimate package taken over
  | 'known_vulnerability'  // published CVE
  | 'abandoned_package'    // no maintenance, no security patches
  | 'suspicious_maintainer' // new maintainer, unusual publish pattern
  | 'protestware'         // author embedded protest code
  | 'build_tampering'     // CI/CD injection, modified artifact

// ─────────────────────────────────────────────
// PACKAGE FINDING
// ─────────────────────────────────────────────

export interface PackageFinding {
  id:            string
  scanId:        string
  ecosystem:     Ecosystem
  name:          string
  version:       string
  resolvedVersion?: string
  riskLevel:     RiskLevel
  threatCategories: ThreatCategory[]
  cveIds:        string[]
  cvssScore?:    number
  description:   string
  evidence:      string[]
  firstPublished?: Date
  lastPublished?:  Date
  weeklyDownloads?: number
  maintainers:   PackageMaintainer[]
  typosquatOf?:  string    // name of legitimate package being spoofed
  remediationAdvice: string
  affectedFiles: string[]  // which files in repo depend on this
}

export interface PackageMaintainer {
  name:         string
  email?:       string
  githubHandle?: string
  registeredAt?: Date
  packageCount?: number
  suspicious:   boolean
  suspicionReason?: string
}

// ─────────────────────────────────────────────
// SCAN RESULT
// ─────────────────────────────────────────────

export interface SupplyChainScanResult {
  id:          string
  tenantId:    string
  projectName: string
  ecosystem:   Ecosystem[]
  status:      'queued' | 'scanning' | 'completed' | 'failed'

  // Input
  manifestFiles: string[]   // package.json, requirements.txt, etc.
  totalPackages: number
  directDeps:    number
  transitiveDeps: number

  // Findings
  findings:      PackageFinding[]
  criticalCount: number
  highCount:     number
  mediumCount:   number
  lowCount:      number

  // SBOM
  sbom:          SbomEntry[]

  // Scores
  riskScore:      number   // 0–100 (100 = most dangerous)
  supplyChainGrade: 'A' | 'B' | 'C' | 'D' | 'F'

  // CVE mapping
  cveMapping:    CveMapping[]

  startedAt:   Date
  completedAt: Date | null
  durationMs:  number
  scannedBy:   string
}

// ─────────────────────────────────────────────
// SBOM (Software Bill of Materials)
// ─────────────────────────────────────────────

export interface SbomEntry {
  name:        string
  version:     string
  ecosystem:   Ecosystem
  license:     string
  isDirect:    boolean
  depth:       number    // 0 = direct, 1 = transitive level 1, etc.
  hash?:       string    // integrity hash (SHA-256 of package content)
  sourceUrl?:  string
  riskLevel:   RiskLevel
}

// ─────────────────────────────────────────────
// CVE → INFRASTRUCTURE MAPPING
// ─────────────────────────────────────────────

export interface CveMapping {
  cveId:       string
  cvssScore:   number
  severity:    RiskLevel
  packageName: string
  ecosystem:   Ecosystem
  affectedVersions: string[]
  patchedVersion?:  string
  description: string
  exploitAvailable: boolean
  exploitedInWild:  boolean
  affectedServices: string[]   // which of your microservices use this package
  remediationUrgency: 'immediate' | 'urgent' | 'normal' | 'low'
}

// ─────────────────────────────────────────────
// TYPOSQUATTING DATABASE ENTRY
// ─────────────────────────────────────────────

export interface TyposquatEntry {
  fakeName:    string
  realName:    string
  ecosystem:   Ecosystem
  similarity:  number    // 0–1 Levenshtein similarity
  detectedAt:  Date
  isConfirmed: boolean
  description: string
}

// ─────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────

export const ScanRequestSchema = z.object({
  projectName:   z.string().min(1).max(200),
  ecosystem:     z.enum(['npm','pypi','maven','gradle','nuget','rubygems','cargo','go']).optional(),
  manifestContent: z.string().max(500_000).optional(),  // raw package.json / requirements.txt content
  packages:      z.array(z.object({
    name:    z.string(),
    version: z.string(),
  })).max(2000).optional(),
})

export const GRADE_THRESHOLDS = {
  A: 10,   // risk score ≤ 10
  B: 25,   // ≤ 25
  C: 50,   // ≤ 50
  D: 75,   // ≤ 75
  F: 100,  // > 75
}

export function scoreToGrade(score: number): SupplyChainScanResult['supplyChainGrade'] {
  if (score <= 10) return 'A'
  if (score <= 25) return 'B'
  if (score <= 50) return 'C'
  if (score <= 75) return 'D'
  return 'F'
}

// ─────────────────────────────────────────────
// KNOWN MALICIOUS PACKAGES DATABASE
//
// Curated list of confirmed malicious packages
// discovered in the wild (subset of real incidents)
// ─────────────────────────────────────────────

export const KNOWN_MALICIOUS: Record<string, {
  ecosystem: Ecosystem; reason: ThreatCategory; description: string; discovered: string
}> = {
  // npm
  'event-stream@3.3.6':     { ecosystem: 'npm',  reason: 'compromised_account', description: 'Bitcoin wallet stealer injected by new maintainer', discovered: '2018-11-26' },
  'ua-parser-js@0.7.29':    { ecosystem: 'npm',  reason: 'compromised_account', description: 'Cryptominer + password stealer injected', discovered: '2021-10-22' },
  'colors@1.4.44-liberty-2':{ ecosystem: 'npm',  reason: 'protestware',         description: 'Maintainer added infinite loop as protest', discovered: '2022-01-09' },
  'node-ipc@10.1.1':        { ecosystem: 'npm',  reason: 'protestware',         description: 'Wiped files on Russian/Belarusian machines', discovered: '2022-03-16' },
  'rc@1.2.9':               { ecosystem: 'npm',  reason: 'malicious_code',      description: 'Credential stealer variant', discovered: '2023-11-27' },
  'xz@5.6.0':               { ecosystem: 'npm',  reason: 'build_tampering',     description: 'XZ Utils backdoor (CVE-2024-3094)', discovered: '2024-03-29' },
  // pypi
  'coloama':                { ecosystem: 'pypi', reason: 'typosquatting',       description: 'Typosquat of colorama — credential stealer', discovered: '2023-04-10' },
  'request-2':              { ecosystem: 'pypi', reason: 'typosquatting',       description: 'Typosquat of requests — data exfiltration', discovered: '2022-08-15' },
  'pytorch-nightly-cu11':   { ecosystem: 'pypi', reason: 'dependency_confusion', description: 'Malicious package used in dependency confusion attack', discovered: '2022-12-26' },
}

// ─────────────────────────────────────────────
// POPULAR PACKAGE NAMES (for typosquatting detection)
// ─────────────────────────────────────────────

export const POPULAR_NPM_PACKAGES = [
  'lodash', 'express', 'react', 'axios', 'moment', 'async', 'chalk',
  'commander', 'webpack', 'babel-core', 'typescript', 'prettier',
  'eslint', 'jest', 'mocha', 'sinon', 'supertest', 'nodemon',
  'dotenv', 'cors', 'helmet', 'bcrypt', 'jsonwebtoken', 'passport',
  'mongoose', 'sequelize', 'pg', 'redis', 'ioredis', 'bullmq',
  'hono', 'fastify', 'koa', 'socket.io', 'ws', 'uuid', 'dayjs',
]

export const POPULAR_PYPI_PACKAGES = [
  'requests', 'numpy', 'pandas', 'flask', 'django', 'sqlalchemy',
  'boto3', 'fastapi', 'pydantic', 'pytest', 'setuptools', 'pip',
  'cryptography', 'paramiko', 'celery', 'redis', 'pillow', 'scipy',
]
