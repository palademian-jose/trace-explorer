import type { Span } from './schema';

export interface WaterfallRow {
  span: Span;
  depth: number;
  /** Milliseconds from the start of the trace to the start of this span. */
  offsetMs: number;
  /** Milliseconds the bar covers. */
  durationMs: number;
  childCount: number;
  /** The span names a parent that is not in the data, so it was promoted to a root. */
  orphan: boolean;
}

export interface Waterfall {
  rows: WaterfallRow[];
  /** Length of the time axis in milliseconds. */
  totalMs: number;
  orphanCount: number;
  duplicateCount: number;
}

/**
 * Lay out one trace as a tree built from `parent_span_id`.
 * A span whose parent is missing becomes a root and is flagged `orphan`.
 * Duplicate span ids keep the first span. Cycles cannot hang the walk.
 */
export function buildWaterfall(input: readonly Span[]): Waterfall {
  const byId = new Map<string, Span>();
  let duplicateCount = 0;
  for (const s of input) {
    if (byId.has(s.span_id)) duplicateCount += 1;
    else byId.set(s.span_id, s);
  }
  const spans = [...byId.values()];
  if (spans.length === 0) return { rows: [], totalMs: 0, orphanCount: 0, duplicateCount };

  const children = new Map<string, Span[]>();
  const roots: { span: Span; orphan: boolean }[] = [];
  for (const s of spans) {
    const p = s.parent_span_id;
    if (p === null) roots.push({ span: s, orphan: false });
    else if (p === s.span_id || !byId.has(p)) roots.push({ span: s, orphan: true });
    else {
      const list = children.get(p);
      if (list) list.push(s);
      else children.set(p, [s]);
    }
  }
  const byStart = (a: Span, b: Span) => a.startMs - b.startMs || a.endMs - b.endMs;
  roots.sort((a, b) => byStart(a.span, b.span));

  let t0 = Infinity;
  let t1 = -Infinity;
  for (const s of spans) {
    if (s.startMs < t0) t0 = s.startMs;
    const end = Math.max(s.endMs, s.startMs + s.latency_ms);
    if (end > t1) t1 = end;
  }

  const rows: WaterfallRow[] = [];
  const seen = new Set<string>();
  const walk = (span: Span, depth: number, orphan: boolean): void => {
    if (seen.has(span.span_id)) return;
    seen.add(span.span_id);
    const kids = (children.get(span.span_id) ?? []).sort(byStart);
    rows.push({
      span,
      depth,
      offsetMs: span.startMs - t0,
      durationMs: Math.max(span.latency_ms, span.endMs - span.startMs),
      childCount: kids.length,
      orphan,
    });
    for (const k of kids) walk(k, depth + 1, false);
  };
  for (const r of roots) walk(r.span, 0, r.orphan);
  // Spans trapped in a parent cycle are unreachable from any root; surface them as orphans.
  for (const s of spans) walk(s, 0, true);

  return {
    rows,
    totalMs: Math.max(t1 - t0, 1),
    orphanCount: rows.filter((r) => r.orphan).length,
    duplicateCount,
  };
}
