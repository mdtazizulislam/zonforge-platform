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
      <div className="zf-page">
        <div className="zf-container">
          <section className="zf-section">
            <div className="zf-section-head">
              <h1 className="zf-page-title">AI Assistant</h1>
              <p className="zf-page-subtitle">Guided prompts and concise posture context in the same premium customer shell.</p>
            </div>

            <div className="zf-grid zf-grid-2">
              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Prepared for executive questions</h2>
                  <p className="zf-card-subtitle">Suggested prompts, posture context, and service health in a lighter customer shell.</p>
                </div>
                <div className="zf-detail-list">
                  <div className="zf-detail-row">
                    <span className="zf-label">Suggested Prompts</span>
                    <span className="zf-value">{suggestions.length}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Risk Score</span>
                    <span className="zf-value">{Number(riskScore) || 0}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Pipeline State</span>
                    <span className="zf-value">{String(overallPipeline).toUpperCase()}</span>
                  </div>
                </div>
              </section>

              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Recommended questions</h2>
                  <p className="zf-card-subtitle">Customer-safe prompts without switching into the analyst assistant route.</p>
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

              <section className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Conversation framing</h2>
                  <p className="zf-card-subtitle">A simple prompt strategy for customer-facing briefings.</p>
                </div>
                <div className="zf-action-list">
                  <div className="zf-action-item"><span className="zf-action-item__index">01</span><p>Ask for a summary of today’s highest-priority customer risks.</p></div>
                  <div className="zf-action-item"><span className="zf-action-item__index">02</span><p>Request a plain-language explanation of alert concentration by source.</p></div>
                  <div className="zf-action-item"><span className="zf-action-item__index">03</span><p>Use the analyst assistant route only when you need full investigative detail.</p></div>
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>
    </CustomerLayout>
  )
}