import { spanSchema, type Span } from './schema';

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  spans: Span[];
  /** Non-blank lines seen. */
  totalLines: number;
  errorCount: number;
  /** The first few errors, for display. */
  errors: ParseError[];
}

const MAX_KEPT_ERRORS = 50;

/**
 * Incremental JSONL parser. Feed it text chunks with `push`, then call `finish`.
 * A bad line is counted and skipped; it never stops the parse.
 */
export class JsonlParser {
  private buffer = '';
  private line = 0;
  private spans: Span[] = [];
  private totalLines = 0;
  private errorCount = 0;
  private errors: ParseError[] = [];

  push(chunk: string): void {
    this.buffer += chunk;
    let start = 0;
    let end = this.buffer.indexOf('\n', start);
    while (end !== -1) {
      this.handle(this.buffer.slice(start, end));
      start = end + 1;
      end = this.buffer.indexOf('\n', start);
    }
    this.buffer = this.buffer.slice(start);
  }

  finish(): ParseResult {
    if (this.buffer.length > 0) this.handle(this.buffer);
    this.buffer = '';
    return {
      spans: this.spans,
      totalLines: this.totalLines,
      errorCount: this.errorCount,
      errors: this.errors,
    };
  }

  private fail(message: string): void {
    this.errorCount += 1;
    if (this.errors.length < MAX_KEPT_ERRORS) this.errors.push({ line: this.line, message });
  }

  private handle(raw: string): void {
    this.line += 1;
    let text = raw.trim();
    if (this.line === 1 && text.charCodeAt(0) === 0xfeff) text = text.slice(1).trim();
    if (text === '') return;
    this.totalLines += 1;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      this.fail('not valid JSON');
      return;
    }
    const result = spanSchema.safeParse(json);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue && issue.path.length > 0 ? issue.path.join('.') + ': ' : '';
      this.fail(path + (issue?.message ?? 'invalid span'));
      return;
    }
    this.spans.push({
      ...result.data,
      startMs: Date.parse(result.data.start_ts),
      endMs: Date.parse(result.data.end_ts),
    });
  }
}

export function parseJsonl(text: string): ParseResult {
  const parser = new JsonlParser();
  parser.push(text);
  return parser.finish();
}

/** Parse a byte stream (a File or a fetch body) without holding the whole text in memory. */
export async function parseStream(
  stream: ReadableStream<Uint8Array>,
  onProgress?: (bytes: number) => void,
): Promise<ParseResult> {
  const parser = new JsonlParser();
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    parser.push(decoder.decode(value, { stream: true }));
    onProgress?.(bytes);
  }
  parser.push(decoder.decode());
  return parser.finish();
}
