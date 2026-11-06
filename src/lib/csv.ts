import type { Span } from './schema';

export const CSV_COLUMNS = [
  'trace_id',
  'span_id',
  'parent_span_id',
  'name',
  'kind',
  'start_ts',
  'end_ts',
  'latency_ms',
  'model',
  'input_tokens',
  'output_tokens',
  'cost_usd',
  'cache_hit',
  'feature',
  'user_id',
  'session_id',
  'status',
  'error_kind',
  'meta',
] as const;

/** Quote a cell. Text that a spreadsheet would read as a formula gets a leading apostrophe. */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function spansToCsv(spans: readonly Span[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const s of spans) {
    lines.push(
      [
        s.trace_id,
        s.span_id,
        s.parent_span_id,
        s.name,
        s.kind,
        s.start_ts,
        s.end_ts,
        s.latency_ms,
        s.model,
        s.input_tokens,
        s.output_tokens,
        s.cost_usd,
        s.cache_hit,
        s.feature,
        s.user_id,
        s.session_id,
        s.status,
        s.error_kind,
        JSON.stringify(s.meta),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
