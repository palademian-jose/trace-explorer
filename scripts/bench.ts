/**
 * Produces every number in the README results table.
 *
 *   npm run bench             full run (build, parse, time-to-first-row, tests, axe)
 *   npm run bench -- --quick  parse throughput and bundle size only
 *
 * Writes reports/bench.json and reports/bench.md.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { parseJsonl } from '../src/lib/parse';
import { applyFilters, EMPTY_FILTERS } from '../src/lib/filters';
import { overview, summarizeTraces } from '../src/lib/stats';

const ROOT = process.cwd();
const quick = process.argv.includes('--quick');
const SAMPLE = path.join(ROOT, 'public/samples/baseline.jsonl');
const SCALE_SPANS = 100_000;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** Run a Node script from node_modules directly, so no shell is involved. */
function run(script: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync(process.execPath, [path.join(ROOT, 'node_modules', script), ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function timeIt<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
}

// --- 1. Parse throughput on the bundled sample -----------------------------------------------
function parseBench() {
  const text = readFileSync(SAMPLE, 'utf8');
  const bytes = Buffer.byteLength(text);
  parseJsonl(text); // warm-up
  const runs: number[] = [];
  let spans = 0;
  for (let i = 0; i < 9; i++) {
    const { ms, value } = timeIt(() => parseJsonl(text));
    runs.push(ms);
    spans = value.spans.length;
  }
  const ms = median(runs);
  return {
    file: 'public/samples/baseline.jsonl',
    spans,
    bytes,
    median_ms: round(ms),
    spans_per_sec: Math.round(spans / (ms / 1000)),
    mb_per_sec: round(bytes / 1024 / 1024 / (ms / 1000)),
    runs: runs.length,
  };
}

// --- 2. Synthetic 100k-span file --------------------------------------------------------------
function buildScaleFile(): { text: string; spans: number } {
  const lines = readFileSync(SAMPLE, 'utf8').split('\n').filter(Boolean);
  const out: string[] = [];
  const copies = Math.ceil(SCALE_SPANS / lines.length);
  for (let k = 0; k < copies; k++) {
    const shift = k * 3_600_000;
    for (const line of lines) {
      const s = JSON.parse(line) as Record<string, unknown>;
      s.trace_id = `${String(s.trace_id)}-${k}`;
      s.span_id = `${String(s.span_id)}-${k}`;
      if (typeof s.parent_span_id === 'string') s.parent_span_id = `${s.parent_span_id}-${k}`;
      s.start_ts = new Date(Date.parse(String(s.start_ts)) + shift).toISOString();
      s.end_ts = new Date(Date.parse(String(s.end_ts)) + shift).toISOString();
      out.push(JSON.stringify(s));
    }
  }
  return { text: out.join('\n') + '\n', spans: out.length };
}

function scaleBench(text: string) {
  const parse = timeIt(() => parseJsonl(text));
  const spans = parse.value.spans;
  const derive = timeIt(() => {
    const filtered = applyFilters(spans, EMPTY_FILTERS);
    const traces = summarizeTraces(filtered);
    return overview(filtered, traces);
  });
  const filter = timeIt(() => applyFilters(spans, { ...EMPTY_FILTERS, status: 'error' }));
  return {
    spans: spans.length,
    bytes: Buffer.byteLength(text),
    parse_ms: round(parse.ms),
    parse_spans_per_sec: Math.round(spans.length / (parse.ms / 1000)),
    aggregate_ms: round(derive.ms),
    filter_ms: round(filter.ms),
  };
}

// --- 3. Bundle size ---------------------------------------------------------------------------
function bundleBench() {
  run('typescript/bin/tsc', ['-b']);
  run('vite/bin/vite.js', ['build']);
  const dist = path.join(ROOT, 'dist');
  const assets = path.join(dist, 'assets');
  const files = readdirSync(assets).map((name) => {
    const buf = readFileSync(path.join(assets, name));
    return { name, raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  });
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const entry = [...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+)"/g)].map((m) => m[1]);
  const sum = (xs: typeof files, k: 'raw' | 'gzip') => xs.reduce((n, f) => n + f[k], 0);
  const initial = files.filter((f) => entry.includes(f.name));
  return {
    total_raw_bytes: sum(files, 'raw'),
    total_gzip_bytes: sum(files, 'gzip'),
    initial_gzip_bytes: sum(initial, 'gzip'),
    files,
  };
}

// --- 4. Load-to-first-row in a real browser ---------------------------------------------------
async function ttiBench(text: string, spans: number) {
  const tmp = path.join(os.tmpdir(), 'trace-explorer-100k.jsonl');
  writeFileSync(tmp, text);
  const server = await preview({ preview: { port: 4174, strictPort: true }, logLevel: 'silent' });
  const browser = await chromium.launch();
  try {
    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const page = await browser.newPage();
      await page.goto('http://localhost:4174/');
      await page.getByRole('button', { name: 'Choose file' }).waitFor();
      const t0 = Date.now();
      await page.getByLabel('Open a trace file file').setInputFiles(tmp);
      await page.getByTestId('dataset-info').waitFor({ timeout: 120_000 });
      await page.getByRole('button', { name: 'Traces' }).click();
      await page.getByTestId('trace-row').first().waitFor({ timeout: 120_000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
      runs.push(Date.now() - t0);
      await page.close();
    }
    return { spans, runs_ms: runs, median_ms: median(runs) };
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
}

// --- 5. Tests and axe -------------------------------------------------------------------------
function testBench() {
  mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  const vitestOut = path.join(ROOT, 'reports', 'vitest.json');
  try {
    run('vitest/vitest.mjs', ['run', '--reporter=json', '--outputFile=reports/vitest.json'], {
      NODE_ENV: 'test', // importing vite earlier in this process sets production
    });
  } catch {
    /* a failing run still writes the report; counts below show it */
  }
  const v = JSON.parse(readFileSync(vitestOut, 'utf8')) as {
    numPassedTests: number;
    numFailedTests: number;
    numTotalTests: number;
  };

  const pwOut = path.join(ROOT, 'reports', 'playwright.json');
  try {
    run('@playwright/test/cli.js', ['test', '--reporter=json'], {
      PLAYWRIGHT_JSON_OUTPUT_NAME: pwOut,
    });
  } catch {
    /* same as above */
  }
  const p = JSON.parse(readFileSync(pwOut, 'utf8')) as {
    stats: { expected: number; unexpected: number; flaky: number; skipped: number };
  };
  const axePath = path.join(ROOT, 'reports', 'axe.json');
  const axe = existsSync(axePath)
    ? (JSON.parse(readFileSync(axePath, 'utf8')) as {
        views: Record<string, number>;
        total_violations: number;
      })
    : null;
  return {
    unit: { passed: v.numPassedTests, failed: v.numFailedTests, total: v.numTotalTests },
    e2e: {
      passed: p.stats.expected,
      failed: p.stats.unexpected,
      flaky: p.stats.flaky,
      skipped: p.stats.skipped,
    },
    axe: axe && { views_checked: Object.keys(axe.views).length, violations: axe.total_violations },
  };
}

const round = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d;
const kb = (n: number): string => (n / 1024).toFixed(1) + ' kB';

async function main() {
  const result: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    node: process.version,
    cpu: os.cpus()[0]?.model.trim(),
    platform: `${os.platform()} ${os.arch()}`,
  };

  console.log('parse throughput...');
  const parse = parseBench();
  result.parse = parse;

  console.log('100k-span scale...');
  const scale = buildScaleFile();
  result.scale = scaleBench(scale.text);

  console.log('bundle size (vite build)...');
  const bundle = bundleBench();
  result.bundle = bundle;

  let tti: Awaited<ReturnType<typeof ttiBench>> | null = null;
  let tests: ReturnType<typeof testBench> | null = null;
  if (!quick) {
    console.log('load to first row in Chromium...');
    tti = await ttiBench(scale.text, scale.spans);
    result.time_to_first_row = tti;
    console.log('unit and e2e tests (this builds and serves the app)...');
    tests = testBench();
    result.tests = tests;
  }

  mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  writeFileSync(path.join(ROOT, 'reports', 'bench.json'), JSON.stringify(result, null, 2) + '\n');

  const sc = result.scale as ReturnType<typeof scaleBench>;
  const rows: [string, string][] = [
    [
      'Parse throughput (sample, 3.9k spans)',
      `${parse.spans_per_sec.toLocaleString('en-GB')} spans/s (${parse.mb_per_sec} MB/s, median of ${parse.runs} runs)`,
    ],
    [
      'Parse + validate 100k spans',
      `${sc.parse_ms} ms (${sc.parse_spans_per_sec.toLocaleString('en-GB')} spans/s)`,
    ],
    ['Aggregate 100k spans (traces + overview)', `${sc.aggregate_ms} ms`],
    ['Filter 100k spans', `${sc.filter_ms} ms`],
  ];
  if (tti)
    rows.push([
      'Load to first table row, 100k spans (Chromium, median of 3)',
      `${(tti.median_ms / 1000).toFixed(2)} s`,
    ]);
  rows.push(
    ['Bundle size, gzip (all assets)', kb(bundle.total_gzip_bytes)],
    ['Bundle size, gzip (initial load)', kb(bundle.initial_gzip_bytes)],
  );
  if (tests) {
    rows.push(
      ['Unit tests (Vitest)', `${tests.unit.passed} passed, ${tests.unit.failed} failed`],
      ['E2E tests (Playwright)', `${tests.e2e.passed} passed, ${tests.e2e.failed} failed`],
      [
        'axe violations (WCAG 2.1 AA)',
        tests.axe ? `${tests.axe.violations} across ${tests.axe.views_checked} view states` : 'n/a',
      ],
    );
  }
  const md =
    '| Metric | Result |\n| --- | --- |\n' +
    rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n') +
    '\n';
  writeFileSync(path.join(ROOT, 'reports', 'bench.md'), md);
  console.log('\n' + md);
  if (statSync(path.join(ROOT, 'reports', 'bench.md')).size === 0) process.exit(1);
  if (tests && (tests.unit.failed > 0 || tests.e2e.failed > 0)) process.exit(1);
}

void main();
