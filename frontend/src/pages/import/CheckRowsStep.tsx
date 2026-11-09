/** Import step 3: every row with its duplicate status, and the teacher's choice of what to do with it. */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Copy, Split, XCircle } from 'lucide-react';
import type { ImportPreviewRow, ImportRowStatus } from '@/api/types';
import { CefrBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';

const STATUS_META: Record<ImportRowStatus, { label: string; color: string; icon: ReactNode }> = {
  new: { label: 'New', color: 'var(--color-accent)', icon: <CheckCircle2 className="size-3.5" /> },
  possible_duplicate: { label: 'Duplicate?', color: 'var(--color-st-review)', icon: <Split className="size-3.5" /> },
  exact_duplicate: { label: 'Duplicate', color: 'var(--color-muted)', icon: <Copy className="size-3.5" /> },
  error: { label: 'Error', color: 'var(--color-danger)', icon: <XCircle className="size-3.5" /> },
};

const UPDATE_PREFIX = 'update:';

interface CheckRowsStepProps {
  rows: ImportPreviewRow[];
  onRowsChange: (update: (rows: ImportPreviewRow[]) => ImportPreviewRow[]) => void;
  importing: boolean;
  onBack: () => void;
  onImport: () => void;
}

/** Third step of the import. */
export function CheckRowsStep({ rows, onRowsChange, importing, onBack, onImport }: CheckRowsStepProps) {
  const [filter, setFilter] = useState<'all' | ImportRowStatus>('all');

  const counts = useMemo(() => {
    const byStatus = { all: rows.length, new: 0, possible_duplicate: 0, exact_duplicate: 0, error: 0 } as Record<
      'all' | ImportRowStatus,
      number
    >;
    rows.forEach((row) => byStatus[row.status]++);
    return byStatus;
  }, [rows]);

  const plan = useMemo(
    () => ({
      add: rows.filter((row) => row.status !== 'error' && row.action === 'add').length,
      update: rows.filter((row) => row.status !== 'error' && row.action === 'update').length,
      skip: rows.filter((row) => row.status !== 'error' && row.action === 'skip').length,
      reject: counts.error,
    }),
    [rows, counts.error],
  );

  const setAction = (index: number, action: ImportPreviewRow['action'], target?: string | null) =>
    onRowsChange((current) =>
      current.map((row) =>
        row.index === index
          ? { ...row, action, updateTargetId: target !== undefined ? target : row.updateTargetId }
          : row,
      ),
    );

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={(['all', 'new', 'possible_duplicate', 'exact_duplicate', 'error'] as const).map((status) => ({
            value: status,
            label: `${status === 'all' ? 'All' : STATUS_META[status].label} ${counts[status]}`,
          }))}
        />
        {counts.possible_duplicate > 0 && (
          <span className="text-[12px] text-st-review">
            <Split className="mr-1 inline size-3.5" />
            {counts.possible_duplicate} row(s) are the same word (English and part of speech) as a word in the bank or
            an earlier row. They will be added and flagged as duplicates; choose “Skip” for any you don't want.
          </span>
        )}
      </div>
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 z-10 bg-bg-2/95 text-[11px] uppercase tracking-wider text-muted backdrop-blur">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
            <th className="w-12">Row</th>
            <th className="w-[120px]">Status</th>
            <th>English</th>
            <th>Polish</th>
            <th>Definition</th>
            <th>CEFR</th>
            <th>Topics</th>
            <th className="w-[230px]">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((row) => filter === 'all' || row.status === filter)
            .map((row) => (
              <PreviewRow key={row.index} row={row} onAction={setAction} />
            ))}
        </tbody>
      </table>
      <div className="sticky bottom-0 mt-auto flex items-center gap-4 border-t border-line bg-bg-2/95 px-6 py-3 backdrop-blur">
        <Button variant="ghost" icon={<ArrowLeft className="size-3.5" />} onClick={onBack}>
          Back to mapping
        </Button>
        <div className="ml-auto text-[12px] text-muted">
          Will <b className="text-accent">add {plan.add}</b> · update {plan.update} · skip {plan.skip} · reject{' '}
          {plan.reject}
        </div>
        <Button variant="primary" disabled={!plan.add && !plan.update} loading={importing} onClick={onImport}>
          Import {plan.add + plan.update} row(s)
        </Button>
      </div>
    </div>
  );
}

function PreviewRow({
  row,
  onAction,
}: {
  row: ImportPreviewRow;
  onAction: (index: number, action: ImportPreviewRow['action'], target?: string | null) => void;
}) {
  const status = STATUS_META[row.status];
  // Row numbers match the spreadsheet: index 0 is the line after the header, which is line 2.
  const fileLine = row.index + 2;
  return (
    <tr className="border-t border-line/60 align-top hover:bg-surface [&>td]:px-3 [&>td]:py-2">
      <td className="font-mono text-faint">{fileLine}</td>
      <td>
        <span className="inline-flex items-center gap-1 font-medium" style={{ color: status.color }}>
          {status.icon}
          {status.label}
        </span>
      </td>
      <td>
        <div className="font-semibold">{row.draft.english || <span className="text-danger">missing</span>}</div>
        {row.messages.map((message, index) => (
          <div key={index} className="mt-0.5 text-[11px] text-muted">
            {message}
          </div>
        ))}
        {row.status === 'possible_duplicate' && (
          <div className="mt-1 grid gap-0.5">
            {row.matches.map((match) => (
              <div key={match.id} className="text-[11px] text-faint">
                existing: <span className="text-fg-2">{match.polish.join(', ') || '—'}</span> ·{' '}
                {match.definition || 'no definition'}
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="text-fg-2">{row.draft.polish.join(', ') || <span className="text-faint">—</span>}</td>
      <td className="max-w-[280px] text-muted">{row.draft.definition || <span className="text-faint">—</span>}</td>
      <td>
        <CefrBadge cefr={row.draft.cefr} />
      </td>
      <td className="text-muted">{row.draft.topics.join(', ')}</td>
      <td>
        {row.status === 'error' ? (
          <span className="text-[11px] text-danger">Will be rejected</span>
        ) : (
          <Select
            aria-label={`Action for row ${fileLine}`}
            value={row.action === 'update' ? `${UPDATE_PREFIX}${row.updateTargetId}` : row.action}
            onChange={(e) => {
              const value = e.target.value;
              if (value.startsWith(UPDATE_PREFIX)) onAction(row.index, 'update', value.slice(UPDATE_PREFIX.length));
              else onAction(row.index, value as 'add' | 'skip');
            }}
          >
            <option value="add">{row.status === 'possible_duplicate' ? 'Add (flag as duplicate)' : 'Add'}</option>
            <option value="skip">Skip</option>
            {row.matches.map((match) => (
              <option key={match.id} value={`${UPDATE_PREFIX}${match.id}`}>
                Fill blanks of “{match.polish[0] ?? match.definition ?? match.english}”
              </option>
            ))}
          </Select>
        )}
      </td>
    </tr>
  );
}
