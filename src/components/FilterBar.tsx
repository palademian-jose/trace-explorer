import { useEffect, useState } from 'react';
import { isFiltering } from '../lib/filters';
import { fromLocalInput, toLocalInput } from '../lib/fmt';
import { useStore } from '../store';

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Remounts when a new file loads so the search box resets with the filters. */
export function FilterBar() {
  const ds = useStore((s) => s.dataset);
  return <FilterBarInner key={ds ? ds.name + ds.loadMs : 'none'} />;
}

function FilterBarInner() {
  const facets = useStore((s) => s.facets);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const resetFilters = useStore((s) => s.resetFilters);
  const [search, setSearch] = useState(filters.search);

  // Debounce typing so a 100k-span filter pass does not run on every key.
  useEffect(() => {
    const id = setTimeout(() => {
      if (search !== useStore.getState().filters.search) setFilters({ search });
    }, 150);
    return () => clearTimeout(id);
  }, [search, setFilters]);

  if (!facets) return null;
  return (
    <form
      className="filters"
      role="search"
      aria-label="Filters"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="field">
        Search
        <input
          type="search"
          value={search}
          placeholder="name, id, model, user"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <Select
        label="Feature"
        value={filters.feature}
        options={facets.features}
        onChange={(feature) => setFilters({ feature })}
      />
      <Select
        label="Model"
        value={filters.model}
        options={facets.models}
        onChange={(model) => setFilters({ model })}
      />
      <Select
        label="Status"
        value={filters.status}
        options={facets.statuses}
        onChange={(status) => setFilters({ status })}
      />
      <Select
        label="Kind"
        value={filters.kind}
        options={facets.kinds}
        onChange={(kind) => setFilters({ kind })}
      />
      <label className="field">
        From (UTC)
        <input
          type="datetime-local"
          value={toLocalInput(filters.fromMs)}
          min={toLocalInput(facets.minMs)}
          max={toLocalInput(facets.maxMs)}
          onChange={(e) => setFilters({ fromMs: fromLocalInput(e.target.value) })}
        />
      </label>
      <label className="field">
        To (UTC)
        <input
          type="datetime-local"
          value={toLocalInput(filters.toMs)}
          min={toLocalInput(facets.minMs)}
          max={toLocalInput(facets.maxMs)}
          onChange={(e) => setFilters({ toMs: fromLocalInput(e.target.value) })}
        />
      </label>
      <button
        type="button"
        className="btn"
        disabled={!isFiltering(filters)}
        onClick={() => {
          setSearch('');
          resetFilters();
        }}
      >
        Clear filters
      </button>
    </form>
  );
}
