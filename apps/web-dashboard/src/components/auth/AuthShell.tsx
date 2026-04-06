import React from 'react'

type AuthShellProps = {
  title: string
  subtitle: string
  children: React.ReactNode
}

const valuePoints = [
  'Proactive Threat Detection',
  'Cloud Security Signals',
  'Identity Threat Protection',
]

const footerPills = ['AI-Native Detection', 'Analyst-Ready', 'Multi-Source Visibility']

export default function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="zf-auth-page">
      <section className="zf-auth-brand" aria-label="ZonForge brand panel">
        <div className="zf-brand-top">
          <div className="zf-logo-row">
            <div className="zf-logo-badge">ZF</div>
            <div className="zf-logo-text">ZonForge Sentinel</div>
          </div>

          <p className="zf-kicker">AI-Powered Cyber Early Warning</p>
          <h2 className="zf-auth-heading">{title}</h2>
          <p className="zf-auth-subheading">{subtitle}</p>

          <ul className="zf-value-list">
            {valuePoints.map((item) => (
              <li key={item}>
                <span className="zf-value-dot" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="zf-brand-bottom">
          <div className="zf-brand-footer">
            {footerPills.map((pill) => (
              <span key={pill} className="zf-pill">
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="zf-auth-card-wrap">{children}</section>
    </div>
  )
}