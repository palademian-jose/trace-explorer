import type { Span } from '../src/lib/schema';

const T0 = Date.parse('2026-10-12T12:00:00.000Z');

export function makeSpan(over: Partial<Span> & { span_id: string }): Span {
  const startMs = over.startMs ?? T0;
  const latency = over.latency_ms ?? 100;
  const endMs = over.endMs ?? startMs + latency;
  return {
    trace_id: 't1',
    parent_span_id: null,
    name: 'span',
    kind: 'other',
    start_ts: new Date(startMs).toISOString(),
    end_ts: new Date(endMs).toISOString(),
    latency_ms: latency,
    model: null,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    cache_hit: false,
    feature: 'rag.answer',
    user_id: 'u1',
    session_id: null,
    status: 'ok',
    error_kind: null,
    meta: {},
    ...over,
    startMs,
    endMs,
  };
}

export function spanLine(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    trace_id: 't1',
    span_id: 's1',
    parent_span_id: null,
    name: 'generate',
    kind: 'llm',
    start_ts: '2026-10-12T12:00:00.000Z',
    end_ts: '2026-10-12T12:00:01.000Z',
    latency_ms: 1000,
    model: 'anthropic/claude-sonnet-4.5',
    input_tokens: 10,
    output_tokens: 5,
    cost_usd: 0.001,
    cache_hit: false,
    feature: 'rag.answer',
    user_id: 'u1',
    session_id: null,
    status: 'ok',
    error_kind: null,
    meta: {},
    ...over,
  });
}
