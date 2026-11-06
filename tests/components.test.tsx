import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { FilterBar } from '../src/components/FilterBar';
import { Waterfall } from '../src/components/Waterfall';
import { collectFacets, EMPTY_FILTERS } from '../src/lib/filters';
import { overview, summarizeTraces } from '../src/lib/stats';
import { useStore } from '../src/store';
import { makeSpan } from './helpers';

const T0 = Date.parse('2026-10-12T12:00:00.000Z');
const spans = [
  makeSpan({ span_id: 'r', trace_id: 't1', name: 'agent.run', feature: 'agent.run' }),
  makeSpan({
    span_id: 'c',
    trace_id: 't1',
    parent_span_id: 'r',
    name: 'generate',
    kind: 'llm',
    model: 'm1',
    startMs: T0 + 10,
  }),
  makeSpan({ span_id: 'z', trace_id: 't2', name: 'rag.answer', feature: 'rag.answer' }),
];

function seedStore() {
  const traces = summarizeTraces(spans);
  useStore.setState({
    dataset: {
      name: 'fixture.jsonl',
      spans,
      totalLines: 3,
      errorCount: 0,
      errors: [],
      loadMs: 1,
      bytes: 100,
    },
    facets: collectFacets(spans),
    filters: EMPTY_FILTERS,
    filtered: spans,
    traces,
    overview: overview(spans, traces),
    view: 'traces',
  });
}

beforeEach(() => {
  useStore.setState({
    dataset: null,
    facets: null,
    filters: EMPTY_FILTERS,
    filtered: [],
    traces: [],
  });
});

describe('Waterfall', () => {
  it('renders a row per span and calls onSelect', async () => {
    const onSelect = vi.fn();
    render(<Waterfall spans={spans.slice(0, 2)} selectedSpanId={null} onSelect={onSelect} />);
    const rows = screen.getAllByRole('button', { name: /ms/ });
    expect(rows).toHaveLength(2);
    await userEvent.click(rows[1]!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ span_id: 'c' }));
  });

  it('flags spans whose parent is missing', () => {
    const orphan = makeSpan({ span_id: 'o', parent_span_id: 'nope', name: 'lost' });
    render(<Waterfall spans={[orphan]} selectedSpanId={null} onSelect={() => {}} />);
    expect(screen.getByRole('note')).toHaveTextContent('1 span name a parent');
    expect(screen.getByRole('button', { name: /missing parent/ })).toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  it('updates the store when a facet is chosen and clears again', async () => {
    seedStore();
    render(<FilterBar />);
    await userEvent.selectOptions(screen.getByLabelText('Feature'), 'agent.run');
    expect(useStore.getState().filtered).toHaveLength(1);
    expect(useStore.getState().traces).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(useStore.getState().filtered).toHaveLength(3);
  });

  it('debounces the search box into the store', async () => {
    seedStore();
    render(<FilterBar />);
    await userEvent.type(screen.getByLabelText('Search'), 'generate');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(useStore.getState().filters.search).toBe('generate');
    expect(useStore.getState().filtered).toHaveLength(1);
  });
});

describe('App', () => {
  it('shows the load panel with a sample button before any file is loaded', () => {
    render(<App />);
    const panel = screen.getByRole('heading', { name: 'Open a trace file' }).parentElement!;
    expect(within(panel).getByRole('button', { name: 'Load bundled sample' })).toBeEnabled();
    expect(screen.queryByRole('navigation', { name: 'Views' })).not.toBeInTheDocument();
  });

  it('shows the view tabs once data is loaded and switches views', async () => {
    seedStore();
    render(<App />);
    expect(screen.getByTestId('dataset-info')).toHaveTextContent('fixture.jsonl: 3 spans');
    expect(screen.getByTestId('trace-count')).toHaveTextContent('2 traces, 3 spans');
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(screen.getByRole('heading', { name: 'Compare two files' })).toBeInTheDocument();
  });

  it('cycles the theme and writes it to the document', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /Theme: system/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await userEvent.click(screen.getByRole('button', { name: /Theme: light/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
