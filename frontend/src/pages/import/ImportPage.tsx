/**
 * CSV import wizard. Holds the state shared between the four steps; nothing is saved until the
 * teacher confirms in step 3. Each step is its own component in this folder.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Download, FileSpreadsheet, FileUp } from 'lucide-react';
import { api } from '@/api/client';
import type { ImportField, ImportPreviewRow, ImportResult } from '@/api/types';
import { useApiMutation, useImportRuns } from '@/hooks/api';
import { downloadText } from '@/hooks/download';
import { autoMap, parseCsv, type ParsedCsv } from '@/lib/csvImport';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { CheckRowsStep } from './CheckRowsStep';
import { ChooseFileStep } from './ChooseFileStep';
import { ImportDoneStep } from './ImportDoneStep';
import { MapColumnsStep } from './MapColumnsStep';

const MAX_BYTES = 5 * 1024 * 1024;
const STEPS = ['Choose file', 'Map columns', 'Check rows', 'Done'];

const TEMPLATE =
  'ENGLISH|DEFINITION|LEVEL|TOPIC|EXAMPLE|POLISH\nbank|the land along the side of a river|B1|Nature|We sat on the river bank.|brzeg\nkettle|a pot for boiling water|A2|Cooking|Put the kettle on.|czajnik\n';

/** CSV import page. */
export function ImportPage() {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const { data: runs = [] } = useImportRuns();
  const commit = useApiMutation(() => api.commitImport(fileName, rows));

  const readFile = async (file: File) => {
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) return toast({ tone: 'error', title: 'Please choose a .csv file' });
    if (file.size > MAX_BYTES) return toast({ tone: 'error', title: 'File is larger than 5 MB' });
    const bytes = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      // Excel on Windows often saves "CSV" as Windows-1250 for Polish text.
      text = new TextDecoder('windows-1250').decode(bytes);
      toast({
        tone: 'info',
        title: 'File was not UTF-8',
        body: 'Read as Windows-1250 (Central European). Check the Polish letters in the preview.',
      });
    }
    const parsed = parseCsv(text);
    if (!parsed.headers.length || !parsed.rows.length)
      return toast({ tone: 'error', title: 'No rows found', body: 'The first line must be the column headers.' });
    setFileName(file.name);
    setCsv(parsed);
    setMapping(autoMap(parsed.headers));
    setStep(1);
  };

  const checkRows = async () => {
    if (!csv) return;
    setLoadingPreview(true);
    setRows(await api.previewImport(csv.rows, mapping));
    setLoadingPreview(false);
    setStep(2);
  };

  const startOver = () => {
    setStep(0);
    setCsv(null);
    setRows([]);
    setFileName('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={<FileUp />}
        title="Import CSV"
        subtitle="Preview → map → check duplicates → confirm. Nothing is saved until you confirm."
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<Download className="size-3.5" />}
            onClick={() => downloadText('vocabulary-template.csv', TEMPLATE, 'text/csv;charset=utf-8')}
          >
            Template
          </Button>
        }
      />

      <ol className="flex items-center gap-2 border-b border-line px-5 py-2.5">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'grid size-5 place-items-center rounded-full text-[10px] font-bold',
                index < step
                  ? 'bg-accent text-accent-ink'
                  : index === step
                    ? 'bg-fg text-bg'
                    : 'bg-surface-3 text-muted',
              )}
            >
              {index < step ? <Check className="size-3" strokeWidth={3} /> : index + 1}
            </span>
            <span className={cn('text-[12px] font-medium', index === step ? 'text-fg' : 'text-muted')}>{label}</span>
            {index < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-line-2" />}
          </li>
        ))}
        {fileName && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted">
            <FileSpreadsheet className="size-3.5" />
            {fileName}
          </span>
        )}
      </ol>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {step === 0 && <ChooseFileStep runs={runs} onFile={readFile} />}
        {step === 1 && csv && (
          <MapColumnsStep
            fileName={fileName}
            csv={csv}
            mapping={mapping}
            onMappingChange={setMapping}
            loading={loadingPreview}
            onBack={() => setStep(0)}
            onNext={checkRows}
          />
        )}
        {step === 2 && (
          <CheckRowsStep
            rows={rows}
            onRowsChange={setRows}
            importing={commit.isPending}
            onBack={() => setStep(1)}
            onImport={() =>
              commit.mutate(undefined, {
                onSuccess: (importResult) => {
                  setResult(importResult);
                  setStep(3);
                },
              })
            }
          />
        )}
        {step === 3 && result && (
          <ImportDoneStep
            fileName={fileName}
            result={result}
            onImportAnother={startOver}
            onOpenBank={() => navigate('/vocab')}
          />
        )}
      </div>
    </div>
  );
}
