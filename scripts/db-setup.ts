#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────
// ZonForge Sentinel — Database Migration + Seed Runner
//
// Usage:
//   npx tsx scripts/db-setup.ts migrate          → run migrations
//   npx tsx scripts/db-setup.ts seed             → seed demo data
//   npx tsx scripts/db-setup.ts migrate seed     → both
//   npx tsx scripts/db-setup.ts reset            → drop + migrate + seed
// ─────────────────────────────────────────────────────────────────

import { drizzle }    from 'drizzle-orm/node-postgres'
import { migrate }    from 'drizzle-orm/node-postgres/migrator'
import { Pool }       from 'pg'
import { createHash } from 'crypto'
import { v4 as uuid } from 'uuid'

const PG_URL = process.env['ZONFORGE_POSTGRES_URL']
            ?? `postgresql://${process.env['ZONFORGE_POSTGRES_USER'] ?? 'zonforge'}:`
             + `${process.env['ZONFORGE_POSTGRES_PASSWORD'] ?? 'changeme_local'}`
             + `@${process.env['ZONFORGE_POSTGRES_HOST'] ?? 'localhost'}:5432/`
             + `${process.env['ZONFORGE_POSTGRES_DB'] ?? 'zonforge'}`

const args = process.argv.slice(2)

async function main() {
  console.log('🔄 ZonForge DB Setup')
  console.log(`   Target: ${PG_URL.replace(/:[^:@]+@/, ':****@')}`)

  const pool = new Pool({ connectionString: PG_URL })
  const db   = drizzle(pool)

  try {
    if (args.includes('reset')) {
      console.log('⚠️  RESET: dropping all tables...')
      await pool.query(`
        DO $$ DECLARE r RECORD;
        BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
          LOOP
            EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
        END $$;
      `)
      console.log('✅ All tables dropped')
    }

    if (args.includes('migrate') || args.includes('reset')) {
      console.log('🔄 Running migrations...')
      await migrate(db, { migrationsFolder: './packages/db-client/drizzle' })
      console.log('✅ Migrations complete')
    }

    if (args.includes('seed') || args.includes('reset')) {
      await runSeed(pool)
    }

    if (args.length === 0) {
      console.log('ℹ️  No command specified. Use: migrate | seed | reset')
      console.log('   Example: npx tsx scripts/db-setup.ts migrate seed')
    }

  } finally {
    await pool.end()
  }
}

// ─────────────────────────────────────────────────────────────────
// SEED DATA — Creates demo tenant + users + sample data
// ─────────────────────────────────────────────────────────────────

