import { useMemo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FilterBar } from '../components/FilterBar';
import { fmtInt, fmtMs, fmtPct, fmtUsd } from '../lib/fmt';
import { costBy, latencyByKind, requestsOverTime } from '../lib/stats';
import { useStore } from '../store';

function Chart({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return (
    <figure className="chart" aria-label={label}>
      <h3>{title}</h3>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={200}
          initialDimension={{ width: 400, height: 260 }}
        >
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

const axisProps = { stroke: 'var(--muted)', tick: { fill: 'var(--muted)', fontSize: 11 } };
const tooltipProps = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  },
  itemStyle: { color: 'var(--text)' },
};

export function OverviewView() {
  const ov = useStore((s) => s.overview);
  const filtered = useStore((s) => s.filtered);
  const traces = useStore((s) => s.traces);

  const byModel = useMemo(() => costBy(filtered, 'model'), [filtered]);
  const byFeature = useMemo(() => costBy(filtered, 'feature'), [filtered]);
  const byKind = useMemo(() => latencyByKind(filtered), [filtered]);
  const series = useMemo(
    () =>
      requestsOverTime(traces).map((b) => ({
        time: new Date(b.startMs).toISOString().slice(5, 16).replace('T', ' '),
        requests: b.requests - b.errors,
        errors: b.errors,
      })),
    [traces],
  );

  const cards: [string, string][] = [
    ['Spans', fmtInt(ov.spans)],
    ['Traces', fmtInt(ov.traces)],
    ['Cost', fmtUsd(ov.costUsd)],
    ['Tokens in', fmtInt(ov.inputTokens)],
    ['Tokens out', fmtInt(ov.outputTokens)],
    ['Error rate', fmtPct(ov.errorRate)],
    ['Cache-hit rate', fmtPct(ov.cacheHitRate)],
    ['p50 latency', fmtMs(ov.p50)],
    ['p95 latency', fmtMs(ov.p95)],
    ['p99 latency', fmtMs(ov.p99)],
  ];

  return (
    <div>
      <FilterBar />
      <p className="muted">
        Latency percentiles are per trace (root span latency). Error rate is the share of traces
        with at least one error span. Cache-hit rate is the share of traces with a cache hit.
      </p>
      <dl className="cards" aria-label="Totals">
        {cards.map(([k, v]) => (
          <div className="card" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="charts">
        <Chart
          title="Cost by model (USD)"
          label={'Bar chart of cost in US dollars by model, ' + byModel.length + ' models'}
        >
          <BarChart data={byModel} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis type="number" {...axisProps} />
            <YAxis type="category" dataKey="key" width={170} {...axisProps} />
            <Tooltip {...tooltipProps} formatter={(v) => fmtUsd(Number(v))} />
            <Bar dataKey="costUsd" name="Cost" fill="var(--c1)" />
          </BarChart>
        </Chart>
        <Chart
          title="Cost by feature (USD)"
          label={'Bar chart of cost in US dollars by feature, ' + byFeature.length + ' features'}
        >
          <BarChart data={byFeature} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis type="number" {...axisProps} />
            <YAxis type="category" dataKey="key" width={170} {...axisProps} />
            <Tooltip {...tooltipProps} formatter={(v) => fmtUsd(Number(v))} />
            <Bar dataKey="costUsd" name="Cost" fill="var(--c3)" />
          </BarChart>
        </Chart>
        <Chart
          title="Latency by span kind (ms)"
          label={
            'Grouped bar chart of p50, p95 and p99 latency by span kind, ' +
            byKind.length +
            ' kinds'
          }
        >
          <BarChart data={byKind}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis dataKey="kind" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip {...tooltipProps} formatter={(v) => fmtMs(Number(v))} />
            <Legend />
            <Bar dataKey="p50" name="p50" fill="var(--c1)" />
            <Bar dataKey="p95" name="p95" fill="var(--c2)" />
            <Bar dataKey="p99" name="p99" fill="var(--c5)" />
          </BarChart>
        </Chart>
        <Chart
          title="Requests over time (UTC)"
          label={'Stacked bar chart of requests over time in ' + series.length + ' intervals'}
        >
          <BarChart data={series}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis dataKey="time" interval="preserveStartEnd" {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip {...tooltipProps} />
            <Legend />
            <Bar dataKey="requests" name="ok" stackId="r" fill="var(--c1)" />
            <Bar dataKey="errors" name="with errors" stackId="r" fill="var(--c5)" />
          </BarChart>
        </Chart>
      </div>
    </div>
  );
}
