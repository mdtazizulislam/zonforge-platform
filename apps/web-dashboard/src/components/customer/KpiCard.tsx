import type { ReactNode } from 'react'

export default function KpiCard({
  title,
  value,
  helper,
  tone = 'default',
  children,
}: {
  title: string
  value: string | number
  helper?: string
  tone?: 'default' | 'danger' | 'warning' | 'success'
  children?: ReactNode
}) {
  return (
    <section className={`zf-kpi-card zf-kpi-card--${tone}`}>
      <div className="zf-kpi-card__header">
        <p className="zf-kpi-card__title">{title}</p>
      </div>

      <div className="zf-kpi-card__value">{value}</div>

      {helper ? <p className="zf-kpi-card__helper">{helper}</p> : null}
      {children ? <div className="zf-kpi-card__content">{children}</div> : null}
    </section>
  )
}