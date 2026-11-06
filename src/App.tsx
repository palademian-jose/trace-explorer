import { Suspense, lazy, useEffect } from 'react';
import { LoadPanel } from './components/LoadPanel';
import { fmtBytes, fmtInt } from './lib/fmt';
import { useStore, type Theme, type View } from './store';
import { CompareView } from './views/CompareView';
import { TracesView } from './views/TracesView';

// The charts library is the heaviest dependency, so it loads only when Overview is shown.
const OverviewView = lazy(() =>
  import('./views/OverviewView').then((m) => ({ default: m.OverviewView })),
);

const VIEWS: [View, string][] = [
  ['overview', 'Overview'],
  ['traces', 'Traces'],
  ['compare', 'Compare'],
];

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

export const SAMPLE_URL = import.meta.env.BASE_URL + 'samples/baseline.jsonl';

export function App() {
  const dataset = useStore((s) => s.dataset);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const loadFile = useStore((s) => s.loadFile);
  const loadUrl = useStore((s) => s.loadUrl);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  // The only network request this app can make: an explicit ?src= URL.
  useEffect(() => {
    const src = new URLSearchParams(window.location.search).get('src');
    if (src) void loadUrl(src);
  }, [loadUrl]);

  // Dropping a file anywhere on the page loads it instead of letting the browser open it.
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void loadFile(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [loadFile]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <h1>Trace Explorer</h1>
        {dataset && (
          <nav aria-label="Views" className="tabs">
            {VIEWS.map(([id, label]) => (
              <button
                key={id}
                className="tab"
                aria-current={view === id ? 'page' : undefined}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        <span className="spacer" />
        {dataset && (
          <span className="dataset-info" data-testid="dataset-info">
            {dataset.name}: {fmtInt(dataset.spans.length)} spans
            {dataset.errorCount > 0 && ', ' + fmtInt(dataset.errorCount) + ' bad lines'}
            {dataset.bytes > 0 && ' (' + fmtBytes(dataset.bytes) + ')'}
          </span>
        )}
        <button
          className="btn"
          onClick={() => setTheme(NEXT_THEME[theme])}
          aria-label={'Theme: ' + theme + '. Switch to ' + NEXT_THEME[theme]}
        >
          Theme: {theme}
        </button>
      </header>
      <main id="main" tabIndex={-1}>
        {loading && (
          <p role="status" className="notice">
            {loading}…
          </p>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {dataset && dataset.errorCount > 0 && (
          <details className="notice">
            <summary>
              {fmtInt(dataset.errorCount)} of {fmtInt(dataset.totalLines)} lines were skipped
            </summary>
            <ul>
              {dataset.errors.slice(0, 10).map((e) => (
                <li key={e.line}>
                  Line {e.line}: {e.message}
                </li>
              ))}
            </ul>
          </details>
        )}
        {!dataset ? (
          <LoadPanel
            title="Open a trace file"
            busy={loading !== null}
            onFile={(f) => void loadFile(f)}
            onSample={() => void loadUrl(SAMPLE_URL)}
            sampleLabel="Load bundled sample"
          />
        ) : view === 'overview' ? (
          <Suspense fallback={<p role="status">Loading charts…</p>}>
            <OverviewView />
          </Suspense>
        ) : view === 'traces' ? (
          <TracesView />
        ) : (
          <CompareView />
        )}
      </main>
    </>
  );
}
