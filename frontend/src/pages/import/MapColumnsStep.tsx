/** Import step 2: match each CSV column to a field, with a preview of the first rows. */
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import type { ImportField } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Select } from '@/components/ui/Select';
import { IMPORT_FIELD_LABEL, type ParsedCsv } from '@/lib/csvImport';

const PREVIEW_ROWS = 8;

interface MapColumnsStepProps {
  fileName: string;
  csv: ParsedCsv;
  mapping: ImportField[];
  onMappingChange: (update: (mapping: ImportField[]) => ImportField[]) => void;
  loading: boolean;
  onBack: () => void;
  onNext: () => void;
}

/** Second step of the import. */
export function MapColumnsStep({
  fileName,
  csv,
  mapping,
  onMappingChange,
  loading,
  onBack,
  onNext,
}: MapColumnsStepProps) {
  const hasEnglish = mapping.includes('english');
  const mappedTwice = mapping.filter((field, index) => field !== 'ignore' && mapping.indexOf(field) !== index);

  return (
    <div className="px-6 py-6">
      <p className="mb-3 text-[13px] text-fg-2">
        Match each column in <b>{fileName}</b> to a field. We guessed from the headers — change anything that is wrong.{' '}
        {csv.rows.length} data rows.
      </p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="text-[12px]">
          <thead>
            <tr className="bg-bg-2">
              {csv.headers.map((header, column) => (
                <th key={column} className="min-w-[170px] border-r border-line p-2 text-left align-top last:border-r-0">
                  <div className="mb-1.5 truncate font-mono text-[11px] text-muted" title={header}>
                    {header || `(column ${column + 1})`}
                  </div>
                  <Select
                    aria-label={`Field for column ${header}`}
                    value={mapping[column]}
                    onChange={(e) =>
                      onMappingChange((current) =>
                        current.map((field, index) => (index === column ? (e.target.value as ImportField) : field)),
                      )
                    }
                    className={mapping[column] === 'ignore' ? 'opacity-60' : ''}
                  >
                    {(Object.keys(IMPORT_FIELD_LABEL) as ImportField[]).map((field) => (
                      <option key={field} value={field}>
                        {IMPORT_FIELD_LABEL[field]}
                      </option>
                    ))}
                  </Select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {csv.rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-line">
                {csv.headers.map((_, column) => (
                  <td
                    key={column}
                    className={cn(
                      'max-w-[260px] truncate border-r border-line px-2 py-1.5 last:border-r-0',
                      mapping[column] === 'ignore' ? 'text-faint' : 'text-fg-2',
                    )}
                  >
                    {row[column] || <span className="text-faint">·</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {csv.rows.length > PREVIEW_ROWS && (
        <div className="mt-2 text-[11px] text-faint">
          Showing the first {PREVIEW_ROWS} of {csv.rows.length} rows.
        </div>
      )}
      {!hasEnglish && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-danger">
          <AlertTriangle className="size-3.5" />
          One column must be mapped to English.
        </p>
      )}
      {mappedTwice.length > 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-warn">
          <AlertTriangle className="size-3.5" />
          {mappedTwice.map((field) => IMPORT_FIELD_LABEL[field]).join(', ')} is mapped twice — only the last column will
          be used.
        </p>
      )}
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" icon={<ArrowLeft className="size-3.5" />} onClick={onBack}>
          Choose another file
        </Button>
        <Button variant="primary" disabled={!hasEnglish} loading={loading} onClick={onNext}>
          Check rows <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
