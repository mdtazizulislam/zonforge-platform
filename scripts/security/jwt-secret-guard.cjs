#!/usr/bin/env node
/*
 * CI guard to prevent JWT secret fallback/default regressions in production backend code.
 * Fails when suspicious patterns are found in targeted backend source files.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = process.cwd();
const args = process.argv.slice(2);

const explicitPaths = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--path' && args[i + 1]) {
    explicitPaths.push(args[i + 1]);
    i += 1;
  }
}

const defaultTargets = [
  'apps/backend/src/auth.ts',
  'apps/backend/src/index.ts',
  'apps/backend/src/security.ts',
  'apps/backend/src/config.ts',
  'apps/backend/src/env.ts',
];

const targets = (explicitPaths.length > 0 ? explicitPaths : defaultTargets)
  .map((p) => p.replace(/\\/g, '/'))
  .filter((p) => fs.existsSync(path.resolve(repoRoot, p)));

const rules = [
  {
    id: 'JWT_FALLBACK_FROM_ENV',
    description: 'Do not provide fallback/default strings for JWT secrets.',
    regex: /process\.env\.(JWT_SECRET|ZONFORGE_JWT_SECRET)\s*(\|\||\?\?)\s*['"`]/,
  },
  {
    id: 'JWT_PLACEHOLDER_LITERAL',
    description: 'Do not use placeholder/default JWT secret literals in production code.',
    regex: /(your_jwt_secret_key_here|default_jwt_secret|jwt_secret_key_here|changeme_jwt|replace_me_jwt|test_jwt_secret)/i,
  },
  {
    id: 'JWT_HARDCODED_SECRET_ASSIGNMENT',
    description: 'Do not hardcode JWT secrets in source files.',
    regex: /(const|let|var)\s+[A-Za-z0-9_]*JWT[A-Za-z0-9_]*SECRET[A-Za-z0-9_]*\s*=\s*['"][^'"\n]{8,}['"]/,
  },
  {
    id: 'WEAK_MIN_LENGTH_CHECK',
    description: 'Production JWT secret policy must enforce minimum length >= 64.',
    regex: /JWT_SECRET\.length\s*<\s*(?:[0-5]?\d|6[0-3])\b/,
  },
];

const violations = [];

for (const relPath of targets) {
  const absPath = path.resolve(repoRoot, relPath);
  const content = fs.readFileSync(absPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    for (const rule of rules) {
      if (rule.regex.test(line)) {
        violations.push({
          file: relPath,
          line: i + 1,
          ruleId: rule.id,
          message: rule.description,
          sample: line.trim(),
        });
      }
    }
  }
}

if (targets.length === 0) {
  console.error('[jwt-secret-guard] No target files were found.');
  console.error('[jwt-secret-guard] Expected one of:');
  for (const target of defaultTargets) {
    console.error(`  - ${target}`);
  }
  process.exit(2);
}

if (violations.length > 0) {
  console.error('[jwt-secret-guard] FAILED: JWT secret regression risk detected.');
  console.error('[jwt-secret-guard] Why this failed:');
  console.error('  - Fallback/default JWT secret behavior can silently weaken production auth.');
  console.error('  - Hardcoded/placeholder secrets are not allowed in backend production code.');
  console.error('  - Minimum JWT secret policy must remain >= 64 characters.');
  console.error('');
  console.error('[jwt-secret-guard] Violations:');

  for (const v of violations) {
    console.error(`  - ${v.file}:${v.line} [${v.ruleId}] ${v.message}`);
    console.error(`    > ${v.sample}`);
  }

  console.error('');
  console.error('[jwt-secret-guard] Fix guidance:');
  console.error('  1) Require JWT secrets from environment only (no fallback literal).');
  console.error('  2) Remove any hardcoded or placeholder secret strings.');
  console.error('  3) Keep production minimum secret length check at 64 or higher.');
  process.exit(1);
}

console.log('[jwt-secret-guard] PASS: No JWT secret fallback/default regressions detected.');
console.log(`[jwt-secret-guard] Scanned ${targets.length} file(s).`);
