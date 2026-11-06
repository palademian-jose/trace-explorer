import type { Span } from './schema';
import { percentile } from './stats';

/** One row of the before/after table, using the same definitions as `llmops compare`. */
export interface ScenarioStats {
  scenario: string;
  requests: number;
  usdPer1k: number;
  p50Ms: number;
  p95Ms: number;
  cacheHitRate: number;
  errorRate: number;
}

/** Requests are distinct traces, cost sums every span, latency and errors use root spans. */
export function scenarioStats(name: string, spans: readonly Span[]): ScenarioStats {
  const traces = new Set<string>();
  const hitTraces = new Set<string>();
  const roots: Span[] = [];
  let cost = 0;
  for (const s of spans) {
    traces.add(s.trace_id);
    cost += s.cost_usd;
    if (s.kind === 'cache' && s.cache_hit) hitTraces.add(s.trace_id);
    if (s.parent_span_id === null) roots.push(s);
  }
  const n = traces.size;
  const lat = roots.map((r) => r.latency_ms);
  return {
    scenario: name,
    requests: n,
    usdPer1k: n ? (cost / n) * 1000 : 0,
    p50Ms: percentile(lat, 50),
    p95Ms: percentile(lat, 95),
    cacheHitRate: n ? hitTraces.size / n : 0,
    errorRate: roots.length ? roots.filter((r) => r.status === 'error').length / roots.length : 0,
  };
}

export function pctChange(next: number, base: number): number {
  return base ? ((next - base) / base) * 100 : 0;
}

export interface CompareRow {
  stats: ScenarioStats;
  costDeltaPct: number;
  p95DeltaPct: number;
}

export function compareRows(base: ScenarioStats, other: ScenarioStats): CompareRow[] {
  return [
    { stats: base, costDeltaPct: 0, p95DeltaPct: 0 },
    {
      stats: other,
      costDeltaPct: pctChange(other.usdPer1k, base.usdPer1k),
      p95DeltaPct: pctChange(other.p95Ms, base.p95Ms),
    },
  ];
}

const signed = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(0) + '%';

/** Markdown in the same column layout `llmops before-after` prints. */
export function compareMarkdown(rows: readonly CompareRow[]): string {
  const lines = [
    '| Scenario | requests | $/1k req | Δ cost | p50 ms | p95 ms | Δ p95 | cache hit rate | error rate |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { stats: r, costDeltaPct, p95DeltaPct } of rows) {
    lines.push(
      [
        '',
        r.scenario,
        r.requests,
        r.usdPer1k.toFixed(2),
        signed(costDeltaPct),
        r.p50Ms.toFixed(0),
        r.p95Ms.toFixed(0),
        signed(p95DeltaPct),
        (r.cacheHitRate * 100).toFixed(0) + '%',
        (r.errorRate * 100).toFixed(1) + '%',
        '',
      ]
        .join(' | ')
        .trim(),
    );
  }
  return lines.join('\n');
}
