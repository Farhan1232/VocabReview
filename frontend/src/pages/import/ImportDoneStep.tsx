/** Import step 4: the final added / updated / skipped / rejected counts. */
import { CheckCircle2 } from 'lucide-react';
import type { ImportResult } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Stat } from '@/components/ui/misc';

interface ImportDoneStepProps {
  fileName: string;
  result: ImportResult;
  onImportAnother: () => void;
  onOpenBank: () => void;
}

/** Last step of the import. */
export function ImportDoneStep({ fileName, result, onImportAnother, onOpenBank }: ImportDoneStepProps) {
  return (
    <div className="mx-auto max-w-[640px] px-6 py-12 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-glow">
        <CheckCircle2 className="size-7" />
      </div>
      <h2 className="mt-4 font-display text-[22px] font-bold">Import finished</h2>
      <p className="mt-1 text-[13px] text-muted">{fileName}</p>
      <div className="mt-6 grid grid-cols-4 gap-2 text-left">
        <Stat label="Added" value={result.added} tone="var(--color-accent)" />
        <Stat label="Updated" value={result.updated} tone="var(--color-st-new)" />
        <Stat label="Skipped" value={result.skipped} tone="var(--color-muted)" />
        <Stat label="Rejected" value={result.rejected} tone="var(--color-danger)" />
      </div>
      <div className="mt-8 flex justify-center gap-2">
        <Button variant="ghost" onClick={onImportAnother}>
          Import another file
        </Button>
        <Button variant="primary" onClick={onOpenBank}>
          Open the bank
        </Button>
      </div>
    </div>
  );
}
