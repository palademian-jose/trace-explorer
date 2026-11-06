import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const OTHER = path.resolve('public/samples/cheaper_model.jsonl');

async function loadSample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load bundled sample' }).click();
  await expect(page.getByTestId('dataset-info')).toContainText('3,914 spans');
}

async function axeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations;
}

test('loads the bundled sample and shows overview totals and charts', async ({ page }) => {
  await loadSample(page);
  await expect(page.getByLabel('Totals')).toContainText('850');
  await expect(page.getByText('Traces', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('figure', { name: /cost in US dollars by model/ })).toBeVisible();
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
});

test('loads a file chosen with the file picker and reports bad lines', async ({ page }) => {
  await page.goto('/');
  const good = (id: string) =>
    JSON.stringify({
      trace_id: 't',
      span_id: id,
      name: 'x',
      kind: 'llm',
      start_ts: '2026-10-12T12:00:00Z',
      end_ts: '2026-10-12T12:00:01Z',
      latency_ms: 1000,
    });
  await page.getByLabel('Open a trace file file').setInputFiles({
    name: 'tiny.jsonl',
    mimeType: 'application/x-ndjson',
    buffer: Buffer.from([good('a'), 'garbage', good('b')].join('\n')),
  });
  await expect(page.getByTestId('dataset-info')).toContainText('tiny.jsonl: 2 spans, 1 bad lines');
  await expect(page.getByText('1 of 3 lines were skipped')).toBeVisible();
});

test('filters traces, opens a trace and shows the waterfall', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Traces' }).click();
  const count = page.getByTestId('trace-count');
  await expect(count).toContainText('850 traces, 3,914 spans');

  await page.getByLabel('Status').selectOption('error');
  await expect(count).not.toContainText('850 traces');
  const filtered = await count.innerText();

  await page.getByLabel('Kind').selectOption('llm');
  await expect(count).not.toHaveText(filtered);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(count).toContainText('850 traces');

  await page
    .getByRole('row', { name: /agent\.run|rag\.answer/ })
    .first()
    .click();
  await expect(page.getByRole('region', { name: /^Trace / })).toBeVisible();
  const waterfall = page.getByRole('group', { name: 'Span waterfall' });
  await expect(waterfall.getByRole('button').first()).toBeVisible();
  await waterfall.getByRole('button').nth(1).click();
  await expect(page.getByRole('complementary', { name: 'Span metadata' })).toContainText('Latency');
  await expect(page.getByLabel('Span JSON')).toContainText('"span_id"');
});

test('virtualises the trace table', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Traces' }).click();
  await expect(page.getByTestId('trace-row').first()).toBeVisible();
  const rendered = await page.getByTestId('trace-row').count();
  expect(rendered).toBeGreaterThan(5);
  expect(rendered).toBeLessThan(60);
});

test('exports the filtered view as CSV', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Traces' }).click();
  await page.getByLabel('Kind').selectOption('verify');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export view as CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('trace-explorer-view.csv');
  const out = path.join('test-results', 'export.csv');
  mkdirSync('test-results', { recursive: true });
  await file.saveAs(out);
  const lines = readFileSync(out, 'utf8').trim().split('\n');
  expect(lines[0]).toContain('trace_id,span_id');
  expect(lines.length).toBeGreaterThan(10);
  expect(lines.slice(1).every((l) => l.includes(',verify,'))).toBe(true);
});

test('compares two files', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Compare' }).click();
  await page.getByLabel('Second file file').setInputFiles(OTHER);
  const table = page.getByRole('table', { name: 'Before and after' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table).toContainText('baseline.jsonl');
  await expect(table).toContainText('cheaper_model.jsonl');
  await expect(table.getByRole('row').nth(2)).toContainText('%');
});

test('dark mode toggle changes the theme', async ({ page }) => {
  await loadSample(page);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await bg();
  await page.getByRole('button', { name: /^Theme:/ }).click(); // system -> light
  await page.getByRole('button', { name: /^Theme:/ }).click(); // light -> dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bg()).not.toBe(light);
});

test('follows prefers-color-scheme when set to system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(15, 18, 24)');
});

test('loads a file from the ?src= parameter', async ({ page }) => {
  await page.goto('/?src=/samples/cheaper_model.jsonl');
  await expect(page.getByTestId('dataset-info')).toContainText('cheaper_model.jsonl: 4,815 spans');
});

test('makes no network requests beyond the app itself', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4173')) external.push(r.url());
  });
  await loadSample(page);
  await page.getByRole('button', { name: 'Traces' }).click();
  expect(external).toEqual([]);
});

test('has no axe violations on the main views, light and dark', async ({ page }) => {
  const report: Record<string, number> = {};
  const check = async (name: string) => {
    const v = await axeViolations(page);
    report[name] = v.length;
    expect(v, name + ': ' + JSON.stringify(v.map((x) => x.id + ' ' + x.nodes[0]?.html))).toEqual(
      [],
    );
  };

  await page.goto('/');
  await check('empty');
  await page.getByRole('button', { name: 'Load bundled sample' }).click();
  await expect(page.getByTestId('dataset-info')).toBeVisible();
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await check('overview-light');

  await page.getByRole('button', { name: 'Traces' }).click();
  await expect(page.getByTestId('trace-row').first()).toBeVisible();
  await check('traces-light');
  await page.getByTestId('trace-row').first().click();
  await expect(page.getByRole('group', { name: 'Span waterfall' })).toBeVisible();
  await page.getByRole('group', { name: 'Span waterfall' }).getByRole('button').nth(1).click();
  await check('trace-detail-light');

  await page.getByRole('button', { name: 'Compare' }).click();
  await page.getByLabel('Second file file').setInputFiles(OTHER);
  await expect(page.getByRole('table', { name: 'Before and after' })).toBeVisible();
  await check('compare-light');

  await page.getByRole('button', { name: /^Theme:/ }).click();
  await page.getByRole('button', { name: /^Theme:/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await check('compare-dark');
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await check('overview-dark');
  await page.getByRole('button', { name: 'Traces' }).click();
  await expect(page.getByTestId('trace-row').first()).toBeVisible();
  await check('traces-dark');

  mkdirSync('reports', { recursive: true });
  writeFileSync(
    'reports/axe.json',
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        ruleset: 'wcag2a, wcag2aa, wcag21aa',
        views: report,
        total_violations: Object.values(report).reduce((a, b) => a + b, 0),
      },
      null,
      2,
    ) + '\n',
  );
});
