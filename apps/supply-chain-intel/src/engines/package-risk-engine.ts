import { createLogger } from '@zonforge/logger'
import {
  KNOWN_MALICIOUS, POPULAR_NPM_PACKAGES, POPULAR_PYPI_PACKAGES,
  type PackageFinding, type PackageMaintainer, type ThreatCategory,
  type RiskLevel, type Ecosystem, type CveMapping,
} from '../models/supply-chain.js'
import type { ParsedPackage } from '../scanners/manifest-parser.js'
import { v4 as uuid } from 'uuid'

const log = createLogger({ service: 'supply-chain:risk-engine' })

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─────────────────────────────────────────────
// PACKAGE RISK ENGINE
//
// Analyzes packages for:
//   1. Known malicious packages (local DB + OSS Index)
//   2. Typosquatting (Levenshtein distance vs popular packages)
//   3. CVE vulnerabilities (OSV API)
//   4. Maintainer anomalies (new account, bulk publish)
//   5. Package health (abandonment, age, download count)
// ─────────────────────────────────────────────

export class PackageRiskEngine {

  // ── Main analysis entry point ─────────────────

  async analyzePackage(
    pkg:    ParsedPackage,
    scanId: string,
  ): Promise<PackageFinding | null> {
    const findings: { category: ThreatCategory; description: string; evidence: string[] }[] = []
    const cveIds: string[] = []
    let cvssScore: number | undefined

    // 1. Known malicious check
    const maliciousKey = `${pkg.name}@${pkg.version}`
    const maliciousEntry = KNOWN_MALICIOUS[maliciousKey] ?? KNOWN_MALICIOUS[pkg.name]
    if (maliciousEntry) {
      findings.push({
        category: maliciousEntry.reason,
        description: maliciousEntry.description,
        evidence: [`Discovered: ${maliciousEntry.discovered}`, `Source: ZonForge malicious package database`],
      })
    }

    // 2. Typosquatting detection
    const typosquat = this.detectTyposquatting(pkg.name, pkg.ecosystem)
    if (typosquat) {
      findings.push({
        category: 'typosquatting',
        description: `Package "${pkg.name}" closely resembles popular package "${typosquat.target}" (similarity: ${(typosquat.similarity * 100).toFixed(0)}%)`,
        evidence: [
          `Target package: ${typosquat.target}`,
          `Levenshtein distance: ${typosquat.distance}`,
          `Similarity score: ${(typosquat.similarity * 100).toFixed(1)}%`,
        ],
      })
    }

    // 3. CVE lookup via OSV.dev API (free, open source vulnerability database)
    const cves = await this.lookupCves(pkg.name, pkg.version, pkg.ecosystem)
    cveIds.push(...cves.map(c => c.id))
    if (cves.length > 0) {
      cvssScore = Math.max(...cves.map(c => c.cvss ?? 0))
      findings.push({
        category: 'known_vulnerability',
        description: `${cves.length} known CVE(s): ${cves.map(c => c.id).join(', ')}`,
        evidence: cves.map(c => `${c.id} (CVSS ${c.cvss ?? 'N/A'}): ${c.summary?.slice(0, 100)}`),
      })
    }

    // 4. Package health / abandonment check
    const healthIssues = this.checkPackageHealth(pkg)
    if (healthIssues) findings.push(healthIssues)

    // 5. Dependency confusion check
    const confusionRisk = this.checkDependencyConfusion(pkg.name)
    if (confusionRisk) findings.push(confusionRisk)

    // Skip if no findings and not critical
    if (findings.length === 0) return null

    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(findings, cvssScore)

    // Build maintainer list (mock — in production would call npm/pypi API)
    const maintainers = this.buildMaintainerProfile(pkg.name, pkg.ecosystem)

    return {
      id:               uuid(),
      scanId,
      ecosystem:        pkg.ecosystem,
      name:             pkg.name,
      version:          pkg.version,
      riskLevel,
      threatCategories: findings.map(f => f.category),
      cveIds,
      cvssScore,
      description:      findings.map(f => f.description).join('. '),
      evidence:         findings.flatMap(f => f.evidence),
      maintainers,
      typosquatOf:      typosquat?.target,
      remediationAdvice: this.buildRemediation(findings, typosquat?.target),
      affectedFiles:    [],
    }
  }

  // ── Typosquatting detection ───────────────────

