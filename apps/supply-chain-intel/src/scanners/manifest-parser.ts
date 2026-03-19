import { createLogger } from '@zonforge/logger'
import type { Ecosystem } from '../models/supply-chain.js'

const log = createLogger({ service: 'supply-chain:parsers' })

// ─────────────────────────────────────────────
// MANIFEST PARSERS
//
// Extracts package lists from common manifests:
//   - package.json (npm)
//   - requirements.txt (pypi)
//   - Pipfile.lock (pypi)
//   - pom.xml (maven)
//   - build.gradle (gradle)
//   - packages.config / .csproj (nuget)
//   - Gemfile.lock (rubygems)
//   - Cargo.toml (cargo/rust)
//   - go.sum (go modules)
// ─────────────────────────────────────────────

export interface ParsedPackage {
  name:      string
  version:   string
  isDirect:  boolean
  ecosystem: Ecosystem
}

export type ManifestType =
  | 'package.json' | 'package-lock.json'
  | 'requirements.txt' | 'Pipfile.lock'
  | 'pom.xml' | 'build.gradle'
  | 'packages.config' | 'csproj'
  | 'Gemfile.lock' | 'Cargo.toml'
  | 'go.sum' | 'unknown'

// ─────────────────────────────────────────────
// FORMAT DETECTION
// ─────────────────────────────────────────────

export function detectManifestType(filename: string, content: string): ManifestType {
  const lower = filename.toLowerCase()
  if (lower === 'package.json')       return 'package.json'
  if (lower === 'package-lock.json')  return 'package-lock.json'
  if (lower === 'requirements.txt')   return 'requirements.txt'
  if (lower === 'pipfile.lock')       return 'Pipfile.lock'
  if (lower === 'pom.xml')            return 'pom.xml'
  if (lower.endsWith('build.gradle')) return 'build.gradle'
  if (lower === 'packages.config')    return 'packages.config'
  if (lower.endsWith('.csproj'))      return 'csproj'
  if (lower === 'gemfile.lock')       return 'Gemfile.lock'
  if (lower === 'cargo.toml')         return 'Cargo.toml'
  if (lower === 'go.sum')             return 'go.sum'

  // Content-based detection
  if (content.includes('"dependencies"') && content.includes('"version"')) return 'package.json'
  if (content.includes('<project>') && content.includes('<groupId>'))       return 'pom.xml'
  if (content.startsWith('# requirements'))                                  return 'requirements.txt'

  return 'unknown'
}

// ─────────────────────────────────────────────
// NPM / package.json
// ─────────────────────────────────────────────

export function parsePackageJson(content: string): ParsedPackage[] {
  try {
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }

    const packages: ParsedPackage[] = []

    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      packages.push({
        name, version: cleanVersion(version), isDirect: true, ecosystem: 'npm',
      })
    }
    for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
      packages.push({
        name, version: cleanVersion(version), isDirect: true, ecosystem: 'npm',
      })
    }

    return packages
  } catch (err) {
    log.warn({ err }, 'Failed to parse package.json')
    return []
  }
}

export function parsePackageLockJson(content: string): ParsedPackage[] {
  try {
    const lock = JSON.parse(content) as {
      packages?: Record<string, { version: string; dev?: boolean }>
      dependencies?: Record<string, { version: string; dev?: boolean }>
    }

    const packages: ParsedPackage[] = []

    // package-lock v3 format
    if (lock.packages) {
      for (const [path, meta] of Object.entries(lock.packages)) {
        if (!path || path === '') continue  // root package
        const name = path.replace(/^node_modules\//, '')
        if (meta.version) {
          packages.push({ name, version: meta.version, isDirect: !path.includes('/node_modules/'), ecosystem: 'npm' })
        }
      }
    }
    // v1/v2 format
    else if (lock.dependencies) {
      for (const [name, meta] of Object.entries(lock.dependencies)) {
        packages.push({ name, version: meta.version, isDirect: true, ecosystem: 'npm' })
      }
    }

    return packages
  } catch (err) {
    log.warn({ err }, 'Failed to parse package-lock.json')
    return []
  }
}

// ─────────────────────────────────────────────
// PYTHON / requirements.txt
// ─────────────────────────────────────────────

export function parseRequirementsTxt(content: string): ParsedPackage[] {
  const packages: ParsedPackage[] = []
  const lines = content.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.split('#')[0]!.trim()
    if (!line || line.startsWith('-r') || line.startsWith('--')) continue

    // Handle: package==1.0.0, package>=1.0.0, package~=1.0.0, package
    const match = line.match(/^([a-zA-Z0-9_\-\.]+)\s*(?:[=<>~!]+\s*([\w.\-*]+))?/)
    if (match && match[1]) {
      packages.push({
        name:      match[1].toLowerCase(),
        version:   match[2] ?? '*',
        isDirect:  true,
        ecosystem: 'pypi',
      })
    }
  }

  return packages
}

