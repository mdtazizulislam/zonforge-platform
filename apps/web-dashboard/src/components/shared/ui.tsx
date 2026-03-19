import { type CSSProperties, type ReactNode, forwardRef } from 'react'
import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'

// ─────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────

export type BadgeVariant =
  | 'critical' | 'high' | 'medium' | 'low' | 'info'
  | 'open' | 'investigating' | 'resolved' | 'suppressed' | 'false_positive'
  | 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
  | 'success' | 'warning' | 'error' | 'neutral'

const BADGE_STYLES: Record<BadgeVariant, string> = {
  // Severity
  critical:      'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  high:          'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30',
  medium:        'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30',
  low:           'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
  info:          'bg-gray-700 text-gray-400',
  // Status
  open:          'bg-red-500/10 text-red-400',
  investigating: 'bg-yellow-500/10 text-yellow-400',
  resolved:      'bg-green-500/10 text-green-400',
  suppressed:    'bg-gray-700 text-gray-500',
  false_positive:'bg-gray-700 text-gray-500',
  // Priority
  P1: 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40',
  P2: 'bg-orange-500/20 text-orange-300',
  P3: 'bg-yellow-500/20 text-yellow-300',
  P4: 'bg-blue-500/20 text-blue-300',
  P5: 'bg-gray-700 text-gray-400',
  // Generic
  success: 'bg-green-500/15 text-green-400',
  warning: 'bg-yellow-500/15 text-yellow-400',
  error:   'bg-red-500/15 text-red-400',
  neutral: 'bg-gray-700 text-gray-400',
}

export function Badge({
  variant, children, size = 'sm', dot = false, className,
}: {
  variant:   BadgeVariant
  children:  ReactNode
  size?:     'xs' | 'sm' | 'md'
  dot?:      boolean
  className?: string
}) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 rounded-full font-medium',
      size === 'xs' ? 'px-1.5 py-0.5 text-xs'
      : size === 'sm' ? 'px-2 py-0.5 text-xs'
      : 'px-2.5 py-1 text-sm',
      BADGE_STYLES[variant] ?? BADGE_STYLES.neutral,
      className,
    )}>
      {dot && (
        <span className={clsx('h-1.5 w-1.5 rounded-full', {
          'bg-red-400':    ['critical', 'P1'].includes(variant),
          'bg-orange-400': ['high',     'P2'].includes(variant),
          'bg-yellow-400': ['medium', 'investigating', 'P3'].includes(variant),
          'bg-blue-400':   ['low',    'P4'].includes(variant),
          'bg-green-400':  ['resolved', 'success'].includes(variant),
          'bg-gray-400':   ['info', 'neutral', 'suppressed', 'false_positive'].includes(variant),
        })} />
      )}
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────
// BUTTON
// ─────────────────────────────────────────────

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?:    'sm' | 'md' | 'lg'
  loading?: boolean
  icon?:    React.ElementType
  iconRight?: React.ElementType
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'secondary', size = 'md', loading, icon: Icon,
  iconRight: IconRight, children, disabled, className, ...props
}, ref) => {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all'
  const variants = {
    primary:   'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700',
    secondary: 'bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700',
    ghost:     'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
    danger:    'bg-red-600 text-white hover:bg-red-500',
    outline:   'border border-gray-700 text-gray-300 hover:border-gray-600 hover:text-gray-100',
  }
  const sizes = {
    sm:  'px-3 py-1.5 text-xs',
    md:  'px-4 py-2 text-sm',
    lg:  'px-5 py-2.5 text-base',
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        base, variants[variant], sizes[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : Icon && <Icon className={clsx('flex-shrink-0', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      }
      {children}
      {!loading && IconRight && (
        <IconRight className={clsx('flex-shrink-0', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      )}
    </button>
  )
})
Button.displayName = 'Button'

// ─────────────────────────────────────────────
// SPINNER
// ─────────────────────────────────────────────

export function Spinner({ size = 'md', className }: {
  size?: 'sm' | 'md' | 'lg'; className?: string
}) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }
  return (
    <Loader2 className={clsx(
      'animate-spin text-blue-500',
      sizes[size], className,
    )} />
  )
}

// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────

export function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon:        React.ElementType
  title:       string
  description?: string
  action?:     ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-gray-800/80 p-5 mb-4">
        <Icon className="h-8 w-8 text-gray-600" />
      </div>
      <p className="text-base font-medium text-gray-300 mb-1">{title}</p>
      {description && (
        <p className="text-sm text-gray-500 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded bg-gray-800', className)} />
}

export function SkeletonRows({ count = 4, cols = 4 }: { count?: number; cols?: number }) {
  return (
    <div className="divide-y divide-gray-800">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          {[...Array(cols)].map((_, j) => (
            <Skeleton key={j} className={clsx(
              'h-4 flex-1',
              j === 0 && 'max-w-[2rem]',
              j === 1 && 'max-w-[50%]',
            )} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// TOOLTIP (simple CSS-driven)
// ─────────────────────────────────────────────

export function Tooltip({
  content, children, side = 'top',
}: {
  content: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <div className="relative group inline-flex">
      {children}
      <div className={clsx(
        'pointer-events-none absolute z-50 hidden group-hover:flex',
        'max-w-xs rounded-lg bg-gray-800 border border-gray-700',
        'px-2.5 py-1.5 text-xs text-gray-200 whitespace-nowrap shadow-xl',
        side === 'top'    && 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        side === 'bottom' && 'top-full left-1/2 -translate-x-1/2 mt-2',
        side === 'left'   && 'right-full top-1/2 -translate-y-1/2 mr-2',
        side === 'right'  && 'left-full top-1/2 -translate-y-1/2 ml-2',
      )}>
        {content}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────

export function Card({
  children, className, padding = 'md', style,
}: {
  children:  ReactNode
  className?: string
  padding?:  'sm' | 'md' | 'lg' | 'none'
  style?:    CSSProperties
}) {
  return (
    <div
      style={style}
      className={clsx(
        'rounded-xl border border-gray-800 bg-gray-900',
        padding === 'sm'   && 'p-4',
        padding === 'md'   && 'p-5',
        padding === 'lg'   && 'p-6',
        padding === 'none' && '',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title, description, actions, icon: Icon,
}: {
  title:       string
  description?: string
  actions?:    ReactNode
  icon?:       React.ElementType
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="rounded-lg bg-gray-800 p-2">
            <Icon className="h-4 w-4 text-gray-400" />
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────
// DIVIDER
// ─────────────────────────────────────────────

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="h-px bg-gray-800 my-4" />
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-800" />
      <span className="text-xs text-gray-600 font-medium uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  )
}
