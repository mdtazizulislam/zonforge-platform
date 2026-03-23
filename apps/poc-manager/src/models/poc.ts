import { z } from 'zod'

// ─────────────────────────────────────────────
// POC / TRIAL MANAGEMENT — DOMAIN TYPES
//
// Enterprise Sales Process:
//   1. Sales creates POC for prospect
//   2. POC has 30-45 day trial window
//   3. Structured success criteria defined upfront
//   4. Daily progress tracked automatically
//   5. ROI report generated at end
//   6. Converts to paid deal
// ─────────────────────────────────────────────

export type PocStatus =
  | 'draft'          // Sales creating the POC
  | 'invited'        // Prospect received invite
  | 'active'         // Trial running
  | 'review'         // POC complete, awaiting decision
  | 'won'            // Converted to paid
  | 'lost'           // Did not convert
  | 'extended'       // Extension granted

export type SuccessCriteriaStatus = 'not_started' | 'in_progress' | 'achieved' | 'not_achieved'

// ─────────────────────────────────────────────
// SUCCESS CRITERIA
// Defined upfront with prospect — determines win/loss
// ─────────────────────────────────────────────

export interface SuccessCriteria {
  id:          string
  title:       string
  description: string
  category:    'detection' | 'response' | 'compliance' | 'usability' | 'integration' | 'custom'
  measurable:  string    // "Detect X within Y minutes"
  target:      string    // "< 5 minutes MTTD"
  actual?:     string    // filled in during POC
  status:      SuccessCriteriaStatus
  weight:      number    // 1-5 importance
  evidenceUrl?: string   // screenshot / log link
  notes?:      string
}

// ─────────────────────────────────────────────
// POC MILESTONE
// ─────────────────────────────────────────────

export interface PocMilestone {
  id:          string
  week:        number    // 1, 2, 3, 4
  title:       string
  description: string
  tasks:       Array<{
    id:          string
    title:       string
    completed:   boolean
    completedAt?: string
    owner:       'zonforge' | 'customer'
  }>
  completedAt?: string
}

// ─────────────────────────────────────────────
// POC ENGAGEMENT METRICS
// Auto-calculated from platform usage
// ─────────────────────────────────────────────

export interface PocEngagementMetrics {
  lastLoginAt?:          string
  totalLogins:           number
  alertsInvestigated:    number
  playbooksCreated:      number
  threatHuntsRun:        number
  reportsGenerated:      number
  connectorsConfigured:  number
  dashboardVisits:       number
  engagementScore:       number    // 0-100 composite
  engagementLevel:       'high' | 'medium' | 'low'
}

// ─────────────────────────────────────────────
// POC RECORD
// ─────────────────────────────────────────────

export interface PocRecord {
  id:              string
  tenantId:        string    // ZonForge tenant created for POC

  // Prospect info
  companyName:     string
  companySize:     string    // "500-1000 employees"
  industry:        string
  country:         string
  championName:    string    // CISO / Security Director
  championEmail:   string
  championTitle:   string
  economicBuyerName?: string  // CFO / CEO who signs PO
  itContactName?:  string     // IT admin for setup

  // Deal info
  dealOwner:       string    // ZonForge AE name
  targetPlan:      string    // 'business' | 'enterprise'
  targetMrr:       number    // expected monthly revenue (USD)
  competitorsMentioned: string[]

  // Timeline
  status:          PocStatus
  startDate:       string
  endDate:         string    // planned
  actualEndDate?:  string
  durationDays:    number

  // Success
  successCriteria:    SuccessCriteria[]
  criteriaMetCount:   number
  criteriaTotalCount: number
  successScore:       number    // 0-100

  // Milestones
  milestones:         PocMilestone[]
  currentWeek:        number

  // Engagement
  engagement:         PocEngagementMetrics

  // Outcome
  wonAt?:          string
  lostAt?:         string
  lostReason?:     string    // 'price' | 'features' | 'competitor' | 'no_decision' | 'other'
  lostNotes?:      string
  dealValue?:      number    // actual contract value

  // Communication log
  checkIns:        Array<{
    date:     string
    type:     'call' | 'email' | 'meeting' | 'demo'
    summary:  string
    sentiment:'positive' | 'neutral' | 'concern'
    nextStep: string
  }>

  createdAt:       string
  updatedAt:       string
}

// ─────────────────────────────────────────────
// DEFAULT 4-WEEK MILESTONE PLAN
// ─────────────────────────────────────────────

