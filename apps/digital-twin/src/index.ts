import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { v4 as uuid } from 'uuid'
import { eq, and, desc } from 'drizzle-orm'
import { Redis } from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import {
  BuildTwinSchema, SimulateTwinSchema, AddNodeSchema,
  ATTACK_TECHNIQUES,
  type TwinNode, type TwinEdge, type TwinTopology,
  type AttackPath, type AttackStep, type TwinSimulationResult,
} from './models/twin.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'digital-twin' })

// ─────────────────────────────────────────────
// TOPOLOGY BUILDER
// Constructs digital twin from existing ZonForge data
// ─────────────────────────────────────────────

async function buildTopologyFromData(
  tenantId: string,
  twinId:   string,
  name:     string,
): Promise<TwinTopology> {
  const db = getDb()

  const [connectors, riskScores] = await Promise.all([
    db.select().from(schema.connectors).where(eq(schema.connectors.tenantId, tenantId)).limit(20),
    db.select().from(schema.riskScores).where(eq(schema.riskScores.tenantId, tenantId)).orderBy(desc(schema.riskScores.score)).limit(20),
  ])

  const nodes: TwinNode[] = []
  const edges: TwinEdge[] = []

  // Add Internet (attacker entry point)
  const internetId = `${twinId}-internet`
  nodes.push({
    id: internetId, type: 'external_endpoint', label: 'Internet (Threat Actor)',
    properties: {}, risk: 100, privilege: 'low', internet_exposed: true, hasHoneypot: false,
  })

  // Add nodes from connectors (data sources = services)
  const sourceMap: Record<string, string> = {
    m365_entra: 'Microsoft 365 / Entra ID',
    aws_cloudtrail: 'AWS Cloud Infrastructure',
    google_workspace: 'Google Workspace',
  }

  const connectorNodes: string[] = []
  for (const conn of connectors) {
    const nodeId = `${twinId}-svc-${conn.id.slice(0, 8)}`
    const isHealthy = conn.status === 'active'
    nodes.push({
      id: nodeId,
      type: conn.type.includes('aws') ? 'cloud_service' : 'saas_application',
      label: sourceMap[conn.type as string] ?? conn.name,
      properties: { sourceType: conn.type, healthy: isHealthy },
      risk: isHealthy ? 25 : 60,
      privilege: 'high',
      internet_exposed: true,
      hasHoneypot: false,
    })
    connectorNodes.push(nodeId)

    // Internet → Service (auth edge)
    edges.push({
      id:           uuid(),
      source:       internetId,
      target:       nodeId,
      type:         'authenticate',
      bidirectional: false,
      encrypted:    true,
      mfaRequired:  false,   // unknown — conservative
      properties:   {},
    })
  }

  // Add high-risk users as nodes
  const highRiskUsers = riskScores.filter(r => r.entityType === 'user' && r.score >= 50).slice(0, 10)
  const userNodeMap: Record<string, string> = {}

  for (const user of highRiskUsers) {
    const nodeId = `${twinId}-user-${user.entityId.slice(0, 8)}`
    nodes.push({
      id:       nodeId,
      type:     'user_identity',
      label:    user.entityId.length > 30 ? `${user.entityId.slice(0, 25)}…` : user.entityId,
      properties: { riskScore: user.score, severity: user.severity, entityId: user.entityId },
      risk:     user.score,
      privilege: user.score >= 80 ? 'high' : user.score >= 50 ? 'medium' : 'low',
      internet_exposed: false,
      hasHoneypot: false,
    })
    userNodeMap[user.entityId] = nodeId

    // User → each connector service
    for (const svcNodeId of connectorNodes) {
      edges.push({
        id: uuid(), source: nodeId, target: svcNodeId,
        type: 'authenticate', bidirectional: false,
        encrypted: true, mfaRequired: false, properties: {},
      })
    }
  }

  // Add data store nodes
  const dataStoreId = `${twinId}-datastore`
  nodes.push({
    id: dataStoreId, type: 'data_store', label: 'Sensitive Data Store',
    properties: { contains: ['documents', 'emails', 'credentials'] },
    risk: 80, privilege: 'high', internet_exposed: false, hasHoneypot: true,
  })

  // Services → Data Store
  for (const svcId of connectorNodes) {
    edges.push({
      id: uuid(), source: svcId, target: dataStoreId,
      type: 'data_flow', bidirectional: false,
      encrypted: true, mfaRequired: false, properties: {},
    })
  }

  // Network segment
  const networkId = `${twinId}-network`
  nodes.push({
    id: networkId, type: 'network_segment', label: 'Internal Network',
    properties: { vlan: 'corporate' }, risk: 30,
    privilege: 'medium', internet_exposed: false, hasHoneypot: false,
  })

  return {
    id:       twinId,
    tenantId,
    name,
    nodes,
    edges,
    builtAt:  new Date(),
    builtFrom: ['connectors', 'risk_scores'],
    nodeCount: nodes.length,
    edgeCount: edges.length,
  }
}