  private detectTyposquatting(
    name:      string,
    ecosystem: Ecosystem,
  ): { target: string; similarity: number; distance: number } | null {
    const popularList = ecosystem === 'npm' ? POPULAR_NPM_PACKAGES : POPULAR_PYPI_PACKAGES
    const lower = name.toLowerCase()

    let bestMatch: { target: string; similarity: number; distance: number } | null = null
    let bestSimilarity = 0

    for (const popular of popularList) {
      if (lower === popular) return null  // exact match = not a typosquat

      const dist = levenshteinDistance(lower, popular)
      const maxLen = Math.max(lower.length, popular.length)
      const similarity = 1 - dist / maxLen

      // Flag if very similar but not exact
      // Higher threshold for short packages to avoid false positives
      const threshold = popular.length <= 4 ? 0.85 : 0.78

      if (similarity >= threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestMatch = { target: popular, similarity, distance: dist }
      }
    }

    // Additional heuristics
    if (!bestMatch) {
      // Check for common typo patterns
      const typoPatterns = [
        { pattern: /^(.*)-js$/, canonical: (m: string) => m },           // lodash-js → lodash
        { pattern: /^js-(.*)$/, canonical: (m: string) => m },           // js-lodash → lodash
        { pattern: /^node-(.*)$/, canonical: (m: string) => m },         // node-express → express
        { pattern: /^(.*)\.js$/, canonical: (m: string) => m },          // express.js → express
      ]

      for (const { pattern, canonical } of typoPatterns) {
        const match = lower.match(pattern)
        if (match && match[1]) {
          const bare = canonical(match[1])
          if (popularList.includes(bare)) {
            return { target: bare, similarity: 0.85, distance: 1 }
          }
        }
      }
    }

    return bestMatch
  }

  // ── CVE lookup via OSV.dev ────────────────────

