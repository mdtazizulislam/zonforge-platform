import { type ReactNode, type ButtonHTMLAttributes } from 'react'
import { clsx } from 'clsx'

// ─────────────────────────────────────────────
// SEVERITY BADGE
// ─────────────────────────────────────────────

const SEVERITY_CLASSES: Record<string, string> = {
  critical: 'badge-critical',
  high:     'badge-high',
  medium:   'badge-medium',
  low:      'badge-low',
  info:     'badge-info',
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-blue-500',
  info:     'bg-gray-500',
}

export function SeverityBadge({
  severity,
  showDot = true,
}: {
  severity: string
  showDot?: boolean
}) {
  return (
    <span className={SEVERITY_CLASSES[severity] ?? 'badge bg-gray-500/15 text-gray-400'}>
      {showDot && (
        <span className={clsx(
          'w-1.5 h-1.5 rounded-full',
          SEVERITY_DOT[severity] ?? 'bg-gray-500',
        )} />
      )}
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  )
}

// ─────────────────────────────────────────────
// PRIORITY BADGE
// ─────────────────────────────────────────────

const PRIORITY_CLASSES: Record<string, string> = {
  P1: 'badge bg-red-600/20 text-red-400 ring-1 ring-red-600/40',
  P2: 'badge bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40',
  P3: 'badge bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  P4: 'badge bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30',
  P5: 'badge bg-gray-500/10 text-gray-500 ring-1 ring-gray-500/20',
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={PRIORITY_CLASSES[priority] ?? PRIORITY_CLASSES['P4']!}>
      {priority}
    </span>
  )
}

// ─────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  open:           'badge bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  investigating:  'badge bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  resolved:       'badge bg-green-500/15 text-green-400 ring-1 ring-green-500/30',
  suppressed:     'badge bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30',
  false_positive: 'badge bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
}

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return (
    <span className={STATUS_CLASSES[status] ?? STATUS_CLASSES['open']!}>
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────
// SCORE INDICATOR (0–100 colored number)
// ─────────────────────────────────────────────

export function ScoreIndicator({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color =
    score >= 85 ? 'text-red-400'
    : score >= 70 ? 'text-orange-400'
    : score >= 50 ? 'text-amber-400'
    : score >= 25 ? 'text-blue-400'
    : 'text-gray-400'

  const cls = size === 'lg' ? 'text-4xl font-bold' : size === 'sm' ? 'text-sm font-semibold' : 'text-xl font-bold'

  return <span className={clsx(cls, 'font-mono tabular-nums', color)}>{score}</span>
}

// ─────────────────────────────────────────────
// LOADING STATES
// ─────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'lg' ? 'w-8 h-8' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  return (
    <div className={clsx(s, 'border-2 border-gray-700 border-t-brand-500 rounded-full animate-spin')} />
  )
}

export function SkeletonBox({ className }: { className?: string }) {
  return <div className={clsx('bg-gray-800/70 rounded animate-pulse', className)} />
}

export function CardSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <SkeletonBox className="h-4 w-32" />
      <SkeletonBox className="h-8 w-20" />
      <SkeletonBox className="h-3 w-48" />
    </div>
  )
}

// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon:        ReactNode
  title:       string
  description: string
  action?:     ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-gray-300 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────
// DELTA INDICATOR (up/down arrow)
// ─────────────────────────────────────────────

export function Delta({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const isPositive = value > 0
  const isGood     = inverse ? !isPositive : isPositive
  const color      = value === 0 ? 'text-gray-500' : isGood ? 'text-green-400' : 'text-red-400'

  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-xs font-medium', color)}>
      {value !== 0 && (
        <span>{isPositive ? '↑' : '↓'}</span>
      )}
      {Math.abs(value)}%
    </span>
  )
}

// ─────────────────────────────────────────────
// ERROR BOUNDARY FALLBACK
// ─────────────────────────────────────────────

export function ErrorCard({ message }: { message?: string }) {
  return (
    <div className="card p-5 border-red-500/30 bg-red-500/5">
      <div className="flex items-center gap-2 text-red-400">
        <span className="text-lg">⚠</span>
        <span className="text-sm font-medium">{message ?? 'Failed to load data'}</span>
      </div>
    </div>
  )
}
