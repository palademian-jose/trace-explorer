const int = new Intl.NumberFormat('en-GB');

export const fmtInt = (n: number): string => int.format(Math.round(n));

export function fmtUsd(n: number): string {
  if (n === 0) return '$0.00';
  if (Math.abs(n) < 0.01) return '$' + n.toFixed(5);
  return '$' + n.toFixed(n < 100 ? 4 : 2);
}

export function fmtMs(ms: number): string {
  if (ms >= 60_000) return (ms / 60_000).toFixed(1) + ' min';
  if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s';
  return ms.toFixed(ms < 10 ? 1 : 0) + ' ms';
}

export const fmtPct = (ratio: number, digits = 1): string => (ratio * 100).toFixed(digits) + '%';

export const fmtBytes = (n: number): string =>
  n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' kB';

/** Display a timestamp in UTC, which is how the files store them. */
export const fmtTime = (ms: number): string =>
  new Date(ms)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '') + ' UTC';

/** Value for an `<input type="datetime-local">`, read as UTC. */
export const toLocalInput = (ms: number | null): string =>
  ms === null ? '' : new Date(ms).toISOString().slice(0, 16);

export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value + ':00Z');
  return Number.isNaN(ms) ? null : ms;
}

export const shortId = (id: string): string => (id.length > 13 ? id.slice(0, 8) + '…' : id);
