import { describe, expect, it } from 'vitest';
import {
  costBy,
  latencyByKind,
  overview,
  percentile,
  requestsOverTime,
  summarizeTraces,
} from '../src/lib/stats';
import { makeSpan } from './helpers';

describe('percentile', () => {
  it('matches linear interpolation', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10], 99)).toBe(10);
    expect(percentile([], 50)).toBe(0);
    expect(percentile([1, 2, 3, 4, 5], 95)).toBeCloseTo(4.8);
  });
  it('does not mutate its input', () => {
    const v = [3, 1, 2];
    percentile(v, 50);
    expect(v).toEqual([3, 1, 2]);
  });
});

const spans = [
  makeSpan({ span_id: 'a', trace_id: 't1', latency_ms: 1000, name: 'root', cost_usd: 0 }),
  makeSpan({
    span_id: 'b',
    trace_id: 't1',
    parent_span_id: 'a',
    kind: 'llm',
    model: 'm1',
    latency_ms: 800,
    cost_usd: 0.5,
    input_tokens: 100,
    output_tokens: 20,
  }),
  makeSpan({ span_id: 'c', trace_id: 't2', latency_ms: 2000, status: 'error' }),
  makeSpan({
    span_id: 'd',
    trace_id: 't2',
    parent_span_id: 'c',
    kind: 'cache',
    cache_hit: true,
    latency_ms: 5,
  }),
  makeSpan({
    span_id: 'e',
    trace_id: 't2',
    parent_span_id: 'c',
    kind: 'llm',
    model: 'm2',
    cost_usd: 0.25,
    latency_ms: 400,
  }),
];

describe('summarizeTraces', () => {
  it('groups per trace and uses root latency', () => {
    const t = summarizeTraces(spans);
    expect(t).toHaveLength(2);
    const t1 = t.find((x) => x.traceId === 't1');
    expect(t1).toMatchObject({ durationMs: 1000, spanCount: 2, costUsd: 0.5, tokens: 120 });
    expect(t1?.models).toEqual(['m1']);
    const t2 = t.find((x) => x.traceId === 't2');
    expect(t2).toMatchObject({ hasError: true, cacheHit: true, durationMs: 2000 });
  });
  it('falls back to span extent when there is no root', () => {
    const t = summarizeTraces([
      makeSpan({ span_id: 'x', parent_span_id: 'gone', latency_ms: 100 }),
      makeSpan({
        span_id: 'y',
        parent_span_id: 'x',
        startMs: Date.parse('2026-10-12T12:00:00Z') + 50,
        latency_ms: 200,
      }),
    ]);
    expect(t[0]?.rootless).toBe(true);
    expect(t[0]?.durationMs).toBe(250);
  });
});

describe('overview', () => {
  it('computes totals and rates', () => {
    const o = overview(spans, summarizeTraces(spans));
    expect(o.spans).toBe(5);
    expect(o.traces).toBe(2);
    expect(o.costUsd).toBeCloseTo(0.75);
    expect(o.inputTokens).toBe(100);
    expect(o.outputTokens).toBe(20);
    expect(o.errorRate).toBe(0.5);
    expect(o.cacheHitRate).toBe(0.5);
    expect(o.p50).toBe(1500);
  });
  it('handles empty input', () => {
    const o = overview([], []);
    expect(o).toMatchObject({ traces: 0, errorRate: 0, p95: 0 });
  });
});

describe('group-bys', () => {
  it('costBy model skips spans without a model and sorts by cost', () => {
    const g = costBy(spans, 'model');
    expect(g.map((x) => x.key)).toEqual(['m1', 'm2']);
    expect(g[0]?.costUsd).toBe(0.5);
  });
  it('costBy feature includes every span', () => {
    expect(costBy(spans, 'feature')[0]).toMatchObject({ key: 'rag.answer', calls: 5 });
  });
  it('latencyByKind', () => {
    const k = latencyByKind(spans);
    expect(k.find((x) => x.kind === 'llm')).toMatchObject({ count: 2, p50: 600 });
    expect(k[0]?.kind).toBe('other');
  });
});

describe('requestsOverTime', () => {
  it('puts every trace in exactly one bucket', () => {
    const t = summarizeTraces(
      Array.from({ length: 50 }, (_, i) =>
        makeSpan({ span_id: 's' + i, trace_id: 't' + i, startMs: 1_000_000 + i * 1000 }),
      ),
    );
    const b = requestsOverTime(t, 10);
    expect(b).toHaveLength(10);
    expect(b.reduce((n, x) => n + x.requests, 0)).toBe(50);
  });
  it('returns nothing for no traces', () => {
    expect(requestsOverTime([])).toEqual([]);
  });
});
