import type { ReactNode } from 'react'
import { CustomerSidebar } from '@/components/customer/CustomerSidebar'
import { CustomerHeader } from '@/components/customer/CustomerHeader'

type CustomerLayoutProps = {
  title?: string
  subtitle?: string
  children: ReactNode
}

export function CustomerLayout({
  title,
  subtitle,
  children,
}: CustomerLayoutProps) {
  return (
    <div className="zf-customer-app">
      <CustomerSidebar />
      <div className="zf-customer-main">
        <CustomerHeader title={title} subtitle={subtitle} />
        <main className="zf-customer-content">
          {children}
        </main>
      </div>
    </div>
  )
}