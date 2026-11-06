import { useRef, useState, type DragEvent } from 'react';

interface Props {
  title: string;
  onFile: (file: File) => void;
  onSample?: () => void;
  sampleLabel?: string;
  busy?: boolean;
}

/** Drop zone with a keyboard-reachable file picker. */
export function LoadPanel({ title, onFile, onSample, sampleLabel, busy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={'dropzone' + (over ? ' over' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <h2>{title}</h2>
      <p className="muted">
        Drop a JSONL span file here, or choose one. Files are read in your browser and never
        uploaded.
      </p>
      <div className="row-actions">
        <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>
          Choose file
        </button>
        {onSample && (
          <button className="btn" disabled={busy} onClick={onSample}>
            {sampleLabel ?? 'Load sample'}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept=".jsonl,.ndjson,.json,.txt,application/x-ndjson,application/json,text/plain"
        aria-label={title + ' file'}
        className="sr-only"
        tabIndex={-1}
        data-testid={'file-input-' + title.toLowerCase().replace(/\W+/g, '-')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
