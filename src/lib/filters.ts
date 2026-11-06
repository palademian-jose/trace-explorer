import type { Span } from './schema';

export interface Filters {
  search: string;
  feature: string;
  model: string;
  status: string;
  kind: string;
  /** Epoch ms bounds (UTC), or null for open-ended. */
  fromMs: number | null;
  toMs: number | null;
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  feature: '',
  model: '',
  status: '',
  kind: '',
  fromMs: null,
  toMs: null,
};

export function isFiltering(f: Filters): boolean {
  return (
    f.search !== '' ||
    f.feature !== '' ||
    f.model !== '' ||
    f.status !== '' ||
    f.kind !== '' ||
    f.fromMs !== null ||
    f.toMs !== null
  );
}

function matchesSearch(s: Span, needle: string): boolean {
  return (
    s.name.toLowerCase().includes(needle) ||
    s.trace_id.toLowerCase().includes(needle) ||
    s.span_id.toLowerCase().includes(needle) ||
    s.feature.toLowerCase().includes(needle) ||
    (s.model?.toLowerCase().includes(needle) ?? false) ||
    (s.user_id?.toLowerCase().includes(needle) ?? false) ||
    (s.error_kind?.toLowerCase().includes(needle) ?? false)
  );
}

export function applyFilters(spans: readonly Span[], f: Filters): Span[] {
  if (!isFiltering(f)) return spans.slice();
  const needle = f.search.trim().toLowerCase();
  return spans.filter(
    (s) =>
      (f.feature === '' || s.feature === f.feature) &&
      (f.model === '' || s.model === f.model) &&
      (f.status === '' || s.status === f.status) &&
      (f.kind === '' || s.kind === f.kind) &&
      (f.fromMs === null || s.startMs >= f.fromMs) &&
      (f.toMs === null || s.startMs <= f.toMs) &&
      (needle === '' || matchesSearch(s, needle)),
  );
}

export interface Facets {
  features: string[];
  models: string[];
  statuses: string[];
  kinds: string[];
  minMs: number;
  maxMs: number;
}

export function collectFacets(spans: readonly Span[]): Facets {
  const features = new Set<string>();
  const models = new Set<string>();
  const statuses = new Set<string>();
  const kinds = new Set<string>();
  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const s of spans) {
    features.add(s.feature);
    if (s.model) models.add(s.model);
    statuses.add(s.status);
    kinds.add(s.kind);
    if (s.startMs < minMs) minMs = s.startMs;
    if (s.startMs > maxMs) maxMs = s.startMs;
  }
  const sorted = (x: Set<string>) => [...x].sort();
  return {
    features: sorted(features),
    models: sorted(models),
    statuses: sorted(statuses),
    kinds: sorted(kinds),
    minMs: Number.isFinite(minMs) ? minMs : 0,
    maxMs: Number.isFinite(maxMs) ? maxMs : 0,
  };
}
