import { create } from 'zustand';
import {
  EMPTY_FILTERS,
  applyFilters,
  collectFacets,
  type Facets,
  type Filters,
} from './lib/filters';
import { loadFromFile, loadFromUrl, type LoadedDataset } from './lib/load';
import type { Span } from './lib/schema';
import { overview, summarizeTraces, type Overview, type TraceSummary } from './lib/stats';

export type View = 'overview' | 'traces' | 'compare';
export type Theme = 'system' | 'light' | 'dark';

interface Derived {
  filtered: Span[];
  traces: TraceSummary[];
  overview: Overview;
}

const EMPTY_OVERVIEW: Overview = overview([], []);

interface State extends Derived {
  dataset: LoadedDataset | null;
  facets: Facets | null;
  filters: Filters;
  compareDataset: LoadedDataset | null;
  view: View;
  selectedTraceId: string | null;
  theme: Theme;
  loading: string | null;
  error: string | null;
  setView: (v: View) => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  selectTrace: (id: string | null) => void;
  setTheme: (t: Theme) => void;
  loadFile: (file: File, target?: 'main' | 'compare') => Promise<void>;
  loadUrl: (url: string, target?: 'main' | 'compare') => Promise<void>;
  clearCompare: () => void;
}

function derive(spans: readonly Span[], filters: Filters): Derived {
  const filtered = applyFilters(spans, filters);
  const traces = summarizeTraces(filtered);
  return { filtered, traces, overview: overview(filtered, traces) };
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('trace-explorer-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* storage can be blocked */
  }
  return 'system';
}

export const useStore = create<State>((set, get) => {
  const accept = (ds: LoadedDataset, target: 'main' | 'compare') => {
    if (target === 'compare') {
      set({ compareDataset: ds, loading: null, error: null });
      return;
    }
    set({
      dataset: ds,
      facets: collectFacets(ds.spans),
      filters: EMPTY_FILTERS,
      selectedTraceId: null,
      loading: null,
      error: null,
      ...derive(ds.spans, EMPTY_FILTERS),
    });
  };
  const run = async (
    label: string,
    target: 'main' | 'compare',
    job: () => Promise<LoadedDataset>,
  ) => {
    set({ loading: label, error: null });
    try {
      accept(await job(), target);
    } catch (e) {
      set({ loading: null, error: e instanceof Error ? e.message : String(e) });
    }
  };

  return {
    dataset: null,
    facets: null,
    filters: EMPTY_FILTERS,
    compareDataset: null,
    view: 'overview',
    selectedTraceId: null,
    theme: readTheme(),
    loading: null,
    error: null,
    filtered: [],
    traces: [],
    overview: EMPTY_OVERVIEW,

    setView: (view) => set({ view }),
    setFilters: (patch) => {
      const { dataset, filters } = get();
      const next = { ...filters, ...patch };
      set({ filters: next, ...(dataset ? derive(dataset.spans, next) : {}) });
    },
    resetFilters: () => {
      const { dataset } = get();
      set({ filters: EMPTY_FILTERS, ...(dataset ? derive(dataset.spans, EMPTY_FILTERS) : {}) });
    },
    selectTrace: (selectedTraceId) => set({ selectedTraceId }),
    setTheme: (theme) => {
      try {
        if (theme === 'system') localStorage.removeItem('trace-explorer-theme');
        else localStorage.setItem('trace-explorer-theme', theme);
      } catch {
        /* storage can be blocked */
      }
      set({ theme });
    },
    loadFile: (file, target = 'main') =>
      run('Reading ' + file.name, target, () => loadFromFile(file)),
    loadUrl: (url, target = 'main') => run('Fetching ' + url, target, () => loadFromUrl(url)),
    clearCompare: () => set({ compareDataset: null }),
  };
});

/** All spans of one trace from the full (unfiltered) dataset. */
export function spansOfTrace(spans: readonly Span[], traceId: string): Span[] {
  return spans.filter((s) => s.trace_id === traceId);
}
