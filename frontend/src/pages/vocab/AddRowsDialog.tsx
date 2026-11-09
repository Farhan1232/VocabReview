/** Spreadsheet-style entry of many words, with paste from Excel, a full-text cell preview and a duplicate check. */
import { memo, useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardPaste, Copy, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { CEFR_LEVELS, type Cefr, type DuplicateCheck, type VocabDraft } from '@/api/types';
import { useApiMutation } from '@/hooks/api';
import { useDebounced } from '@/hooks/useDebounced';
import { Dialog } from '@/components/ui/Overlay';
import { Button, IconButton } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';

type Cell = 'english' | 'polish' | 'definition' | 'partOfSpeech' | 'cefr' | 'topics' | 'example';
const COLS: { key: Cell; label: string; w: string }[] = [
  { key: 'english', label: 'English *', w: '1.2fr' },
  { key: 'polish', label: 'Polish', w: '1fr' },
  { key: 'definition', label: 'Definition', w: '1.6fr' },
  { key: 'partOfSpeech', label: 'POS', w: '0.6fr' },
  { key: 'cefr', label: 'CEFR', w: '0.45fr' },
  { key: 'topics', label: 'Topics', w: '0.9fr' },
  { key: 'example', label: 'Example', w: '1.6fr' },
];
const GRID = `44px ${COLS.map((c) => c.w).join(' ')} 32px`;

/** One row of the grid. `skip` means "this duplicate should not be added" (duplicates are added and flagged by default). */
type RowData = Record<Cell, string> & { id: number; skip: boolean };

let nextRowId = 1;
const blank = (): RowData => ({
  id: nextRowId++,
  english: '',
  polish: '',
  definition: '',
  partOfSpeech: '',
  cefr: '',
  topics: '',
  example: '',
  skip: false,
});
const blankRows = (n: number) => Array.from({ length: n }, blank);

function toDraft(row: RowData): VocabDraft {
  const list = (s: string) =>
    s
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean);
  const cefr = row.cefr.trim().toUpperCase();
  return {
    english: row.english.trim(),
    polish: list(row.polish),
    definition: row.definition.trim() || null,
    partOfSpeech: row.partOfSpeech.trim().toLowerCase() || null,
    cefr: (CEFR_LEVELS as readonly string[]).includes(cefr) ? (cefr as Cefr) : null,
    example: row.example.trim() || null,
    topics: list(row.topics),
    notes: null,
  };
}

/** Whether a row is a duplicate (flagged) and whether the teacher chose to leave it out. */
interface RowStatus {
  check: DuplicateCheck | null;
  duplicate: boolean;
  skipped: boolean;
}