export const DEFAULT_MILESTONES: Omit<PocMilestone, 'id'>[] = [
  {
    week:  1,
    title: 'Foundation & First Detections',
    description: 'Connect data sources, validate data flow, see first real detections.',
    tasks: [
      { id: '1-1', title: 'Connect primary identity connector (M365 or Google Workspace)', completed: false, owner: 'zonforge' },
      { id: '1-2', title: 'Configure detection rules for your top 3 threat scenarios', completed: false, owner: 'zonforge' },
      { id: '1-3', title: 'Onboarding call with ZonForge security engineer', completed: false, owner: 'zonforge' },
      { id: '1-4', title: 'Review and acknowledge first week of alerts', completed: false, owner: 'customer' },
      { id: '1-5', title: 'Share list of high-priority user accounts for monitoring', completed: false, owner: 'customer' },
    ],
  },
  {
    week:  2,
    title: 'Detection Tuning & Workflow Integration',
    description: 'Reduce false positives, integrate with existing tools (Jira/ServiceNow/Slack).',
    tasks: [
      { id: '2-1', title: 'Review false positive rate — target < 15%', completed: false, owner: 'zonforge' },
      { id: '2-2', title: 'Configure Jira/ServiceNow playbook integration', completed: false, owner: 'zonforge' },
      { id: '2-3', title: 'Set up PagerDuty escalation for P1 alerts', completed: false, owner: 'customer' },
      { id: '2-4', title: 'Run first threat hunt using pre-built templates', completed: false, owner: 'customer' },
      { id: '2-5', title: 'Verify MTTD against success criteria baseline', completed: false, owner: 'zonforge' },
    ],
  },
  {
    week:  3,
    title: 'Advanced Capabilities & Team Adoption',
    description: 'AI SOC Analyst, behavioral baselines, compliance reports.',
    tasks: [
      { id: '3-1', title: 'AI SOC Analyst live on P1/P2 alerts — review 3 investigations', completed: false, owner: 'customer' },
      { id: '3-2', title: 'Behavioral baselines established for all monitored users', completed: false, owner: 'zonforge' },
      { id: '3-3', title: 'Generate SOC2/ISO27001 compliance assessment report', completed: false, owner: 'customer' },
      { id: '3-4', title: 'Security team training session (1 hour)', completed: false, owner: 'zonforge' },
      { id: '3-5', title: 'Executive dashboard walkthrough with CISO', completed: false, owner: 'zonforge' },
    ],
  },
  {
    week:  4,
    title: 'ROI Review & Go/No-Go Decision',
    description: 'Measure against success criteria, generate ROI report, present to stakeholders.',
    tasks: [
      { id: '4-1', title: 'Final success criteria assessment', completed: false, owner: 'zonforge' },
      { id: '4-2', title: 'Generate executive ROI report (PDF)', completed: false, owner: 'zonforge' },
      { id: '4-3', title: 'Present findings to CISO and economic buyer', completed: false, owner: 'customer' },
      { id: '4-4', title: 'Commercial discussion with ZonForge AE', completed: false, owner: 'zonforge' },
      { id: '4-5', title: 'Go/No-Go decision', completed: false, owner: 'customer' },
    ],
  },
]

// Default success criteria templates by category
export const DEFAULT_CRITERIA: Omit<SuccessCriteria, 'id' | 'actual' | 'status' | 'evidenceUrl' | 'notes'>[] = [
  {
    title:       'Detection Speed (MTTD)',
    description: 'Mean time to detect a simulated credential attack',
    category:    'detection',
    measurable:  'Time from attack simulation to alert',
    target:      '< 5 minutes for P1 alerts',
    weight:      5,
  },
  {
    title:       'False Positive Rate',
    description: 'Percentage of alerts that are false positives',
    category:    'detection',
    measurable:  'FP alerts / total alerts × 100',
    target:      '< 15%',
    weight:      5,
  },
  {
    title:       'Analyst Time Savings',
    description: 'Reduction in time spent per alert investigation',
    category:    'response',
    measurable:  'Minutes per investigation with vs. without AI SOC',
    target:      '>40% reduction vs. current process',
    weight:      4,
  },
  {
    title:       'Connector Coverage',
    description: 'All critical data sources connected and healthy',
    category:    'integration',
    measurable:  'Active connectors / target connectors',
    target:      '100% (all 3 primary sources)',
    weight:      4,
  },
  {
    title:       'Compliance Report Quality',
    description: 'Automated SOC2 evidence package completeness',
    category:    'compliance',
    measurable:  'Controls with automated evidence / total controls',
    target:      '>80% automated coverage',
    weight:      3,
  },
]

// ─────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────

export const CreatePocSchema = z.object({
  companyName:     z.string().min(1).max(200),
  companySize:     z.string().default('unknown'),
  industry:        z.string().default('Technology'),
  country:         z.string().default('US'),
  championName:    z.string().min(1),
  championEmail:   z.string().email(),
  championTitle:   z.string().default('CISO'),
  economicBuyerName: z.string().optional(),
  dealOwner:       z.string().min(1),
  targetPlan:      z.enum(['business','enterprise']).default('enterprise'),
  targetMrr:       z.number().int().min(0).default(0),
  competitorsMentioned: z.array(z.string()).default([]),
  durationDays:    z.number().int().min(14).max(90).default(30),
  customCriteria:  z.array(z.object({
    title:       z.string(),
    target:      z.string(),
    category:    z.string(),
    measurable:  z.string(),
    weight:      z.number().int().min(1).max(5).default(3),
    description: z.string().default(''),
  })).default([]),
})

export const UpdateCriteriaSchema = z.object({
  criteriaId: z.string().uuid(),
  status:     z.enum(['not_started','in_progress','achieved','not_achieved']),
  actual:     z.string().optional(),
  notes:      z.string().optional(),
  evidenceUrl: z.string().url().optional(),
})

export const AddCheckInSchema = z.object({
  type:      z.enum(['call','email','meeting','demo']),
  summary:   z.string().min(1).max(2000),
  sentiment: z.enum(['positive','neutral','concern']),
  nextStep:  z.string().min(1).max(500),
})

export const MarkTaskDoneSchema = z.object({
  milestoneId: z.string(),
  taskId:      z.string(),
  completed:   z.boolean(),
})

export const ClosePocSchema = z.object({
  outcome:    z.enum(['won','lost']),
  dealValue:  z.number().optional(),
  lostReason: z.enum(['price','features','competitor','no_decision','other']).optional(),
  lostNotes:  z.string().optional(),
})
