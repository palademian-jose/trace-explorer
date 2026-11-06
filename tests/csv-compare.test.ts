import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, csvCell, spansToCsv } from '../src/lib/csv';
import { compareMarkdown, compareRows, pctChange, scenarioStats } from '../src/lib/compare';
import { makeSpan } from './helpers';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(1.5)).toBe('1.5');
    expect(csvCell(false)).toBe('false');
  });
  it('neutralises spreadsheet formulas in text but not numbers', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell(-3)).toBe('-3');
  });
  it('writes a header and one row per span', () => {
    const out = spansToCsv([makeSpan({ span_id: 'a', meta: { k: 'v,1' } })]);
    const lines = out.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines[1]).toContain('"{""k"":""v,1""}"');
  });
});

describe('compare', () => {
  const base = [
    makeSpan({ span_id: 'r1', trace_id: 't1', latency_ms: 1000, cost_usd: 0.1 }),
    makeSpan({ span_id: 'r2', trace_id: 't2', latency_ms: 3000, cost_usd: 0.3, status: 'error' }),
  ];
  const next = [
    makeSpan({ span_id: 'q1', trace_id: 'u1', latency_ms: 500, cost_usd: 0.05 }),
    makeSpan({
      span_id: 'c1',
      trace_id: 'u1',
      parent_span_id: 'q1',
      kind: 'cache',
      cache_hit: true,
    }),
    makeSpan({ span_id: 'q2', trace_id: 'u2', latency_ms: 1500, cost_usd: 0.15 }),
  ];

  it('uses the llmops definitions', () => {
    const s = scenarioStats('baseline', base);
    expect(s.requests).toBe(2);
    expect(s.usdPer1k).toBeCloseTo(200);
    expect(s.p50Ms).toBe(2000);
    expect(s.errorRate).toBe(0.5);
    expect(s.cacheHitRate).toBe(0);
    expect(scenarioStats('x', next).cacheHitRate).toBe(0.5);
  });

  it('computes deltas against the baseline row', () => {
    const rows = compareRows(scenarioStats('before', base), scenarioStats('after', next));
    expect(rows[0]?.costDeltaPct).toBe(0);
    expect(rows[1]?.costDeltaPct).toBeCloseTo(-50);
    expect(rows[1]?.p95DeltaPct).toBeCloseTo(-50);
    expect(pctChange(5, 0)).toBe(0);
  });

  it('renders the llmops markdown layout', () => {
    const md = compareMarkdown(
      compareRows(scenarioStats('before', base), scenarioStats('after', next)),
    );
    const lines = md.split('\n');
    expect(lines[0]).toBe(
      '| Scenario | requests | $/1k req | Δ cost | p50 ms | p95 ms | Δ p95 | cache hit rate | error rate |',
    );
    expect(lines[2]).toBe('| before | 2 | 200.00 | +0% | 2000 | 2900 | +0% | 0% | 50.0% |');
    expect(lines[3]).toContain('| after | 2 | 100.00 | -50% |');
  });

  it('is safe on empty input', () => {
    expect(scenarioStats('e', [])).toMatchObject({ requests: 0, usdPer1k: 0, errorRate: 0 });
  });
});