/** Spreadsheet-style entry: type, Tab across, Enter for next row, or paste rows from Excel/Sheets. */
export function AddRowsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<RowData[]>(() => blankRows(8));
  const [active, setActive] = useState<{ id: number; col: number } | null>(null);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const toast = useToast();
  const create = useApiMutation((d: VocabDraft[]) => api.createItems(d));

  // The duplicate check runs on the server shortly after typing stops. Duplicates are only flagged, never blocked.
  const keys = useMemo(
    () => JSON.stringify(rows.map((r) => [r.english.trim(), r.partOfSpeech.trim().toLowerCase() || null])),
    [rows],
  );
  const checkedKeys = useDebounced(keys, 300);
  const check = useQuery({
    queryKey: ['duplicate-check', checkedKeys],
    queryFn: () =>
      api.checkDuplicates(
        (JSON.parse(checkedKeys) as [string, string | null][]).map(([english, partOfSpeech]) => ({
          english,
          partOfSpeech,
        })),
      ),
    enabled: open,
    placeholderData: (previous) => previous,
    staleTime: 0,
  });
  const upToDate = checkedKeys === keys && !check.isPlaceholderData && !!check.data;
  const checking = rows.some((r) => r.english.trim()) && !upToDate;

  const status = useMemo(() => {
    const out = new Map<number, RowStatus>();
    rows.forEach((row, i) => {
      const result = upToDate ? (check.data?.[i] ?? null) : null;
      const duplicate = !!row.english.trim() && !!result && (result.repeatOf !== null || result.matches.length > 0);
      out.set(row.id, { check: result, duplicate, skipped: duplicate && row.skip });
    });
    return out;
  }, [rows, check.data, upToDate]);

  const filled = rows.filter((r) => r.english.trim());
  const toAdd = filled.filter((r) => !status.get(r.id)?.skipped);
  const duplicateCount = filled.filter((r) => status.get(r.id)?.duplicate).length;
  const skippedCount = filled.length - toAdd.length;
  const badCefr = rows.filter(
    (r) => r.cefr.trim() && !(CEFR_LEVELS as readonly string[]).includes(r.cefr.trim().toUpperCase()),
  ).length;

  const setCell = useCallback(
    (id: number, k: Cell, v: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r))),
    [],
  );
  const setSkip = (id: number, skip: boolean) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, skip } : r)));
  const removeRow = useCallback((id: number) => setRows((rs) => rs.filter((r) => r.id !== id)), []);

  const onPaste = useCallback((i: number, col: number, e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const lines = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((l, idx, a) => l.length || idx < a.length - 1);
    setRows((rs) => {
      const next = [...rs];
      lines.forEach((line, li) => {
        const cells = line.split('\t');
        const target = i + li;
        while (next.length <= target) next.push(blank());
        const row = { ...next[target] };
        cells.forEach((v, ci) => {
          const column = COLS[col + ci];
          if (column) row[column.key] = v.trim();
        });
        next[target] = row;
      });
      if (next[next.length - 1].english) next.push(blank());
      return next;
    });
  }, []);

  const focusOn = useCallback((id: number, col: number) => setActive({ id, col }), []);

  const addRowAfter = useCallback((i: number) => {
    setRows((rs) => (i === rs.length - 1 ? [...rs, blank()] : rs));
  }, []);

  const close = () => {
    setRows(blankRows(8));
    setActive(null);
    setDuplicatesOnly(false);
    onClose();
  };

  const submit = () =>
    create.mutate(toAdd.map(toDraft), {
      onSuccess: (items) => {
        toast({
          tone: 'success',
          title: `${items.length} word(s) added`,
          body:
            [
              duplicateCount - skippedCount > 0 &&
                `${duplicateCount - skippedCount} flagged as duplicate(s) — see the Duplicates tab`,
              skippedCount > 0 && `${skippedCount} left out`,
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
        });
        close();
      },
    });

  const activeIndex = active ? rows.findIndex((r) => r.id === active.id) : -1;
  const activeRow = activeIndex >= 0 ? rows[activeIndex] : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      width={1100}
      title="Add several words"
      description={
        <span className="flex items-center gap-1.5">
          <ClipboardPaste className="size-3.5" /> Paste rows straight from Excel or Google Sheets (columns in this
          order), or type — Tab moves right, Enter goes to the next row. Click a cell to read all of it below.
        </span>
      }
      footer={
        <>
          <span className="mr-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            <span>
              {filled.length} row(s) · <b className="text-fg-2">{toAdd.length} to add</b>
            </span>
            {checking && <span>Checking for duplicates…</span>}
            {!checking && duplicateCount > 0 && (
              <span className="text-warn">
                <Copy className="mr-1 inline size-3.5" />
                {duplicateCount} flagged as duplicate(s)
                {skippedCount ? `, ${skippedCount} left out` : ', all will be added'}
                <button
                  type="button"
                  className="ml-2 underline underline-offset-2 hover:text-fg"
                  onClick={() => setDuplicatesOnly((v) => !v)}
                >
                  {duplicatesOnly ? 'Show all rows' : 'Show duplicates only'}
                </button>
              </span>
            )}
            {badCefr > 0 && <span className="text-warn">{badCefr} unknown CEFR value(s) will be left blank</span>}
          </span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!toAdd.length} loading={create.isPending} onClick={submit}>
            Add {toAdd.length || ''} word{toAdd.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-lg border border-line">
        <div
          className="grid bg-bg-2 text-[11px] font-semibold uppercase tracking-wider text-muted"
          style={{ gridTemplateColumns: GRID }}
        >
          <div />
          {COLS.map((c) => (
            <div key={c.key} className="border-l border-line px-2 py-1.5">
              {c.label}
            </div>
          ))}
          <div />
        </div>
        <div className="max-h-[42vh] overflow-y-auto">
          {rows.map((r, i) =>
            duplicatesOnly && !status.get(r.id)?.duplicate ? null : (
              <GridRow
                key={r.id}
                row={r}
                index={i}
                duplicate={!!status.get(r.id)?.duplicate}
                skipped={!!status.get(r.id)?.skipped}
                selected={active?.id === r.id}
                onCell={setCell}
                onPaste={onPaste}
                onFocusCell={focusOn}
                onEnterLastRow={addRowAfter}
                onRemove={removeRow}
              />
            ),
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        icon={<Plus className="size-3.5" />}
        onClick={() => setRows((rs) => [...rs, ...blankRows(5)])}
      >
        5 more rows
      </Button>
      <CellPreview
        row={activeRow}
        index={activeIndex}
        col={active?.col ?? 0}
        status={activeRow ? status.get(activeRow.id)! : null}
        onChange={(v) => activeRow && setCell(activeRow.id, COLS[active!.col].key, v)}
        onSkip={(skip) => activeRow && setSkip(activeRow.id, skip)}
      />
    </Dialog>
  );
}

const focusCell = (i: number, c: number) =>
  document.querySelector<HTMLInputElement>(`[data-cell="${i}-${c}"]`)?.focus();

const GridRow = memo(function GridRow({
  row,
  index,
  duplicate,
  skipped,
  selected,
  onCell,
  onPaste,
  onFocusCell,
  onEnterLastRow,
  onRemove,
}: {
  row: RowData;
  index: number;
  duplicate: boolean;
  skipped: boolean;
  selected: boolean;
  onCell: (id: number, k: Cell, v: string) => void;
  onPaste: (i: number, col: number, e: React.ClipboardEvent) => void;
  onFocusCell: (id: number, col: number) => void;
  onEnterLastRow: (i: number) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <div
      className={cn(
        'group grid border-t border-line',
        duplicate && 'bg-warn/[0.06]',
        skipped && 'text-faint',
        selected && 'bg-accent/[0.03]',
      )}
      style={{ gridTemplateColumns: GRID }}
    >
      <div
        className={cn(
          'flex items-center justify-center gap-0.5 font-mono text-[10px]',
          duplicate ? 'text-warn' : 'text-faint',
        )}
        title={
          skipped
            ? 'Duplicate — left out. Click a cell in this row to change it.'
            : duplicate
              ? 'Duplicate — will be added and flagged. Click a cell in this row to see the other copy.'
              : undefined
        }
      >
        {duplicate && <Copy className="size-3" />}
        {index + 1}
      </div>
      {COLS.map((c, ci) => (
        <input
          key={c.key}
          data-cell={`${index}-${ci}`}
          value={row[c.key]}
          onChange={(e) => onCell(row.id, c.key, e.target.value)}
          onPaste={(e) => onPaste(index, ci, e)}
          onFocus={() => onFocusCell(row.id, ci)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnterLastRow(index);
              setTimeout(() => focusCell(index + 1, 0));
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              focusCell(index + 1, ci);
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              focusCell(index - 1, ci);
            }
          }}
          className={cn(
            'h-8 min-w-0 border-l border-line bg-transparent px-2 text-[13px] outline-none focus:bg-accent/[0.06] focus:shadow-[inset_0_0_0_1px_var(--color-accent)]',
            c.key === 'english' ? 'font-semibold' : !skipped && 'text-fg-2',
            skipped && 'line-through decoration-warn/40',
          )}
        />
      ))}
      <IconButton
        label="Remove row"
        size="xs"
        icon={<Trash2 className="size-3" />}
        className="m-auto opacity-0 group-hover:opacity-100"
        onClick={() => onRemove(row.id)}
      />
    </div>
  );
});

