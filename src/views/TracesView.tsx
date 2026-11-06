import { useMemo } from 'react';
import { FilterBar } from '../components/FilterBar';
import { TraceDetail } from '../components/TraceDetail';
import { TraceTable } from '../components/TraceTable';
import { spansToCsv } from '../lib/csv';
import { fmtInt } from '../lib/fmt';
import { spansOfTrace, useStore } from '../store';

export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TracesView() {
  const traces = useStore((s) => s.traces);
  const filtered = useStore((s) => s.filtered);
  const dataset = useStore((s) => s.dataset);
  const selectedId = useStore((s) => s.selectedTraceId);
  const selectTrace = useStore((s) => s.selectTrace);

  const detailSpans = useMemo(
    () => (selectedId && dataset ? spansOfTrace(dataset.spans, selectedId) : []),
    [selectedId, dataset],
  );

  return (
    <div className="split">
      <FilterBar />
      <div className="row-actions">
        <span role="status" data-testid="trace-count">
          {fmtInt(traces.length)} traces, {fmtInt(filtered.length)} spans
        </span>
        <span className="spacer" />
        <button
          className="btn"
          disabled={filtered.length === 0}
          onClick={() =>
            downloadText('trace-explorer-view.csv', spansToCsv(filtered), 'text/csv;charset=utf-8')
          }
        >
          Export view as CSV
        </button>
      </div>
      {traces.length === 0 ? (
        <p className="panel muted">No traces match the current filters.</p>
      ) : (
        <TraceTable traces={traces} selectedId={selectedId} onSelect={selectTrace} />
      )}
      {selectedId && detailSpans.length > 0 && (
        <TraceDetail key={selectedId} spans={detailSpans} onClose={() => selectTrace(null)} />
      )}
    </div>
  );
}
