import { describe, expect, it } from 'vitest';
import { buildWaterfall } from '../src/lib/waterfall';
import { makeSpan } from './helpers';

const T0 = Date.parse('2026-10-12T12:00:00.000Z');

describe('buildWaterfall', () => {
  it('orders depth-first by start time with offsets', () => {
    const w = buildWaterfall([
      makeSpan({ span_id: 'c2', parent_span_id: 'root', startMs: T0 + 500, latency_ms: 100 }),
      makeSpan({ span_id: 'root', startMs: T0, latency_ms: 1000 }),
      makeSpan({ span_id: 'c1', parent_span_id: 'root', startMs: T0 + 100, latency_ms: 300 }),
      makeSpan({ span_id: 'g1', parent_span_id: 'c1', startMs: T0 + 150, latency_ms: 50 }),
    ]);
    expect(w.rows.map((r) => [r.span.span_id, r.depth])).toEqual([
      ['root', 0],
      ['c1', 1],
      ['g1', 2],
      ['c2', 1],
    ]);
    expect(w.rows[1]?.offsetMs).toBe(100);
    expect(w.rows[0]?.childCount).toBe(2);
    expect(w.totalMs).toBe(1000);
    expect(w.orphanCount).toBe(0);
  });

  it('promotes spans with a missing parent to flagged roots', () => {
    const w = buildWaterfall([
      makeSpan({ span_id: 'a', parent_span_id: 'missing', startMs: T0 }),
      makeSpan({ span_id: 'b', parent_span_id: 'a', startMs: T0 + 10 }),
      makeSpan({ span_id: 'r', startMs: T0 + 5 }),
    ]);
    expect(w.orphanCount).toBe(1);
    const a = w.rows.find((r) => r.span.span_id === 'a');
    expect(a).toMatchObject({ orphan: true, depth: 0 });
    expect(w.rows.find((r) => r.span.span_id === 'b')).toMatchObject({ orphan: false, depth: 1 });
    expect(w.rows.find((r) => r.span.span_id === 'r')?.orphan).toBe(false);
  });

  it('survives cycles and self-parents', () => {
    const w = buildWaterfall([
      makeSpan({ span_id: 'a', parent_span_id: 'b' }),
      makeSpan({ span_id: 'b', parent_span_id: 'a' }),
      makeSpan({ span_id: 'self', parent_span_id: 'self' }),
    ]);
    expect(w.rows).toHaveLength(3);
    expect(w.orphanCount).toBe(2);
  });

  it('keeps the first of duplicate span ids and reports the count', () => {
    const w = buildWaterfall([
      makeSpan({ span_id: 'a', name: 'first' }),
      makeSpan({ span_id: 'a', name: 'second' }),
    ]);
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]?.span.name).toBe('first');
    expect(w.duplicateCount).toBe(1);
  });

  it('returns an empty layout for no spans', () => {
    expect(buildWaterfall([])).toEqual({ rows: [], totalMs: 0, orphanCount: 0, duplicateCount: 0 });
  });
});