// ─────────────────────────────────────────────
// ATTACK PATH FINDER
// ─────────────────────────────────────────────

function findAttackPaths(topology: TwinTopology, scenario: string): AttackPath[] {
  const { nodes, edges } = topology
  const paths: AttackPath[] = []

  const internet     = nodes.find(n => n.type === 'external_endpoint')
  const dataStore    = nodes.find(n => n.type === 'data_store')
  const highPrivUsers = nodes.filter(n => n.type === 'user_identity' && n.privilege === 'high')
  const services     = nodes.filter(n => ['saas_application','cloud_service'].includes(n.type))

  if (!internet) return paths

  // ── Path 1: Credential Attack → Data Access ──

  if (['credential_attack', 'all'].includes(scenario)) {
    const targetUser = highPrivUsers[0] ?? nodes.find(n => n.type === 'user_identity')
    const targetSvc  = services[0]

    if (targetUser && targetSvc && dataStore) {
      const steps: AttackStep[] = [
        {
          stepNumber: 1, fromNode: internet.id, toNode: targetSvc.id,
          technique: 'T1110', description: 'Brute force login to cloud service',
          likelihood: 60, detectable: true, detectionRule: 'ZF-AUTH-001',
        },
        {
          stepNumber: 2, fromNode: targetSvc.id, toNode: targetUser.id,
          technique: 'T1078', description: 'Use compromised valid credentials',
          likelihood: 80, detectable: true, detectionRule: 'ZF-AUTH-001',
        },
        {
          stepNumber: 3, fromNode: targetUser.id, toNode: dataStore.id,
          technique: 'T1530', description: 'Access and exfiltrate cloud storage',
          likelihood: 90, detectable: true, detectionRule: 'ZF-DATA-001',
        },
      ]

      const totalLikelihood = steps.reduce((prod, s) => prod * (s.likelihood / 100), 1) * 100
      const detectedSteps   = steps.filter(s => s.detectable).length
      const detectability   = Math.round((detectedSteps / steps.length) * 100)

      paths.push({
        id: uuid(), twinId: topology.id,
        name:       'Credential Attack → Data Exfiltration',
        entryPoint: internet.id,
        target:     dataStore.id,
        steps,
        totalLikelihood: Math.round(totalLikelihood),
        detectability,
        criticalGap: detectability < 100,
        mitreTechniques: steps.map(s => s.technique),
        severity: totalLikelihood >= 40 ? 'critical' : totalLikelihood >= 20 ? 'high' : 'medium',
        remediations: [
          'Enable MFA on all cloud service accounts',
          'Alert on logins from unknown countries',
          'Apply rate limiting to authentication endpoints',
        ],
      })
    }
  }

  // ── Path 2: Lateral Movement via Service Account ─

  if (['lateral_movement', 'all'].includes(scenario)) {
    const svcAcct = nodes.find(n => n.type === 'user_identity' && n.label.toLowerCase().includes('svc'))
      ?? highPrivUsers[0]

    if (svcAcct && services.length > 1 && dataStore) {
      const steps: AttackStep[] = [
        {
          stepNumber: 1, fromNode: internet.id, toNode: services[0]!.id,
          technique: 'T1566',
          likelihood: 45, detectable: false,
          description: 'Phishing bypasses email gateway — not detectable by ZonForge',
        },
        {
          stepNumber: 2, fromNode: services[0]!.id, toNode: svcAcct.id,
          technique: 'T1078', description: 'Use compromised service account credentials',
          likelihood: 75, detectable: true, detectionRule: 'ZF-AUTH-001',
        },
        {
          stepNumber: 3, fromNode: svcAcct.id, toNode: services[1]!.id,
          technique: 'T1021', description: 'Lateral movement to adjacent cloud service',
          likelihood: 70, detectable: true, detectionRule: 'ZF-LATERAL-001',
        },
        {
          stepNumber: 4, fromNode: services[1]!.id, toNode: dataStore.id,
          technique: 'T1098', description: 'Privilege escalation to access data store',
          likelihood: 80, detectable: true, detectionRule: 'ZF-PRIVESC-001',
        },
      ]

      const totalLikelihood = steps.reduce((p, s) => p * (s.likelihood / 100), 1) * 100
      const undetected      = steps.filter(s => !s.detectable)
      const detectability   = Math.round(((steps.length - undetected.length) / steps.length) * 100)

      paths.push({
        id: uuid(), twinId: topology.id,
        name:       'Phishing → Lateral Movement → Privilege Escalation',
        entryPoint: internet.id,
        target:     dataStore.id,
        steps,
        totalLikelihood: Math.round(totalLikelihood),
        detectability,
        criticalGap:    undetected.length > 0,
        mitreTechniques: steps.map(s => s.technique),
        severity:       'high',
        remediations: [
          'Deploy email security gateway with phishing detection',
          'Enable ZonForge monitoring for service account interactive logins',
          'Add honeypots to data store to catch late-stage attackers',
        ],
      })
    }
  }

  // ── Path 3: Supply Chain / OAuth Abuse ──────────

  if (['oauth_abuse', 'all'].includes(scenario)) {
    const targetSvc = services[0]
    if (targetSvc && dataStore) {
      const steps: AttackStep[] = [
        {
          stepNumber: 1, fromNode: internet.id, toNode: targetSvc.id,
          technique: 'T1566',
          likelihood: 55, detectable: false,
          description: 'Consent phishing — ZonForge detects only after consent granted',
        },
        {
          stepNumber: 2, fromNode: targetSvc.id, toNode: dataStore.id,
          technique: 'T1550.001', description: 'OAuth token used to access data at scale',
          likelihood: 85, detectable: true, detectionRule: 'ZF-OAUTH-001',
        },
      ]

      const detectedCount = steps.filter(s => s.detectable).length
      paths.push({
        id: uuid(), twinId: topology.id,
        name:       'OAuth Consent Phishing → Data Access',
        entryPoint: internet.id,
        target:     dataStore.id,
        steps,
        totalLikelihood: Math.round(steps.reduce((p, s) => p * (s.likelihood / 100), 1) * 100),
        detectability:   Math.round((detectedCount / steps.length) * 100),
        criticalGap:     steps.some(s => !s.detectable),
        mitreTechniques: steps.map(s => s.technique),
        severity:        'high',
        remediations: [
          'Enable OAuth app consent monitoring',
          'Restrict OAuth app permissions via Conditional Access',
          'Alert on new OAuth grants with Mail.ReadWrite or Files.ReadWrite.All',
        ],
      })
    }
  }

  return paths
}