async function runSeed(pool: Pool) {
  console.log('🌱 Seeding demo data...')

  const tenantId = '00000000-0000-0000-0000-000000000001'
  const adminId  = '00000000-0000-0000-0000-000000000002'
  const analystId = '00000000-0000-0000-0000-000000000003'

  // ── Demo Tenant ──────────────────────────────────────────────

  await pool.query(`
    INSERT INTO tenants (
      id, name, slug, plan_tier, status, region,
      max_connectors, max_identities, max_events_per_minute,
      created_at, updated_at
    ) VALUES (
      $1, 'Acme Corp (Demo)', 'acme-demo', 'business', 'active', 'us-east-1',
      10, 1000, 10000,
      NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING
  `, [tenantId])

  console.log('  ✅ Demo tenant: Acme Corp (Demo) [business plan]')

  // ── Demo Subscription ─────────────────────────────────────────

  await pool.query(`
    INSERT INTO subscriptions (
      id, tenant_id, plan_tier, status,
      current_period_start, current_period_end,
      cancel_at_period_end, created_at, updated_at
    ) VALUES (
      $1, $2, 'business', 'active',
      NOW(), NOW() + INTERVAL '30 days',
      false, NOW(), NOW()
    ) ON CONFLICT DO NOTHING
  `, [uuid(), tenantId])

  // ── Demo Users ────────────────────────────────────────────────

  const bcryptHash = '$2b$12$demo.hash.for.password.Password123'   // not real bcrypt

  await pool.query(`
    INSERT INTO users (
      id, tenant_id, email, name, password_hash, role,
      email_verified, is_active, created_at, updated_at
    ) VALUES
    ($1, $4, 'admin@acme-demo.com', 'Alice Admin', $5, 'TENANT_ADMIN', true, true, NOW(), NOW()),
    ($2, $4, 'analyst@acme-demo.com', 'Bob Analyst', $5, 'SECURITY_ANALYST', true, true, NOW(), NOW()),
    ($3, $4, 'readonly@acme-demo.com', 'Carol Read', $5, 'READ_ONLY', true, true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `, [adminId, analystId, uuid(), tenantId, bcryptHash])

  console.log('  ✅ Demo users: admin@acme-demo.com / analyst@acme-demo.com / readonly@acme-demo.com')
  console.log('     Password: Password123! (demo only)')

  // ── Demo Connectors ───────────────────────────────────────────

  const connectors = [
    { type: 'm365_entra',     name: 'Microsoft 365 (Demo)', status: 'active' },
    { type: 'aws_cloudtrail', name: 'AWS CloudTrail (Demo)', status: 'active' },
    { type: 'google_workspace', name: 'Google Workspace (Demo)', status: 'error' },
  ]

  for (const c of connectors) {
    await pool.query(`
      INSERT INTO connectors (
        id, tenant_id, name, type, status,
        config_encrypted, is_healthy, last_event_at,
        poll_interval_minutes, consecutive_errors, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        '{}', $6, NOW() - INTERVAL '5 minutes',
        5, $7, NOW(), NOW()
      ) ON CONFLICT DO NOTHING
    `, [
      uuid(), tenantId, c.name, c.type, c.status,
      c.status === 'active', c.status === 'error' ? 3 : 0,
    ])
  }

  console.log(`  ✅ ${connectors.length} demo connectors`)

  // ── Demo Detection Rules (platform-level) ────────────────────

  const ruleIds = [
    'ZF-AUTH-001', 'ZF-AUTH-002', 'ZF-AUTH-003', 'ZF-AUTH-004',
    'ZF-AUTH-005', 'ZF-AUTH-006', 'ZF-AUTH-007', 'ZF-DATA-001',
    'ZF-PRIVESC-001', 'ZF-AWS-001', 'ZF-AWS-002', 'ZF-AWS-003',
    'ZF-IAM-001', 'ZF-IAM-002', 'ZF-OAUTH-001',
    'ZF-RANSOMWARE-001', 'ZF-LATERAL-001', 'ZF-NET-001', 'ZF-EMAIL-001',
  ]

  for (const ruleId of ruleIds) {
    await pool.query(`
      INSERT INTO detection_rules (
        id, tenant_id, rule_id, name, description,
        severity, enabled, is_custom, hit_count,
        mitre_tactics, mitre_techniques,
        created_at, updated_at
      ) VALUES (
        $1, NULL, $2, $2 || ' Platform Rule', 'Platform detection rule',
        CASE
          WHEN $2 LIKE '%RANSOMWARE%' THEN 'critical'
          WHEN $2 LIKE '%AUTH-001%' OR $2 LIKE '%PRIVESC%' THEN 'high'
          ELSE 'medium'
        END,
        true, false, floor(random() * 50)::int,
        '["TA0001"]', '["T1078"]',
        NOW(), NOW()
      ) ON CONFLICT DO NOTHING
    `, [uuid(), ruleId])
  }

  console.log(`  ✅ ${ruleIds.length} platform detection rules`)

  // ── Demo Alerts (sample) ─────────────────────────────────────

  const sampleAlerts = [
    {
      title:       'Brute Force Login Attempt → Success on admin@acme.com',
      severity:    'high',
      priority:    'P1',
      status:      'investigating',
      mitreTactics: ['TA0006', 'TA0001'],
      mitreTechniques: ['T1110', 'T1078'],
    },
    {
      title:       'Mass File Download — 847 files in 3 minutes',
      severity:    'high',
      priority:    'P2',
      status:      'open',
      mitreTactics: ['TA0009', 'TA0010'],
      mitreTechniques: ['T1530'],
    },
    {
      title:       'Impossible Travel: Login from US then IN within 45 minutes',
      severity:    'critical',
      priority:    'P1',
      status:      'open',
      mitreTactics: ['TA0001'],
      mitreTechniques: ['T1078.004'],
    },
    {
      title:       'AWS Root Account Login at 03:17 UTC',
      severity:    'high',
      priority:    'P2',
      status:      'resolved',
      mitreTactics: ['TA0001'],
      mitreTechniques: ['T1078.004'],
    },
    {
      title:       'Email Auto-Forward Rule Created to External Domain',
      severity:    'medium',
      priority:    'P3',
      status:      'open',
      mitreTactics: ['TA0009'],
      mitreTechniques: ['T1114.003'],
    },
  ]

  for (const a of sampleAlerts) {
    const alertId = uuid()
    await pool.query(`
      INSERT INTO alerts (
        id, tenant_id, finding_id, title, description,
        severity, priority, status,
        evidence, mitre_tactics, mitre_techniques,
        recommended_actions, affected_user_id, affected_ip,
        first_signal_time, detection_gap_minutes,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        'Automated detection alert. Investigation required.',
        $5, $6, $7,
        '[]'::jsonb,
        $8::jsonb, $9::jsonb,
        '["Review immediately", "Check user activity logs", "Verify with affected user"]'::jsonb,
        $10, '203.0.113.' || floor(random() * 254 + 1)::text,
        NOW() - INTERVAL '30 minutes', floor(random() * 60 + 5)::int,
        NOW() - INTERVAL '25 minutes', NOW()
      ) ON CONFLICT DO NOTHING
    `, [
      alertId, tenantId, uuid(), a.title,
      a.severity, a.priority, a.status,
      JSON.stringify(a.mitreTactics), JSON.stringify(a.mitreTechniques),
      adminId,
    ])
  }

  console.log(`  ✅ ${sampleAlerts.length} sample alerts`)

  // ── Demo Risk Scores ─────────────────────────────────────────

  const riskUsers = [
    { userId: adminId,   score: 78, severity: 'high' },
    { userId: analystId, score: 32, severity: 'low' },
  ]

  for (const r of riskUsers) {
    await pool.query(`
      INSERT INTO risk_scores (
        id, tenant_id, entity_type, entity_id,
        score, severity, confidence_band,
        contributing_signals, decay_rate,
        calculated_at, valid_until
      ) VALUES (
        $1, $2, 'user', $3,
        $4, $5, 'high',
        '[{"signalType":"behavior","contribution":23},{"signalType":"alert_history","contribution":15}]'::jsonb,
        0.05,
        NOW(), NOW() + INTERVAL '24 hours'
      ) ON CONFLICT (tenant_id, entity_type, entity_id)
      DO UPDATE SET score = EXCLUDED.score, calculated_at = NOW()
    `, [uuid(), tenantId, r.userId, r.score, r.severity])
  }

  console.log('  ✅ Demo risk scores seeded')
  console.log('')
  console.log('🎉 Seed complete!')
  console.log('')
  console.log('  Login credentials (demo only):')
  console.log('  ─────────────────────────────')
  console.log('  Admin:    admin@acme-demo.com    / Password123!')
  console.log('  Analyst:  analyst@acme-demo.com  / Password123!')
  console.log('  ReadOnly: readonly@acme-demo.com / Password123!')
}

main().catch(err => {
  console.error('❌ DB setup failed:', err)
  process.exit(1)
})
