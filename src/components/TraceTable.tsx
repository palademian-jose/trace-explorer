import { useRef, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fmtInt, fmtMs, fmtTime, fmtUsd, shortId } from '../lib/fmt';
import type { TraceSummary } from '../lib/stats';

const col = createColumnHelper<TraceSummary>();

const columns = [
  col.accessor('startMs', { header: 'Start', cell: (c) => fmtTime(c.getValue()) }),
  col.accessor('traceId', { header: 'Trace', cell: (c) => shortId(c.getValue()) }),
  col.accessor('name', { header: 'Root span' }),
  col.accessor('feature', { header: 'Feature' }),
  col.accessor('durationMs', { header: 'Duration', cell: (c) => fmtMs(c.getValue()) }),
  col.accessor('spanCount', { header: 'Spans', cell: (c) => fmtInt(c.getValue()) }),
  col.accessor('costUsd', { header: 'Cost', cell: (c) => fmtUsd(c.getValue()) }),
  col.accessor('tokens', { header: 'Tokens', cell: (c) => fmtInt(c.getValue()) }),
  col.accessor('hasError', {
    header: 'Status',
    cell: (c) => (c.getValue() ? <span className="err">error</span> : 'ok'),
  }),
];

const ROW_HEIGHT = 34;

interface Props {
  traces: TraceSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** A sortable table whose body renders only the rows in view. */
export function TraceTable({ traces, selectedId, onSelect }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: traces,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (t) => t.traceId,
  });
  const rows = table.getRowModel().rows;
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div className="grid-table" role="table" aria-label="Traces" aria-rowcount={rows.length + 1}>
      <div role="rowgroup">
        {table.getHeaderGroups().map((hg) => (
          <div className="grid-head" role="row" key={hg.id}>
            {hg.headers.map((h) => {
              const dir = h.column.getIsSorted();
              return (
                <div
                  role="columnheader"
                  key={h.id}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                >
                  <button type="button" onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {dir === 'asc' ? ' ▲' : dir === 'desc' ? ' ▼' : ''}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div
        className="grid-body"
        ref={scroller}
        role="rowgroup"
        tabIndex={0}
        aria-label="Trace rows, scrollable"
        data-testid="trace-scroll"
      >
        <div
          role="presentation"
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index];
            if (!row) return null;
            const selected = row.id === selectedId;
            return (
              <div
                key={row.id}
                className="grid-row"
                role="row"
                tabIndex={0}
                aria-rowindex={v.index + 2}
                aria-selected={selected}
                data-testid="trace-row"
                style={{ transform: `translateY(${v.start}px)` }}
                onClick={() => onSelect(row.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(row.id);
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <span role="cell" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
