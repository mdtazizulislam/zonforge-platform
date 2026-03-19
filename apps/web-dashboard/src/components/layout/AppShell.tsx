import { type ReactNode } from 'react'
import { clsx } from 'clsx'
import { Sidebar } from './Sidebar'
import { useUiStore } from '@/stores/auth.store'

interface AppShellProps {
  children: ReactNode
  title?:   string
  actions?: ReactNode
}

export function AppShell({ children, title, actions }: AppShellProps) {
  const { sidebarCollapsed } = useUiStore()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        {(title || actions) && (
          <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800
                             bg-gray-950/90 backdrop-blur sticky top-0 z-10">
            <h1 className="text-base font-semibold text-gray-100">{title}</h1>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </header>
        )}

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}

// ── Page wrapper with padding ─────────────────

export function PageContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('p-6 max-w-screen-2xl mx-auto', className)}>
      {children}
    </div>
  )
}