// ─────────────────────────────────────────────
// SIMULATION RUNNER
// ─────────────────────────────────────────────

function runSimulation(
  topology:  TwinTopology,
  scenarios: string[],
): TwinSimulationResult {
  const start = Date.now()
  const paths: AttackPath[] = []

  for (const scenario of scenarios) {
    paths.push(...findAttackPaths(topology, scenario))
  }

  const criticalPaths      = paths.filter(p => p.severity === 'critical')
  const totalSteps         = paths.flatMap(p => p.steps)
  const undetectedSteps    = totalSteps.filter(s => !s.detectable).length
  const overallDetectability = totalSteps.length > 0
    ? Math.round((totalSteps.filter(s => s.detectable).length / totalSteps.length) * 100)
    : 100

  // Top vulnerable nodes
  const nodePathCount: Record<string, number> = {}
  for (const path of paths) {
    for (const step of path.steps) {
      nodePathCount[step.toNode] = (nodePathCount[step.toNode] ?? 0) + 1
    }
  }
  const topVulnerableNodes = Object.entries(nodePathCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nodeId, pathCount]) => {
      const node = topology.nodes.find(n => n.id === nodeId)
      return { nodeId, label: node?.label ?? nodeId, pathCount, risk: node?.risk ?? 50 }
    })

  // Top undetected techniques
  const techCounts: Record<string, number> = {}
  for (const step of totalSteps.filter(s => !s.detectable)) {
    techCounts[step.technique] = (techCounts[step.technique] ?? 0) + 1
  }
  const topUndetectedTech = Object.entries(techCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([technique, count]) => ({ technique, count }))

  const overallRiskScore = Math.min(100,
    paths.reduce((s, p) => s + p.totalLikelihood, 0) / Math.max(paths.length, 1),
  )

  const deploymentRiskLevel: TwinSimulationResult['deploymentRiskLevel'] =
    criticalPaths.length > 0 ? 'critical'
    : undetectedSteps > 2    ? 'risky'
    : 'safe'

  return {
    id:         uuid(),
    twinId:     topology.id,
    tenantId:   topology.tenantId,
    runAt:      new Date(),
    durationMs: Date.now() - start,
    attackPaths: paths,
    criticalPathCount:  criticalPaths.length,
    undetectedSteps,
    overallRiskScore:   Math.round(overallRiskScore),
    detectability:      overallDetectability,
    topVulnerableNodes,
    topUndetectedTech,
    recommendedControls: [
      ...new Set(paths.flatMap(p => p.remediations)),
    ].slice(0, 8),
    deploymentRiskLevel,
    deploymentRecommendation:
      deploymentRiskLevel === 'critical'
        ? 'BLOCK DEPLOYMENT: Critical attack paths with 100% likelihood exist. Remediate before deploy.'
        : deploymentRiskLevel === 'risky'
        ? 'CAUTION: Undetected attack steps found. Review and add detection coverage before deploy.'
        : 'SAFE TO DEPLOY: Attack paths are well-covered by existing detection rules.',
  }
}

