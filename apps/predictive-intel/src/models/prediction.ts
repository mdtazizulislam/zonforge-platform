import { z } from 'zod'

// ─────────────────────────────────────────────
// PREDICTIVE THREAT INTELLIGENCE — TYPES
// ─────────────────────────────────────────────

export type ThreatCategory =
  | 'credential_attack'
  | 'ransomware'
  | 'data_exfiltration'
  | 'supply_chain'
  | 'phishing_campaign'
  | 'api_abuse'
  | 'insider_threat'
  | 'ddos'

export type ThreatHorizon = '24h' | '72h' | '7d' | '30d'

export type ConfidenceLevel = 'very_high' | 'high' | 'medium' | 'low'

// ─────────────────────────────────────────────
// PREDICTION
// ─────────────────────────────────────────────

export interface ThreatPrediction {
  id:              string
  tenantId:        string
  category:        ThreatCategory
  horizon:         ThreatHorizon
  probability:     number      // 0–100
  confidence:      ConfidenceLevel
  title:           string
  description:     string
  reasoning:       string[]    // "why we think this"
  indicators:      string[]    // current signals supporting prediction
  affectedAssets:  string[]    // which tenant assets are targeted
  mitreTechniques: string[]
  recommendedActions: string[]
  generatedAt:     Date
  expiresAt:       Date
  acknowledged:    boolean
  actualized?:     boolean     // did it actually happen?
}

// ─────────────────────────────────────────────
// THREAT SIGNAL (input to predictor)
// ─────────────────────────────────────────────

export interface ThreatSignal {
  type:        'ioc_spike' | 'alert_pattern' | 'risk_trend' | 'external_feed' | 'behavior_shift'
  category:    ThreatCategory
  strength:    number     // 0–1
  description: string
  source:      string
  detectedAt:  Date
  data:        Record<string, unknown>
}

// ─────────────────────────────────────────────
// CAMPAIGN INTELLIGENCE
// ─────────────────────────────────────────────

export interface AttackCampaign {
  id:          string
  name:        string
  actor?:      string       // threat actor name if known
  active:      boolean
  startedAt:   Date
  targetIndustries: string[]
  targetRegions:    string[]
  techniques:       string[]
  iocCount:         number
  severity:         'critical' | 'high' | 'medium'
  description:      string
  mitigations:      string[]
}

// ─────────────────────────────────────────────
// INDUSTRY THREAT CONTEXT
// ─────────────────────────────────────────────

export interface IndustryThreatContext {
  industry:         string
  region:           string
  period:           string
  topThreats:       ThreatCategory[]
  trendingTechniques: string[]
  activeGroups:     string[]
  recommendedFocus: string[]
}

// ─────────────────────────────────────────────
// THREAT FORECAST REPORT
// ─────────────────────────────────────────────

export interface ThreatForecastReport {
  tenantId:       string
  generatedAt:    Date
  period:         ThreatHorizon
  predictions:    ThreatPrediction[]
  activeCampaigns: AttackCampaign[]
  industryContext: IndustryThreatContext
  overallThreatLevel: 'critical' | 'elevated' | 'guarded' | 'low'
  overallThreatScore:  number     // 0–100
  topRecommendations: string[]
}

// ─────────────────────────────────────────────
// KNOWN ATTACK CAMPAIGNS (curated intel)
// ─────────────────────────────────────────────