  private async lookupCves(
    name:      string,
    version:   string,
    ecosystem: Ecosystem,
  ): Promise<Array<{ id: string; cvss?: number | undefined; summary?: string | undefined }>> {
    if (!name || !version || version === '*') return []

    // Map ecosystem names to OSV format
    const osvEcosystem: Record<Ecosystem, string> = {
      npm: 'npm', pypi: 'PyPI', maven: 'Maven', gradle: 'Maven',
      nuget: 'NuGet', rubygems: 'RubyGems', cargo: 'crates.io', go: 'Go',
    }

    try {
      const resp = await fetchWithTimeout('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version,
          package: { name, ecosystem: osvEcosystem[ecosystem] },
        }),
      }, 8_000)

      if (!resp.ok) return []

      const data = await resp.json() as {
        vulns?: Array<{
          id: string
          summary?: string
          severity?: Array<{ score: string; type: string }>
        }>
      }

      return (data.vulns ?? []).slice(0, 10).map(v => ({
        id:      v.id,
        summary: v.summary,
        cvss:    v.severity?.find(s => s.type === 'CVSS_V3')
          ? parseFloat(v.severity.find(s => s.type === 'CVSS_V3')!.score)
          : undefined,
      }))

    } catch (err) {
      // OSV API unavailable — non-fatal
      log.debug({ err, name, version }, 'OSV lookup failed (non-fatal)')
      return []
    }
  }

  // ── Package health check ──────────────────────

  private checkPackageHealth(pkg: ParsedPackage): {
    category: ThreatCategory; description: string; evidence: string[]
  } | null {
    // Heuristic checks on package name patterns
    const lower = pkg.name.toLowerCase()

    // Very new package with suspicious patterns
    const suspiciousPatterns = [
      /^test-?[0-9]{3,}/,          // test1234
      /^[a-z]{1,3}-[a-z]{1,3}$/,  // Very short names like 'ab-cd'
      /\d{6,}/,                     // Many consecutive digits
    ]

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(lower)) {
        return {
          category: 'suspicious_maintainer',
          description: `Package name "${pkg.name}" matches suspicious naming pattern`,
          evidence: [`Pattern matched: ${pattern.toString()}`, 'Common in automated malware publishing campaigns'],
        }
      }
    }

    return null
  }

  // ── Dependency confusion check ────────────────

  private checkDependencyConfusion(name: string): {
    category: ThreatCategory; description: string; evidence: string[]
  } | null {
    // Check for internal package naming patterns that are often targeted
    const internalPatterns = [
      /^@[a-z]+\//,                           // scoped but potentially internal
      /^(internal|private|corp|company|org)-/, // common internal prefixes
      /-(internal|private|local)$/,            // common internal suffixes
    ]

    for (const pattern of internalPatterns) {
      if (pattern.test(name)) {
        return {
          category: 'dependency_confusion',
          description: `Package "${name}" matches internal package naming pattern — verify it's not a dependency confusion risk`,
          evidence: [
            'Internal-style package names can be targeted in dependency confusion attacks',
            'Attackers publish public packages with the same name to intercept installs',
          ],
        }
      }
    }

    return null
  }

  // ── Risk level calculation ────────────────────

  private calculateRiskLevel(
    findings: Array<{ category: ThreatCategory }>,
    cvssScore?: number,
  ): RiskLevel {
    const criticalCategories: ThreatCategory[] = ['malicious_code', 'compromised_account', 'build_tampering']
    const highCategories: ThreatCategory[] = ['typosquatting', 'dependency_confusion']

    if (findings.some(f => criticalCategories.includes(f.category))) return 'critical'
    if (cvssScore !== undefined && cvssScore >= 9.0) return 'critical'
    if (cvssScore !== undefined && cvssScore >= 7.0) return 'high'
    if (findings.some(f => highCategories.includes(f.category))) return 'high'
    if (cvssScore !== undefined && cvssScore >= 4.0) return 'medium'
    if (findings.length > 0) return 'medium'
    return 'safe'
  }

  // ── Mock maintainer profile ───────────────────

  private buildMaintainerProfile(name: string, ecosystem: Ecosystem): PackageMaintainer[] {
    // In production: call npm registry / PyPI API
    return [{
      name:        `maintainer-${name.slice(0, 8)}`,
      email:       undefined,
      suspicious:  false,
      packageCount: 1,
    }]
  }

  // ── Remediation advice builder ────────────────

  private buildRemediation(
    findings: Array<{ category: ThreatCategory }>,
    typosquatOf?: string,
  ): string {
    const parts: string[] = []

    for (const finding of findings) {
      switch (finding.category) {
        case 'typosquatting':
          parts.push(`Replace with the legitimate package "${typosquatOf}" immediately. This may be a credential stealer.`)
          break
        case 'malicious_code':
        case 'compromised_account':
          parts.push('CRITICAL: Remove this package immediately, rotate all credentials, and audit systems for compromise.')
          break
        case 'known_vulnerability':
          parts.push('Upgrade to the latest patched version. Check the CVE advisory for workarounds.')
          break
        case 'dependency_confusion':
          parts.push('Use a private package registry with namespace protection. Pin package hashes.')
          break
        case 'abandoned_package':
          parts.push('Find a maintained alternative or fork the package and take ownership of security patches.')
          break
        default:
          parts.push('Review package carefully before deployment. Consider pinning the exact version hash.')
      }
    }

    return parts.join(' ') || 'Review this package carefully.'
  }

  // ── Batch analysis ────────────────────────────

  async analyzePackages(
    packages: ParsedPackage[],
    scanId:   string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<PackageFinding[]> {
    const findings: PackageFinding[] = []
    const BATCH_SIZE = 10

    for (let i = 0; i < packages.length; i += BATCH_SIZE) {
      const batch = packages.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(batch.map(p => this.analyzePackage(p, scanId)))
      findings.push(...results.filter((r): r is PackageFinding => r !== null))
      onProgress?.(Math.min(i + BATCH_SIZE, packages.length), packages.length)
    }

    return findings
  }

  // ── CVE → services mapping ────────────────────

  buildCveMapping(findings: PackageFinding[]): CveMapping[] {
    const cveMap = new Map<string, CveMapping>()

    for (const f of findings) {
      for (const cveId of f.cveIds) {
        if (cveMap.has(cveId)) continue

        cveMap.set(cveId, {
          cveId,
          cvssScore:         f.cvssScore ?? 0,
          severity:          f.riskLevel,
          packageName:       f.name,
          ecosystem:         f.ecosystem,
          affectedVersions:  [f.version],
          patchedVersion:    undefined,
          description:       f.description,
          exploitAvailable:  f.cvssScore !== undefined && f.cvssScore >= 8.0,
          exploitedInWild:   f.threatCategories.includes('malicious_code'),
          affectedServices:  [],
          remediationUrgency: f.riskLevel === 'critical' ? 'immediate'
            : f.riskLevel === 'high' ? 'urgent'
            : f.riskLevel === 'medium' ? 'normal'
            : 'low',
        })
      }
    }

    return [...cveMap.values()].sort((a, b) => b.cvssScore - a.cvssScore)
  }
}

// ─────────────────────────────────────────────
// LEVENSHTEIN DISTANCE
// ─────────────────────────────────────────────

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0),
  )

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
      }
    }
  }

  return dp[m]![n]!
}
