import { parseStream, type ParseResult } from './parse';

export interface LoadedDataset extends ParseResult {
  name: string;
  /** Wall-clock milliseconds spent reading and validating. */
  loadMs: number;
  bytes: number;
}

export async function loadFromFile(
  file: File,
  onProgress?: (bytes: number) => void,
): Promise<LoadedDataset> {
  const t0 = performance.now();
  const result = await parseStream(file.stream(), onProgress);
  return { ...result, name: file.name, loadMs: performance.now() - t0, bytes: file.size };
}

/** Fetch a JSONL file over HTTP. The only network request this app makes, and only when asked. */
export async function loadFromUrl(
  url: string,
  onProgress?: (bytes: number) => void,
): Promise<LoadedDataset> {
  const t0 = performance.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed: HTTP ' + res.status);
  if (!res.body) throw new Error('Fetch failed: the response has no body');
  const result = await parseStream(res.body, onProgress);
  const name = decodeURIComponent(url.split('?')[0]?.split('/').pop() || url);
  const bytes = Number(res.headers.get('content-length') ?? 0);
  return { ...result, name, loadMs: performance.now() - t0, bytes };
}
