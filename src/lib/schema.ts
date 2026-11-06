import { z } from 'zod';

const timestamp = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid timestamp');

/** One JSONL line of the `llmops` span contract. Unknown extra keys are ignored. */
export const spanSchema = z.object({
  trace_id: z.string().min(1),
  span_id: z.string().min(1),
  parent_span_id: z.string().nullable().default(null),
  name: z.string(),
  kind: z.string().default('other'),
  start_ts: timestamp,
  end_ts: timestamp,
  latency_ms: z.number().nonnegative(),
  model: z.string().nullable().default(null),
  input_tokens: z.number().nonnegative().default(0),
  output_tokens: z.number().nonnegative().default(0),
  cost_usd: z.number().nonnegative().default(0),
  cache_hit: z.boolean().default(false),
  feature: z.string().default('unknown'),
  user_id: z.string().nullable().default(null),
  session_id: z.string().nullable().default(null),
  status: z.string().default('ok'),
  error_kind: z.string().nullable().default(null),
  meta: z.record(z.string(), z.unknown()).default({}),
});

export type SpanRecord = z.output<typeof spanSchema>;

/** A validated span plus its timestamps parsed once to epoch milliseconds. */
export interface Span extends SpanRecord {
  startMs: number;
  endMs: number;
}

export const SPAN_KINDS = ['llm', 'retrieval', 'rerank', 'tool', 'cache', 'verify', 'other'];
