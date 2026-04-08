import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/shared/ui'

export function BillingConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  pending?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-2xl shadow-black/40">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-2xl bg-red-500/10 p-3 text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
            <p className="mt-2 text-sm text-gray-400">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Keep Plan</Button>
          <Button variant="danger" onClick={onConfirm} loading={pending}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
