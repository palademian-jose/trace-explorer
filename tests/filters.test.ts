import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, applyFilters, collectFacets, isFiltering } from '../src/lib/filters';
import { makeSpan } from './helpers';

const T0 = Date.parse('2026-10-12T12:00:00.000Z');
const spans = [
  makeSpan({ span_id: 'a', feature: 'rag.answer', kind: 'llm', model: 'm1', startMs: T0 }),
  makeSpan({
    span_id: 'b',
    feature: 'agent.run',
    kind: 'tool',
    status: 'error',
    startMs: T0 + 1000,
  }),
  makeSpan({ span_id: 'c', feature: 'rag.answer', kind: 'llm', model: 'm2', startMs: T0 + 2000 }),
];

describe('applyFilters', () => {
  it('returns everything when no filter is set', () => {
    expect(isFiltering(EMPTY_FILTERS)).toBe(false);
    expect(applyFilters(spans, EMPTY_FILTERS)).toHaveLength(3);
  });
  it('filters by facet values', () => {
    expect(applyFilters(spans, { ...EMPTY_FILTERS, feature: 'rag.answer' })).toHaveLength(2);
    expect(applyFilters(spans, { ...EMPTY_FILTERS, model: 'm2' })).toHaveLength(1);
    expect(applyFilters(spans, { ...EMPTY_FILTERS, status: 'error' })).toHaveLength(1);
    expect(applyFilters(spans, { ...EMPTY_FILTERS, kind: 'tool' })[0]?.span_id).toBe('b');
  });
  it('combines filters with AND', () => {
    expect(
      applyFilters(spans, { ...EMPTY_FILTERS, feature: 'rag.answer', model: 'm1' }),
    ).toHaveLength(1);
    expect(
      applyFilters(spans, { ...EMPTY_FILTERS, feature: 'agent.run', model: 'm1' }),
    ).toHaveLength(0);
  });
  it('applies an inclusive time range', () => {
    const f = { ...EMPTY_FILTERS, fromMs: T0 + 1000, toMs: T0 + 2000 };
    expect(applyFilters(spans, f).map((s) => s.span_id)).toEqual(['b', 'c']);
  });
  it('searches case-insensitively across id, name, model and feature', () => {
    expect(applyFilters(spans, { ...EMPTY_FILTERS, search: 'AGENT' })).toHaveLength(1);
    expect(applyFilters(spans, { ...EMPTY_FILTERS, search: 'm2' })).toHaveLength(1);
    expect(applyFilters(spans, { ...EMPTY_FILTERS, search: 'nothing-here' })).toHaveLength(0);
  });
});

describe('collectFacets', () => {
  it('lists sorted distinct values and the time extent', () => {
    const f = collectFacets(spans);
    expect(f.features).toEqual(['agent.run', 'rag.answer']);
    expect(f.models).toEqual(['m1', 'm2']);
    expect(f.statuses).toEqual(['error', 'ok']);
    expect(f.minMs).toBe(T0);
    expect(f.maxMs).toBe(T0 + 2000);
  });
});
