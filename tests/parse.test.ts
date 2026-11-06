import { describe, expect, it } from 'vitest';
import { JsonlParser, parseJsonl, parseStream } from '../src/lib/parse';
import { spanLine } from './helpers';

describe('parseJsonl', () => {
  it('parses valid lines and parses timestamps to epoch ms', () => {
    const r = parseJsonl(spanLine() + '\n' + spanLine({ span_id: 's2' }) + '\n');
    expect(r.spans).toHaveLength(2);
    expect(r.errorCount).toBe(0);
    expect(r.spans[0]?.startMs).toBe(Date.parse('2026-10-12T12:00:00.000Z'));
  });

  it('counts bad lines instead of failing', () => {
    const text = [
      spanLine(),
      'not json',
      spanLine({ latency_ms: -1 }),
      JSON.stringify({ trace_id: 'x' }),
      spanLine({ start_ts: 'yesterday' }),
      spanLine({ span_id: 's9' }),
    ].join('\n');
    const r = parseJsonl(text);
    expect(r.spans).toHaveLength(2);
    expect(r.errorCount).toBe(4);
    expect(r.totalLines).toBe(6);
    expect(r.errors[0]).toEqual({ line: 2, message: 'not valid JSON' });
    expect(r.errors[1]?.message).toContain('latency_ms');
  });

  it('skips blank lines, handles CRLF, a BOM and a missing final newline', () => {
    const text = '﻿' + spanLine() + '\r\n\r\n' + spanLine({ span_id: 's2' });
    const r = parseJsonl(text);
    expect(r.spans).toHaveLength(2);
    expect(r.totalLines).toBe(2);
    expect(r.errorCount).toBe(0);
  });

  it('applies defaults for optional fields and keeps unknown kinds', () => {
    const minimal = JSON.stringify({
      trace_id: 't',
      span_id: 's',
      name: 'x',
      kind: 'custom',
      start_ts: '2026-10-12T12:00:00Z',
      end_ts: '2026-10-12T12:00:01Z',
      latency_ms: 1000,
    });
    const r = parseJsonl(minimal);
    expect(r.errorCount).toBe(0);
    expect(r.spans[0]).toMatchObject({
      parent_span_id: null,
      model: null,
      cost_usd: 0,
      cache_hit: false,
      status: 'ok',
      kind: 'custom',
    });
  });

  it('caps the stored error list but keeps counting', () => {
    const r = parseJsonl(Array.from({ length: 80 }, () => 'bad').join('\n'));
    expect(r.errorCount).toBe(80);
    expect(r.errors).toHaveLength(50);
  });
});

describe('JsonlParser chunking', () => {
  it('gives the same result when a line is split across chunks', () => {
    const text = spanLine() + '\n' + spanLine({ span_id: 's2' }) + '\n';
    const p = new JsonlParser();
    for (let i = 0; i < text.length; i += 7) p.push(text.slice(i, i + 7));
    expect(p.finish().spans).toHaveLength(2);
  });
});

describe('parseStream', () => {
  it('decodes multi-byte characters split across byte chunks', async () => {
    const bytes = new TextEncoder().encode(spanLine({ name: 'café ☃' }) + '\n');
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 5) c.enqueue(bytes.slice(i, i + 5));
        c.close();
      },
    });
    const r = await parseStream(stream);
    expect(r.spans[0]?.name).toBe('café ☃');
  });
});