export const KNOWN_CAMPAIGNS: AttackCampaign[] = [
  {
    id:               'camp-001',
    name:             'CloudPhish-2024',
    actor:            'UNC3944 (Scattered Spider)',
    active:           true,
    startedAt:        new Date('2024-01-15'),
    targetIndustries: ['technology', 'telecom', 'finance'],
    targetRegions:    ['US', 'UK', 'EU'],
    techniques:       ['T1566','T1078','T1550.001','T1530'],
    iocCount:         847,
    severity:         'critical',
    description:      'SMS phishing → MFA fatigue → cloud service compromise. Targeting M365, Okta, and AWS.',
    mitigations:      ['Enforce phishing-resistant MFA','Monitor OAuth consent grants','Alert on impossible travel'],
  },
  {
    id:               'camp-002',
    name:             'RansomHub-Wave-7',
    actor:            'RansomHub',
    active:           true,
    startedAt:        new Date('2024-03-01'),
    targetIndustries: ['healthcare', 'government', 'manufacturing'],
    targetRegions:    ['US', 'CA', 'AU'],
    techniques:       ['T1190','T1078','T1021','T1486'],
    iocCount:         312,
    severity:         'critical',
    description:      'Initial access via CVE exploitation → lateral movement → ransomware deployment. 72-hour dwell time.',
    mitigations:      ['Patch CVE-2024-3400 immediately','Monitor service account lateral movement','Air-gap backups'],
  },
  {
    id:               'camp-003',
    name:             'DataBroker-Supply',
    actor:            'Unknown APT',
    active:           true,
    startedAt:        new Date('2024-02-20'),
    targetIndustries: ['technology', 'finance', 'retail'],
    targetRegions:    ['Global'],
    techniques:       ['T1195','T1059','T1078.001'],
    iocCount:         156,
    severity:         'high',
    description:      'Compromising npm/pypi packages to establish persistence in developer environments.',
    mitigations:      ['Audit third-party dependencies','Enable supply chain scanning','Pin package hashes'],
  },
  {
    id:               'camp-004',
    name:             'CredHarvest-M365',
    actor:            'Storm-0539',
    active:           true,
    startedAt:        new Date('2024-04-01'),
    targetIndustries: ['retail', 'hospitality', 'finance'],
    targetRegions:    ['US', 'UK'],
    techniques:       ['T1566.002','T1078.004','T1114'],
    iocCount:         523,
    severity:         'high',
    description:      'AiTM phishing targeting M365 sign-in pages. Bypasses MFA by intercepting session cookies.',
    mitigations:      ['Deploy Conditional Access policies','Block legacy authentication','Monitor new device enrollments'],
  },
]

// ─────────────────────────────────────────────
// INDUSTRY THREAT MAP
// ─────────────────────────────────────────────

export const INDUSTRY_THREAT_MAP: Record<string, IndustryThreatContext> = {
  technology:  {
    industry: 'Technology',   region: 'Global',
    period:   'Q2 2024',
    topThreats:          ['credential_attack', 'supply_chain', 'api_abuse'],
    trendingTechniques:  ['T1566','T1195','T1550.001'],
    activeGroups:        ['UNC3944','Lazarus Group','APT41'],
    recommendedFocus:    ['MFA hardening','Supply chain scanning','OAuth monitoring'],
  },
  finance:     {
    industry: 'Financial Services', region: 'Global',
    period:   'Q2 2024',
    topThreats:          ['credential_attack', 'phishing_campaign', 'insider_threat'],
    trendingTechniques:  ['T1566','T1078','T1005'],
    activeGroups:        ['Lazarus Group','FIN7','TA505'],
    recommendedFocus:    ['Transaction monitoring','Privileged access review','Email security'],
  },
  healthcare:  {
    industry: 'Healthcare', region: 'Global',
    period:   'Q2 2024',
    topThreats:          ['ransomware', 'data_exfiltration', 'credential_attack'],
    trendingTechniques:  ['T1190','T1486','T1078'],
    activeGroups:        ['RansomHub','LockBit','BlackCat'],
    recommendedFocus:    ['Legacy system patching','Backup integrity','Network segmentation'],
  },
  general:     {
    industry: 'General', region: 'Global',
    period:   'Q2 2024',
    topThreats:          ['credential_attack', 'phishing_campaign', 'data_exfiltration'],
    trendingTechniques:  ['T1566','T1078','T1530'],
    activeGroups:        ['Various APTs'],
    recommendedFocus:    ['MFA enforcement','Email security','Cloud access monitoring'],
  },
}

// ZOD schemas
export const GetForecastSchema = z.object({
  horizon:  z.enum(['24h','72h','7d','30d']).default('72h'),
  industry: z.string().optional(),
})

export const AcknowledgePredictionSchema = z.object({
  predictionId: z.string().uuid(),
  notes:        z.string().max(500).optional(),
})
