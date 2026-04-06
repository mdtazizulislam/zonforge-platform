import { CustomerLayout } from '@/components/customer/CustomerLayout'
import { useAssistantSuggestions, useRiskSummary, usePipelineHealth } from '@/hooks/queries'

export default function CustomerAiAssistantPage() {
  const suggestionsQuery = useAssistantSuggestions()
  const riskSummaryQuery = useRiskSummary()
  const pipelineHealthQuery = usePipelineHealth()
  const suggestions = suggestionsQuery.data?.data ?? []
  const riskScore = riskSummaryQuery.data?.data?.postureScore ?? 0
  const overallPipeline = pipelineHealthQuery.data?.data?.overall ?? 'unknown'

  return (
    <CustomerLayout
      title="Customer AI Assistant"
      subtitle="Guided prompts and concise posture context for customer-facing conversations."
    >
      <div className="zf-dashboard-grid">
        <section className="zf-panel-card zf-full-span zf-customer-shell-hero">
          <div>
            <p className="zf-panel-heading__eyebrow">Assistant context</p>
            <h2 className="zf-panel-heading__title">Prepared for executive questions</h2>
            <p className="zf-panel-heading__meta">The customer assistant stays lightweight here: suggested prompts, posture context, and service health.</p>
          </div>
          <div className="zf-customer-shell-stat-grid">
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Suggested prompts</span>
              <strong className="zf-customer-shell-stat__value">{suggestions.length}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Risk score</span>
              <strong className="zf-customer-shell-stat__value">{Number(riskScore) || 0}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Pipeline state</span>
              <strong className="zf-customer-shell-stat__value">{String(overallPipeline).toUpperCase()}</strong>
            </article>
          </div>
        </section>

        <section className="zf-panel-card zf-span-8">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Prompt library</p>
              <h2 className="zf-panel-heading__title">Recommended questions</h2>
            </div>
          </div>
          {suggestionsQuery.isLoading ? (
            <div className="zf-panel-empty">Loading customer-safe AI prompts.</div>
          ) : suggestions.length === 0 ? (
            <div className="zf-panel-empty">No AI assistant prompts are available right now.</div>
          ) : (
            <div className="zf-customer-shell-list">
              {suggestions.map((suggestion) => (
                <article key={suggestion} className="zf-customer-shell-list__item">
                  <div className="zf-customer-shell-list__row">
                    <div>
                      <h3>{suggestion}</h3>
                      <p>Use this prompt for concise customer conversations without switching into the analyst assistant workflow.</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="zf-panel-card zf-span-4">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Suggested usage</p>
              <h2 className="zf-panel-heading__title">Conversation framing</h2>
            </div>
          </div>
          <div className="zf-action-list">
            <div className="zf-action-item"><span className="zf-action-item__index">01</span><p>Ask for a summary of today’s highest-priority customer risks.</p></div>
            <div className="zf-action-item"><span className="zf-action-item__index">02</span><p>Request a plain-language explanation of alert concentration by source.</p></div>
            <div className="zf-action-item"><span className="zf-action-item__index">03</span><p>Use the analyst assistant route only when you need full investigative detail.</p></div>
          </div>
        </section>
      </div>
    </CustomerLayout>
  )
}