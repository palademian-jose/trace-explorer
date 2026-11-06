import { useMemo, useState } from 'react';
import { fmtInt, fmtMs, fmtTime, fmtUsd } from '../lib/fmt';
import type { Span, SpanRecord } from '../lib/schema';
import { summarizeTraces } from '../lib/stats';
import { Waterfall } from './Waterfall';

/** The span as it appeared in the file, without the derived millisecond fields. */
export function toRecord(span: Span): SpanRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { startMs, endMs, ...record } = span;
  return record;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface Props {
  spans: Span[];
  onClose: () => void;
}

export function TraceDetail({ spans, onClose }: Props) {
  const [selected, setSelected] = useState<Span | null>(null);
  const [status, setStatus] = useState('');
  const summary = useMemo(() => summarizeTraces(spans)[0], [spans]);

  const doCopy = async (label: string, value: unknown) => {
    const ok = await copy(JSON.stringify(value, null, 2));
    setStatus(ok ? label + ' copied' : 'Copy failed: clipboard access was denied');
  };

  if (!summary) return null;
  return (
    <section className="panel" aria-labelledby="trace-detail-title">
      <div className="detail-head">
        <h2 id="trace-detail-title">Trace {summary.traceId}</h2>
        <span className="badge">{fmtInt(summary.spanCount)} spans</span>
        <span className="badge">{fmtMs(summary.durationMs)}</span>
        <span className="badge">{fmtUsd(summary.costUsd)}</span>
        {summary.hasError && <span className="badge warn">has error</span>}
        {summary.rootless && <span className="badge warn">no root span</span>}
        <span className="spacer" />
        <button className="btn" onClick={() => doCopy('Trace JSON', spans.map(toRecord))}>
          Copy trace as JSON
        </button>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <p role="status" className="muted">
        {status}
      </p>
      <div className="detail-grid">
        <Waterfall
          spans={spans}
          selectedSpanId={selected?.span_id ?? null}
          onSelect={setSelected}
        />
        <aside aria-label="Span metadata">
          <h3>Span metadata</h3>
          {selected ? (
            <>
              <dl className="meta-list">
                <dt>Name</dt>
                <dd>{selected.name}</dd>
                <dt>Kind / status</dt>
                <dd>
                  {selected.kind} / {selected.status}
                  {selected.error_kind ? ' (' + selected.error_kind + ')' : ''}
                </dd>
                <dt>Start</dt>
                <dd>{fmtTime(selected.startMs)}</dd>
                <dt>Latency</dt>
                <dd>{fmtMs(selected.latency_ms)}</dd>
                <dt>Model</dt>
                <dd>{selected.model ?? 'none'}</dd>
                <dt>Tokens in / out</dt>
                <dd>
                  {fmtInt(selected.input_tokens)} / {fmtInt(selected.output_tokens)}
                </dd>
                <dt>Cost</dt>
                <dd>{fmtUsd(selected.cost_usd)}</dd>
              </dl>
              <pre className="json" tabIndex={0} aria-label="Span JSON">
                {JSON.stringify(toRecord(selected), null, 2)}
              </pre>
              <div className="row-actions">
                <button className="btn" onClick={() => doCopy('Span JSON', toRecord(selected))}>
                  Copy span as JSON
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Select a span in the waterfall.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
