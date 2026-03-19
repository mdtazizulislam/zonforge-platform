// ─────────────────────────────────────────────────────────────────
// ZonForge Sentinel — Distributed tracing helpers (OpenTelemetry API)
//
// Uses @opentelemetry/api only so the package builds without the full SDK.
// Until a global TracerProvider is registered, the API uses no-op tracers
// (safe for local dev). Production can register a provider via bootstrap code
// or external auto-instrumentation.
// ─────────────────────────────────────────────────────────────────

import {
  trace,
  context as otContext,
  propagation,
  SpanKind,
  SpanStatusCode,
  type Context,
  type Span,
  type SpanOptions,
  type Tracer,
} from '@opentelemetry/api'

// ─────────────────────────────────────────────────────────────────
// SDK hook — optional full SDK wiring lives outside this package
// ─────────────────────────────────────────────────────────────────

export function initTracing(_serviceName: string): void {
  // Intentionally empty: avoids a hard dependency on @opentelemetry/sdk-node.
  // When you add a NodeSDK in your entrypoint, call it there and register a provider.
}

// ─────────────────────────────────────────────────────────────────
// TRACER FACTORY
// ─────────────────────────────────────────────────────────────────

export function getTracer(name: string): Tracer {
  return trace.getTracer(name, process.env['SERVICE_VERSION'] ?? '0.0.0')
}

// ─────────────────────────────────────────────────────────────────
// TRACING HELPERS
// ─────────────────────────────────────────────────────────────────

export async function withSpan<T>(
  tracer:    Tracer,
  spanName:  string,
  fn:        (span: Span) => Promise<T>,
  options?: {
    kind?:       SpanKind
    attributes?: Record<string, string | number | boolean>
    parentSpan?: Span
  },
): Promise<T> {
  const activeCtx: Context = options?.parentSpan
    ? trace.setSpan(otContext.active(), options.parentSpan)
    : otContext.active()

  const spanOpts: SpanOptions = { kind: options?.kind ?? SpanKind.INTERNAL }
  if (options?.attributes !== undefined) {
    spanOpts.attributes = options.attributes
  }

  const out = await tracer.startActiveSpan(
    spanName,
    spanOpts,
    activeCtx,
    async (span) => {
      try {
        const result = await fn(span)
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (err) {
        span.setStatus({
          code:    SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : 'Unknown error',
        })
        if (err instanceof Error) {
          span.recordException(err)
        }
        throw err
      } finally {
        span.end()
      }
    },
  )
  return out as T
}

// ─────────────────────────────────────────────────────────────────
// BULLMQ TRACING HELPERS
// ─────────────────────────────────────────────────────────────────

export function injectTraceContext<T extends Record<string, unknown>>(data: T): T {
  const carrier: Record<string, string> = {}
  propagation.inject(otContext.active(), carrier)
  return { ...data, _otelContext: carrier }
}

export function extractTraceContext(
  jobData: Record<string, unknown>,
): Context {
  const carrier = (jobData['_otelContext'] ?? {}) as Record<string, string>
  return propagation.extract(otContext.active(), carrier)
}

export function withJobTracing<T>(
  tracer:    Tracer,
  spanName:  string,
  processor: (job: { id?: string; name?: string; queueName?: string; attemptsMade?: number; data?: unknown }, span: Span) => Promise<T>,
) {
  return async (job: { id?: string; name?: string; queueName?: string; attemptsMade?: number; data?: unknown }): Promise<T> => {
    const parentCtx = extractTraceContext((job.data ?? {}) as Record<string, unknown>)

    return otContext.with(parentCtx, () =>
      withSpan(tracer, spanName, async (span) => {
        span.setAttributes({
          'bullmq.job.id':    String(job.id ?? ''),
          'bullmq.job.name':  String(job.name ?? ''),
          'bullmq.queue':     String(job.queueName ?? ''),
          'bullmq.attempt':   job.attemptsMade ?? 0,
        })
        return processor(job, span)
      }, { kind: SpanKind.CONSUMER }),
    )
  }
}

// ─────────────────────────────────────────────────────────────────
// DETECTION ENGINE TRACING
// ─────────────────────────────────────────────────────────────────

export interface DetectionTraceAttrs {
  tenantId:   string
  ruleId?:    string
  entityId?:  string
  severity?:  string
  confidence?: number
}

export function traceDetection(
  tracer:     Tracer,
  operation:  'evaluate_rule' | 'emit_signal' | 'correlate' | 'score_risk',
  attrs:      DetectionTraceAttrs,
  fn:         (span: Span) => Promise<unknown>,
): Promise<unknown> {
  return withSpan(
    tracer,
    `zonforge.detection.${operation}`,
    async (span) => {
      span.setAttributes({
        'zonforge.tenant_id':   attrs.tenantId,
        'zonforge.rule_id':     attrs.ruleId    ?? '',
        'zonforge.entity_id':   attrs.entityId  ?? '',
        'zonforge.severity':    attrs.severity  ?? '',
        'zonforge.confidence':  attrs.confidence ?? 0,
      })
      return fn(span)
    },
    { kind: SpanKind.INTERNAL },
  )
}
