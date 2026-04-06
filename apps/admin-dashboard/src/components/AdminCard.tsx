import type { ReactNode } from 'react'

export function AdminCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <article className="zf-admin-card">
      <div className="zf-admin-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="zf-admin-card-body">{children}</div>
    </article>
  )
}