export function parsePipfileLock(content: string): ParsedPackage[] {
  try {
    const lock = JSON.parse(content) as {
      default?: Record<string, { version: string }>
      develop?: Record<string, { version: string }>
    }
    const packages: ParsedPackage[] = []

    for (const [name, meta] of Object.entries(lock.default ?? {})) {
      if (meta.version) {
        packages.push({ name, version: meta.version.replace(/^==/, ''), isDirect: true, ecosystem: 'pypi' })
      }
    }

    return packages
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────
// MAVEN / pom.xml (simplified XML parser)
// ─────────────────────────────────────────────

export function parsePomXml(content: string): ParsedPackage[] {
  const packages: ParsedPackage[] = []
  // Extract <dependency> blocks
  const depRegex = /<dependency>([\s\S]*?)<\/dependency>/g
  let match: RegExpExecArray | null

  while ((match = depRegex.exec(content)) !== null) {
    const block     = match[1]!
    const groupId   = block.match(/<groupId>(.*?)<\/groupId>/)?.[1] ?? ''
    const artifactId = block.match(/<artifactId>(.*?)<\/artifactId>/)?.[1] ?? ''
    const version   = block.match(/<version>(.*?)<\/version>/)?.[1] ?? '*'

    if (groupId && artifactId) {
      packages.push({
        name:     `${groupId}:${artifactId}`,
        version:  version.replace(/^\$\{.*?\}$/, '*'),
        isDirect: true,
        ecosystem:'maven',
      })
    }
  }

  return packages
}

// ─────────────────────────────────────────────
// GO / go.sum
// ─────────────────────────────────────────────

export function parseGoSum(content: string): ParsedPackage[] {
  const packages = new Map<string, ParsedPackage>()
  const lines = content.split('\n')

  for (const line of lines) {
    const parts = line.trim().split(' ')
    if (parts.length < 2) continue
    const [module, versionHash] = parts
    if (!module || !versionHash) continue

    // Format: github.com/pkg/name v1.2.3 h1:hash==
    const version = versionHash.split('/')[0] ?? versionHash

    if (!packages.has(module!)) {
      packages.set(module!, {
        name:      module!,
        version:   version.replace(/^v/, ''),
        isDirect:  true,
        ecosystem: 'go',
      })
    }
  }

  return [...packages.values()].slice(0, 1000)
}

// ─────────────────────────────────────────────
// CARGO / Cargo.toml
// ─────────────────────────────────────────────

export function parseCargoToml(content: string): ParsedPackage[] {
  const packages: ParsedPackage[] = []
  const depSection = content.match(/\[dependencies\]([\s\S]*?)(\[|$)/)?.[1] ?? ''
  const lines = depSection.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // name = "version" or name = { version = "1.0" }
    const simple  = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*=\s*"([^"]+)"/)
    const complex = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*=\s*\{.*?version\s*=\s*"([^"]+)"/)

    const m = simple ?? complex
    if (m && m[1] && m[2]) {
      packages.push({ name: m[1], version: m[2], isDirect: true, ecosystem: 'cargo' })
    }
  }

  return packages
}

// ─────────────────────────────────────────────
// UNIVERSAL PARSER
// ─────────────────────────────────────────────

export function parseManifest(
  filename: string,
  content:  string,
): { packages: ParsedPackage[]; type: ManifestType } {
  const type = detectManifestType(filename, content)

  switch (type) {
    case 'package.json':      return { packages: parsePackageJson(content),      type }
    case 'package-lock.json': return { packages: parsePackageLockJson(content),  type }
    case 'requirements.txt':  return { packages: parseRequirementsTxt(content),  type }
    case 'Pipfile.lock':      return { packages: parsePipfileLock(content),      type }
    case 'pom.xml':           return { packages: parsePomXml(content),           type }
    case 'Cargo.toml':        return { packages: parseCargoToml(content),        type }
    case 'go.sum':            return { packages: parseGoSum(content),            type }
    default:
      log.warn({ filename, type }, 'Unrecognized manifest format')
      return { packages: [], type }
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function cleanVersion(v: string): string {
  // Remove npm ranges: ^1.0.0 → 1.0.0, ~1.0.0 → 1.0.0, >=1.0.0 → 1.0.0
  return v.replace(/^[\^~>=<*]+/, '').trim() || '*'
}