/** The full text of the selected cell (editable), and why its row is a duplicate. */
function CellPreview({
  row,
  index,
  col,
  status,
  onChange,
  onSkip,
}: {
  row: RowData | null;
  index: number;
  col: number;
  status: RowStatus | null;
  onChange: (v: string) => void;
  onSkip: (skip: boolean) => void;
}) {
  if (!row || !status) {
    return (
      <div className="mt-2 grid min-h-[92px] place-items-center rounded-lg border border-dashed border-line text-[12px] text-faint">
        Click any cell to read its full text here.
      </div>
    );
  }
  const column = COLS[col];
  const value = row[column.key];
  const result = status.check;
  return (
    <div className="mt-2 grid min-h-[92px] gap-2 rounded-lg border border-line bg-bg-2/60 p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Row {index + 1} · {column.label.replace(' *', '')}
        {row.english.trim() && column.key !== 'english' && (
          <span className="normal-case tracking-normal text-fg-2">— {row.english.trim()}</span>
        )}
        <span className="ml-auto font-normal normal-case tracking-normal text-faint">{value.length} characters</span>
      </div>
      <textarea
        aria-label={`Row ${index + 1} ${column.label.replace(' *', '')}, full text`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(5, Math.max(2, Math.ceil(value.length / 140)))}
        placeholder="Empty"
        className="w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[13px] leading-relaxed text-fg outline-none focus:border-accent"
      />
      {status.duplicate && result && (
        <div className="grid gap-1 text-[12px]">
          {result.repeatOf !== null && (
            <div className="text-warn">
              <Copy className="mr-1 inline size-3.5" />
              Same word as row {result.repeatOf + 1} in this list.
            </div>
          )}
          {result.matches.length > 0 && (
            <div className="text-warn">
              <Copy className="mr-1 inline size-3.5" />
              Already in the bank:
              {result.matches.slice(0, 3).map((m, i) => (
                <span key={m.id} className="ml-1.5 text-fg-2">
                  {i > 0 && <span className="mr-1.5 text-faint">|</span>}
                  {m.english}
                  {m.partOfSpeech && ` · ${m.partOfSpeech}`}
                  {m.cefr && ` · ${m.cefr}`} — {m.polish.join(', ') || m.definition || 'no translation'}
                </span>
              ))}
              {result.matches.length > 3 && <span className="ml-1 text-muted">+{result.matches.length - 3} more</span>}
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-fg-2">
            <Checkbox checked={row.skip} onChange={onSkip} label="Leave this row out" />
            Leave this row out (it really is the same word)
            <span className={cn('ml-auto', row.skip ? 'text-faint' : 'text-warn')}>
              {row.skip ? 'Will not be added' : 'Will be added and flagged as a duplicate'}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