// ─────────────────────────────────────────────
// MAIN SERVICE
// ─────────────────────────────────────────────

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const redis = new Redis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password, tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
  })

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], credentials: true }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── POST /v1/twin/build ───────────────────────

  app.post('/v1/twin/build',
    zValidator('json', BuildTwinSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { name } = ctx.req.valid('json')
      const db   = getDb()
      const twinId = uuid()

      const topology = await buildTopologyFromData(user.tenantId, twinId, name)

      await db.insert(schema.digitalTwins).values({
        id:        twinId,
        tenantId:  user.tenantId,
        name,
        nodes:     topology.nodes,
        edges:     topology.edges,
        builtFrom: topology.builtFrom,
        nodeCount: topology.nodeCount,
        edgeCount: topology.edgeCount,
        builtAt:   topology.builtAt,
        createdBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      return ctx.json({ success: true, data: topology }, 201)
    })

  // ── GET /v1/twin/list ─────────────────────────

  app.get('/v1/twin/list', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const twins = await db.select({
      id: schema.digitalTwins.id, name: schema.digitalTwins.name,
      nodeCount: schema.digitalTwins.nodeCount, edgeCount: schema.digitalTwins.edgeCount,
      builtAt: schema.digitalTwins.builtAt, createdAt: schema.digitalTwins.createdAt,
    })
      .from(schema.digitalTwins)
      .where(eq(schema.digitalTwins.tenantId, user.tenantId))
      .orderBy(desc(schema.digitalTwins.createdAt))
      .limit(10)

    return ctx.json({ success: true, data: twins })
  })

  // ── GET /v1/twin/:id ──────────────────────────

  app.get('/v1/twin/:id', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const [twin] = await db.select()
      .from(schema.digitalTwins)
      .where(and(
        eq(schema.digitalTwins.id, ctx.req.param('id')),
        eq(schema.digitalTwins.tenantId, user.tenantId),
      ))
      .limit(1)

    if (!twin) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)
    return ctx.json({ success: true, data: twin })
  })

  // ── POST /v1/twin/simulate ────────────────────

  app.post('/v1/twin/simulate',
    zValidator('json', SimulateTwinSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { twinId, scenarios } = ctx.req.valid('json')
      const db   = getDb()

      const [twin] = await db.select()
        .from(schema.digitalTwins)
        .where(and(
          eq(schema.digitalTwins.id, twinId),
          eq(schema.digitalTwins.tenantId, user.tenantId),
        ))
        .limit(1)

      if (!twin) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

      const topology: TwinTopology = {
        id:       twin.id,
        tenantId: twin.tenantId,
        name:     twin.name,
        nodes:    twin.nodes as TwinNode[],
        edges:    twin.edges as TwinEdge[],
        builtAt:  twin.builtAt,
        builtFrom: twin.builtFrom as string[],
        nodeCount: twin.nodeCount,
        edgeCount: twin.edgeCount,
      }

      const result = runSimulation(topology, scenarios)

      // Persist simulation result
      await db.insert(schema.twinSimulations).values({
        id:                 result.id,
        twinId:             result.twinId,
        tenantId:           user.tenantId,
        attackPaths:        result.attackPaths,
        criticalPathCount:  result.criticalPathCount,
        undetectedSteps:    result.undetectedSteps,
        overallRiskScore:   result.overallRiskScore,
        detectability:      result.detectability,
        topVulnerableNodes: result.topVulnerableNodes,
        topUndetectedTech:  result.topUndetectedTech,
        recommendedControls: result.recommendedControls,
        deploymentRiskLevel: result.deploymentRiskLevel,
        deploymentRecommendation: result.deploymentRecommendation,
        durationMs:         result.durationMs,
        runAt:              result.runAt,
        createdAt:          new Date(),
      })

      return ctx.json({ success: true, data: result })
    })

  // ── GET /v1/twin/:id/simulations ──────────────

  app.get('/v1/twin/:id/simulations', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const sims = await db.select()
      .from(schema.twinSimulations)
      .where(and(
        eq(schema.twinSimulations.twinId, ctx.req.param('id')),
        eq(schema.twinSimulations.tenantId, user.tenantId),
      ))
      .orderBy(desc(schema.twinSimulations.runAt))
      .limit(20)

    return ctx.json({ success: true, data: sims })
  })

  // ── POST /v1/twin/:id/add-node ────────────────

  app.post('/v1/twin/:id/add-node',
    zValidator('json', AddNodeSchema),
    async (ctx) => {
      const user = ctx.var.user
      const body = ctx.req.valid('json')
      const db   = getDb()

      const [twin] = await db.select()
        .from(schema.digitalTwins)
        .where(and(eq(schema.digitalTwins.id, body.twinId), eq(schema.digitalTwins.tenantId, user.tenantId)))
        .limit(1)

      if (!twin) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

      const newNode: TwinNode = {
        id:       uuid(),
        type:     body.type,
        label:    body.label,
        properties: body.properties,
        risk:     50,
        privilege: body.privilege,
        internet_exposed: body.internet_exposed,
        hasHoneypot: false,
      }

      const updatedNodes = [...(twin.nodes as TwinNode[]), newNode]
      await db.update(schema.digitalTwins)
        .set({ nodes: updatedNodes, nodeCount: updatedNodes.length, updatedAt: new Date() })
        .where(eq(schema.digitalTwins.id, body.twinId))

      return ctx.json({ success: true, data: newNode }, 201)
    })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'digital-twin', timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3019', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🔮 ZonForge Digital Twin on port ${info.port}`)
    log.info(`   Attack path scenarios: credential_attack, lateral_movement, oauth_abuse`)
    log.info(`   Real infrastructure — zero risk to production`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down digital twin...')
    await closeDb(); await redis.quit(); process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Digital twin failed to start')
  process.exit(1)
})
