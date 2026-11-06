import { useMemo } from 'react';
import { LoadPanel } from '../components/LoadPanel';
import { compareMarkdown, compareRows, scenarioStats } from '../lib/compare';
import { fmtInt, fmtMs, fmtPct } from '../lib/fmt';
import { useStore } from '../store';
import { downloadText } from './TracesView';

const signed = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(0) + '%';

export function CompareView() {
  const base = useStore((s) => s.dataset);
  const other = useStore((s) => s.compareDataset);
  const loadFile = useStore((s) => s.loadFile);
  const loadUrl = useStore((s) => s.loadUrl);
  const clearCompare = useStore((s) => s.clearCompare);
  const loading = useStore((s) => s.loading);

  const rows = useMemo(
    () =>
      base && other
        ? compareRows(scenarioStats(base.name, base.spans), scenarioStats(other.name, other.spans))
        : [],
    [base, other],
  );

  if (!base) return null;
  return (
    <div>
      <h2>Compare two files</h2>
      <p className="muted">
        The first row is the file loaded in the main view. Figures use the same definitions as{' '}
        <code>llmops compare</code>: requests are traces, cost sums every span, latency and error
        rate use root spans. Filters do not apply here.
      </p>
      {!other ? (
        <LoadPanel
          title="Second file"
          busy={loading !== null}
          onFile={(f) => void loadFile(f, 'compare')}
          onSample={() =>
            void loadUrl(import.meta.env.BASE_URL + 'samples/cheaper_model.jsonl', 'compare')
          }
          sampleLabel="Load cheaper_model sample"
        />
      ) : (
        <>
          <table className="data" aria-label="Before and after">
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Requests</th>
                <th scope="col">$ / 1k req</th>
                <th scope="col">Δ cost</th>
                <th scope="col">p50</th>
                <th scope="col">p95</th>
                <th scope="col">Δ p95</th>
                <th scope="col">Cache hit rate</th>
                <th scope="col">Error rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ stats: r, costDeltaPct, p95DeltaPct }, i) => (
                <tr key={i}>
                  <th scope="row">{r.scenario}</th>
                  <td>{fmtInt(r.requests)}</td>
                  <td>{r.usdPer1k.toFixed(2)}</td>
                  <td>{i === 0 ? 'baseline' : signed(costDeltaPct)}</td>
                  <td>{fmtMs(r.p50Ms)}</td>
                  <td>{fmtMs(r.p95Ms)}</td>
                  <td>{i === 0 ? 'baseline' : signed(p95DeltaPct)}</td>
                  <td>{fmtPct(r.cacheHitRate, 0)}</td>
                  <td>{fmtPct(r.errorRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row-actions">
            <button
              className="btn"
              onClick={() =>
                downloadText(
                  'trace-explorer-compare.md',
                  compareMarkdown(rows) + '\n',
                  'text/markdown',
                )
              }
            >
              Download as Markdown
            </button>
            <button className="btn" onClick={clearCompare}>
              Remove second file
            </button>
          </div>
        </>
      )}
    </div>
  );
}
