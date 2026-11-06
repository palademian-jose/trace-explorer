import { useMemo } from 'react';
import { fmtMs } from '../lib/fmt';
import type { Span } from '../lib/schema';
import { buildWaterfall } from '../lib/waterfall';

const KINDS = ['llm', 'retrieval', 'rerank', 'tool', 'cache', 'verify'];

interface Props {
  spans: Span[];
  selectedSpanId: string | null;
  onSelect: (span: Span) => void;
}

export function Waterfall({ spans, selectedSpanId, onSelect }: Props) {
  const wf = useMemo(() => buildWaterfall(spans), [spans]);

  return (
    <div>
      {wf.orphanCount > 0 && (
        <p className="notice" role="note">
          {wf.orphanCount} span{wf.orphanCount === 1 ? '' : 's'} name a parent that is not in this
          file. They are shown as roots and marked "missing parent".
        </p>
      )}
      {wf.duplicateCount > 0 && (
        <p className="notice" role="note">
          {wf.duplicateCount} duplicate span id{wf.duplicateCount === 1 ? '' : 's'} ignored.
        </p>
      )}
      <div className="wf" role="group" aria-label="Span waterfall">
        <div className="wf-axis" aria-hidden="true">
          <span>Span</span>
          <span>
            <span>0</span>
            <span>{fmtMs(wf.totalMs / 2)}</span>
            <span>{fmtMs(wf.totalMs)}</span>
          </span>
        </div>
        {wf.rows.map((r) => {
          const left = (r.offsetMs / wf.totalMs) * 100;
          const width = Math.max((r.durationMs / wf.totalMs) * 100, 0.4);
          const err = r.span.status === 'error';
          return (
            <button
              key={r.span.span_id}
              type="button"
              className="wf-row"
              aria-pressed={r.span.span_id === selectedSpanId}
              aria-label={
                r.span.name +
                ', ' +
                r.span.kind +
                ', ' +
                fmtMs(r.span.latency_ms) +
                (err ? ', error' : '') +
                (r.orphan ? ', missing parent' : '')
              }
              onClick={() => onSelect(r.span)}
            >
              <span className="wf-label" style={{ paddingLeft: r.depth * 14 }} aria-hidden="true">
                {r.span.name}
                {r.orphan && <span className="badge warn"> missing parent</span>}
                {err && <span className="err"> !</span>}
              </span>
              <span className="wf-track" aria-hidden="true">
                <span
                  className={'wf-bar k-' + r.span.kind + (err ? ' err-bar' : '')}
                  style={{ left: left + '%', width: width + '%' }}
                  title={fmtMs(r.span.latency_ms)}
                />
              </span>
            </button>
          );
        })}
      </div>
      <ul className="legend" aria-label="Span kinds">
        {KINDS.map((k) => (
          <li key={k}>
            <i className={'k-' + k} aria-hidden="true" />
            {k}
          </li>
        ))}
      </ul>
      {selectedSpanId === null && <p className="muted">Select a span to see its metadata.</p>}
    </div>
  );
}
