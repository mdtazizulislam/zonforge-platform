import { ReceiptText, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/shared/ui'

export function BillingInvoiceHistoryShell() {
  return (
    <Card className="border-gray-800 bg-gray-900/90 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-950/80 px-3 py-1 text-xs font-medium text-gray-400">
            <ReceiptText className="h-3.5 w-3.5" />
            Invoice history integration pending
          </div>
          <h3 className="text-lg font-semibold text-gray-100">Payment history</h3>
          <p className="mt-2 text-sm text-gray-400">
            The billing dashboard is wired to live subscription state today. Invoice and payment history remain intentionally empty until a tenant-scoped backend invoice endpoint is exposed.
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100 lg:max-w-sm">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4" />
            Integration-safe placeholder
          </div>
          <p className="text-cyan-100/80">
            No fake invoices are rendered here. When a real `/v1/billing/invoices` endpoint exists, this section can swap to live data without changing page structure.
          </p>
        </div>
      </div>
    </Card>
  )
}
