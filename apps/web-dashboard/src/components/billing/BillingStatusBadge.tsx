import { Badge } from '@/components/shared/ui'

function statusMeta(rawStatus: string | null | undefined): { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' } {
  const status = String(rawStatus ?? 'unknown').trim().toLowerCase()

  switch (status) {
    case 'active':
      return { label: 'Active', variant: 'success' }
    case 'trial':
    case 'trialing':
      return { label: 'Trialing', variant: 'warning' }
    case 'checkout_created':
      return { label: 'Checkout Created', variant: 'warning' }
    case 'past_due':
      return { label: 'Past Due', variant: 'error' }
    case 'incomplete':
      return { label: 'Incomplete', variant: 'error' }
    case 'canceled':
    case 'cancelled':
      return { label: 'Canceled', variant: 'neutral' }
    case 'none':
      return { label: 'No Subscription', variant: 'neutral' }
    default:
      return {
        label: status ? status.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase()) : 'Unknown',
        variant: 'neutral',
      }
  }
}

export function BillingStatusBadge({ status, size = 'sm' }: { status: string | null | undefined; size?: 'xs' | 'sm' | 'md' }) {
  const meta = statusMeta(status)
  return (
    <Badge variant={meta.variant} size={size}>
      {meta.label}
    </Badge>
  )
}
