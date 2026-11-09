/** Import step 1: drop or choose a file, with a note on the expected format and the recent imports. */
import { useRef, useState } from 'react';
import { FileSpreadsheet, FileUp, Info } from 'lucide-react';
import type { ImportRun } from '@/api/types';
import { cn } from '@/components/ui/cn';
import { formatDateTime } from '@/lib/dates';

/** First step of the import. */
export function ChooseFileStep({ runs, onFile }: { runs: ImportRun[]; onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
        }}
        className={cn(
          'grid-bg flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all',
          dragging ? 'border-accent bg-accent-soft' : 'border-line-2 hover:border-faint hover:bg-surface',
        )}
      >
        <div className="grid size-14 place-items-center rounded-2xl border border-line-2 bg-surface-2 text-accent">
          <FileUp className="size-6" />
        </div>
        <div className="mt-4 font-display text-[17px] font-semibold">Drop a CSV file here</div>
        <div className="mt-1 text-[13px] text-muted">
          or click to choose · comma, semicolon, tab or | separated · up to 5 MB
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </div>
      <div className="mt-5 flex gap-3 rounded-lg border border-line bg-surface p-4 text-[12px] text-fg-2">
        <Info className="mt-0.5 size-4 shrink-0 text-st-new" />
        <div>
          The familiar format works as-is:{' '}
          <code className="rounded bg-bg-2 px-1.5 py-0.5 font-mono text-[11px] text-accent">
            ENGLISH | DEFINITION | LEVEL | TOPIC | EXAMPLE
          </code>
          . Extra columns such as Polish, part of speech or notes are recognised automatically. Blank cells stay blank —
          nothing is invented. Importing the same file twice will not create duplicates.
        </div>
      </div>
      {runs.length > 0 && (
        <div className="mt-8">
          <h3 className="label">Previous imports</h3>
          <div className="panel divide-y divide-line">
            {runs.slice(0, 6).map((run) => (
              <div key={run.id} className="flex items-center gap-3 px-4 py-2 text-[12px]">
                <FileSpreadsheet className="size-3.5 text-muted" />
                <span className="font-medium">{run.fileName}</span>
                <span className="text-muted">{formatDateTime(run.at)}</span>
                <span className="ml-auto text-muted">
                  +{run.added} added · {run.updated} updated · {run.skipped} skipped · {run.rejected} rejected
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
