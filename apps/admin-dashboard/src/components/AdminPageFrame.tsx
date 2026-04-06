import type { ReactNode } from 'react'

export function AdminPageFrame({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="zf-admin-page">
      <div className="zf-admin-page-head">
        <div>
          <p className="zf-admin-eyebrow">Admin Route</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {actions ? <div className="zf-admin-page-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}