import type { Span } from './schema';

/** Linear-interpolation percentile (the same method as numpy default). `p` is 0..100. */
export function percentileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (rank - lo);
}

export function percentile(values: readonly number[], p: number): number {
  return percentileSorted(
    [...values].sort((a, b) => a - b),
    p,
  );
}

export interface TraceSummary {
  traceId: string;
  name: string;
  feature: string;
  startMs: number;
  endMs: number;
  /** Root span latency when a root exists, otherwise the extent of the spans. */
  durationMs: number;
  spanCount: number;
  costUsd: number;
  tokens: number;
  hasError: boolean;
  cacheHit: boolean;
  models: string[];
  /** True when no span of the trace is a true root (parent_span_id null). */
  rootless: boolean;
}

export function summarizeTraces(spans: readonly Span[]): TraceSummary[] {
  const groups = new Map<string, Span[]>();
  for (const s of spans) {
    const g = groups.get(s.trace_id);
    if (g) g.push(s);
    else groups.set(s.trace_id, [s]);
  }
  const out: TraceSummary[] = [];
  for (const [traceId, group] of groups) {
    let start = Infinity;
    let end = -Infinity;
    let cost = 0;
    let tokens = 0;
    let hasError = false;
    let cacheHit = false;
    let root: Span | undefined;
    const models = new Set<string>();
    for (const s of group) {
      if (s.startMs < start) start = s.startMs;
      if (s.endMs > end) end = s.endMs;
      cost += s.cost_usd;
      tokens += s.input_tokens + s.output_tokens;
      if (s.status === 'error') hasError = true;
      if (s.kind === 'cache' && s.cache_hit) cacheHit = true;
      if (s.model) models.add(s.model);
      if (s.parent_span_id === null && (!root || s.startMs < root.startMs)) root = s;
    }
    const first = root ?? group.reduce((a, b) => (b.startMs < a.startMs ? b : a));
    out.push({
      traceId,
      name: first.name,
      feature: first.feature,
      startMs: start,
      endMs: end,
      durationMs: root ? root.latency_ms : end - start,
      spanCount: group.length,
      costUsd: cost,
      tokens,
      hasError,
      cacheHit,
      models: [...models].sort(),
      rootless: root === undefined,
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

export interface Overview {
  spans: number;
  traces: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** Share of traces containing an error span. */
  errorRate: number;
  /** Share of traces served by at least one cache hit (the llmops definition). */
  cacheHitRate: number;
  p50: number;
  p95: number;
  p99: number;
}

export function overview(spans: readonly Span[], traces: readonly TraceSummary[]): Overview {
  let cost = 0;
  let inTok = 0;
  let outTok = 0;
  for (const s of spans) {
    cost += s.cost_usd;
    inTok += s.input_tokens;
    outTok += s.output_tokens;
  }
  const durations = traces.map((t) => t.durationMs).sort((a, b) => a - b);
  const n = traces.length;
  return {
    spans: spans.length,
    traces: n,
    costUsd: cost,
    inputTokens: inTok,
    outputTokens: outTok,
    errorRate: n ? traces.filter((t) => t.hasError).length / n : 0,
    cacheHitRate: n ? traces.filter((t) => t.cacheHit).length / n : 0,
    p50: percentileSorted(durations, 50),
    p95: percentileSorted(durations, 95),
    p99: percentileSorted(durations, 99),
  };
}

export interface CostGroup {
  key: string;
  costUsd: number;
  calls: number;
  tokens: number;
}

/** Sum cost per `model` or `feature`. Spans without a model are skipped for `model`. */
export function costBy(spans: readonly Span[], field: 'model' | 'feature'): CostGroup[] {
  const map = new Map<string, CostGroup>();
  for (const s of spans) {
    const key = s[field];
    if (key === null || key === '') continue;
    let g = map.get(key);
    if (!g) {
      g = { key, costUsd: 0, calls: 0, tokens: 0 };
      map.set(key, g);
    }
    g.costUsd += s.cost_usd;
    g.calls += 1;
    g.tokens += s.input_tokens + s.output_tokens;
  }
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export interface KindLatency {
  kind: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

export function latencyByKind(spans: readonly Span[]): KindLatency[] {
  const map = new Map<string, number[]>();
  for (const s of spans) {
    const g = map.get(s.kind);
    if (g) g.push(s.latency_ms);
    else map.set(s.kind, [s.latency_ms]);
  }
  return [...map.entries()]
    .map(([kind, values]) => {
      values.sort((a, b) => a - b);
      return {
        kind,
        count: values.length,
        p50: percentileSorted(values, 50),
        p95: percentileSorted(values, 95),
        p99: percentileSorted(values, 99),
      };
    })
    .sort((a, b) => b.p95 - a.p95);
}

export interface TimeBucket {
  startMs: number;
  requests: number;
  errors: number;
}

/** Count traces per equal-width time bucket, by trace start. */
export function requestsOverTime(traces: readonly TraceSummary[], buckets = 24): TimeBucket[] {
  if (traces.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const t of traces) {
    if (t.startMs < min) min = t.startMs;
    if (t.startMs > max) max = t.startMs;
  }
  const width = Math.max((max - min) / buckets, 1);
  const out: TimeBucket[] = Array.from({ length: buckets }, (_, i) => ({
    startMs: min + i * width,
    requests: 0,
    errors: 0,
  }));
  for (const t of traces) {
    const i = Math.min(Math.floor((t.startMs - min) / width), buckets - 1);
    const b = out[i];
    if (b) {
      b.requests += 1;
      if (t.hasError) b.errors += 1;
    }
  }
  return out;
}
