import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Construction } from 'lucide-react'
export default function AuditLogPage() {
  return <AppShell title="Audit Log"><PageContent>
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="rounded-full bg-blue-500/10 p-5 mb-4"><Construction className="h-10 w-10 text-blue-400" /></div>
      <h2 className="text-xl font-bold text-gray-200 mb-2">Tamper-Evident Audit Log</h2>
      <p className="text-gray-500 max-w-sm">Audit log viewer coming in Serial 14.</p>
    </div></PageContent></AppShell>
}
