/** Virtualized, sortable, keyboard-driven table of words. Stays smooth with thousands of rows. */
import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown, Flame, Split } from 'lucide-react';
import type { VocabRow } from '@/api/types';
import { CefrBadge, StateBadge, TopicChip } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/components/ui/cn';
import { dueBucket, relative } from '@/lib/dates';
import { normalize, parseQuery } from '@/lib/search';

const ROW_H = 32;
const STATE_ORDER = { new: 0, learning: 1, review: 2, mastered: 3 } as const;

/** Highlights the search text inside a cell (diacritic-insensitive). */
function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const needle = parseQuery(query).text;
  if (!needle || !text) return text;
  const hay = normalize(text);
  const matchAt = hay.indexOf(needle);
  if (matchAt < 0 || hay.length !== text.length) return text;
  return (
    <>
      {text.slice(0, matchAt)}
      <mark className="rounded-sm bg-accent/25 px-px text-fg">{text.slice(matchAt, matchAt + needle.length)}</mark>
      {text.slice(matchAt + needle.length)}
    </>
  );
}

function DueCell({ iso }: { iso: string }) {
  const bucket = dueBucket(iso);
  const color =
    bucket === 'overdue'
      ? 'text-r-again'
      : bucket === 'today'
        ? 'text-accent'
        : bucket === 'soon'
          ? 'text-st-learning'
          : 'text-muted';
  return (
    <span className={cn('truncate tabular-nums', color)} title={new Date(iso).toLocaleString()}>
      {relative(iso)}
    </span>
  );
}

/** The table. */
export const VocabTable = memo(function VocabTable({
  rows,
  selected,
  onSelect,
  onOpen,
  studentMode,
  senseCounts,
  q,
}: {
  rows: VocabRow[];
  selected: Set<string>;
  onSelect: (next: Set<string>) => void;
  onOpen: (id: string) => void;
  studentMode: boolean;
  senseCounts: Map<string, number>;
  q: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const anchor = useRef<number | null>(null);
  const [cursor, setCursor] = useState(0);

  const columns = useMemo<ColumnDef<VocabRow>[]>(() => {
    const base: ColumnDef<VocabRow>[] = [
      { id: 'select', size: 36, enableSorting: false, header: () => null, cell: () => null },
      {
        id: 'english',
        header: 'English',
        size: 200,
        accessorFn: (r) => r.item.english.toLowerCase(),
        cell: ({ row: { original: r } }) => {
          const senses = senseCounts.get(r.item.english.toLowerCase()) ?? 1;
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('truncate font-semibold text-fg', r.item.archived && 'text-muted line-through')}>
                <Highlight text={r.item.english} query={q} />
              </span>
              {senses > 1 && (
                <span
                  title={`${senses} distinct senses of “${r.item.english}” in the bank`}
                  className="inline-flex items-center gap-0.5 rounded bg-st-review/10 px-1 text-[10px] font-semibold text-st-review"
                >
                  <Split className="size-2.5" />
                  {senses}
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: 'pos',
        header: 'POS',
        size: 92,
        accessorFn: (r) => r.item.partOfSpeech ?? '~',
        cell: ({ row: { original: r } }) => (
          <span className="truncate text-[12px] italic text-muted">{r.item.partOfSpeech ?? ''}</span>
        ),
      },
      {
        id: 'polish',
        header: 'Polish',
        size: 190,
        accessorFn: (r) => (r.item.polish[0] ?? '~').toLowerCase(),
        sortingFn: (a, b, id) => String(a.getValue(id)).localeCompare(String(b.getValue(id)), 'pl'),
        cell: ({ row: { original: r } }) =>
          r.item.polish.length ? (
            <span className="truncate text-fg-2">
              <Highlight text={r.item.polish.join(', ')} query={q} />
            </span>
          ) : (
            <span className="text-[11px] text-r-hard/80">missing</span>
          ),
      },
      {
        id: 'definition',
        header: 'Definition',
        size: 220,
        enableSorting: false,
        cell: ({ row: { original: r } }) => (
          <span className="truncate text-[12px] text-muted">
            <Highlight text={r.item.definition ?? ''} query={q} />
          </span>
        ),
      },
      {
        id: 'cefr',
        header: 'CEFR',
        size: 62,
        accessorFn: (r) => r.item.cefr ?? 'Z',
        cell: ({ row: { original: r } }) => <CefrBadge cefr={r.item.cefr} />,
      },
      {
        id: 'topics',
        header: 'Topics',
        size: 150,
        accessorFn: (r) => (r.item.topics[0] ?? '~').toLowerCase(),
        cell: ({ row: { original: r } }) => (
          <span className="flex min-w-0 gap-1 overflow-hidden">
            {r.item.topics.map((t) => (
              <TopicChip key={t} name={t} />
            ))}
          </span>
        ),
      },
    ];
    if (!studentMode) {
      base.push({
        id: 'example',
        header: 'Example',
        size: 260,
        enableSorting: false,
        cell: ({ row: { original: r } }) => (
          <span className="truncate text-[12px] text-faint">
            <Highlight text={r.item.example ?? ''} query={q} />
          </span>
        ),
      });
      return base;
    }
    base.push(
      {
        id: 'state',
        header: 'State',
        size: 104,
        accessorFn: (r) => (r.card ? STATE_ORDER[r.card.learningState] : 9),
        cell: ({ row: { original: r } }) =>
          r.card ? (
            <span className="flex items-center gap-1">
              <StateBadge state={r.card.learningState} />
              {r.card.difficult && <Flame className="size-3.5 text-r-again" aria-label="Difficult" />}
            </span>
          ) : (
            <span className="text-[11px] text-faint">not assigned</span>
          ),
      },
      {
        id: 'due',
        header: 'Next review',
        size: 128,
        accessorFn: (r) => (r.card ? new Date(r.card.fsrs.due).getTime() : Number.MAX_SAFE_INTEGER),
        cell: ({ row: { original: r } }) => (r.card ? <DueCell iso={r.card.fsrs.due} /> : null),
      },
    );
    return base;
  }, [studentMode, senseCounts, q]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.item.id,
    enableSortingRemoval: true,
  });
  const sorted = table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 16,
  });

  const allIds = sorted.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = !allSelected && allIds.some((id) => selected.has(id));

  const toggleAt = (index: number, shift: boolean) => {
    const next = new Set(selected);
    const id = allIds[index];
    if (shift && anchor.current !== null) {
      const [rangeStart, rangeEnd] = [Math.min(anchor.current, index), Math.max(anchor.current, index)];
      const select = !selected.has(id);
      for (let i = rangeStart; i <= rangeEnd; i++) {
        if (select) next.add(allIds[i]);
        else next.delete(allIds[i]);
      }
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    anchor.current = index;
    onSelect(next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const move = (i: number) => {
      const clamped = Math.max(0, Math.min(sorted.length - 1, i));
      setCursor(clamped);
      virt.scrollToIndex(clamped);
    };
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(cursor + 1);
      if (e.shiftKey) toggleAt(Math.min(cursor + 1, sorted.length - 1), false);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(cursor - 1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      move(cursor + 15);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      move(cursor - 15);
    } else if (e.key === ' ' && sorted[cursor]) {
      e.preventDefault();
      toggleAt(cursor, e.shiftKey);
    } else if (e.key === 'Enter' && sorted[cursor]) {
      e.preventDefault();
      onOpen(sorted[cursor].id);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      onSelect(new Set(allIds));
    }
  };

  const headers = table.getHeaderGroups()[0].headers;
  const gridTemplate = headers
    .map((h) =>
      h.column.id === 'definition' || h.column.id === 'example' ? `minmax(${h.getSize()}px, 1fr)` : `${h.getSize()}px`,
    )
    .join(' ');

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Vocabulary table. Arrow keys move, Space selects, Enter opens, Ctrl+A selects all."
      className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:outline-none"
    >
      <div className="min-w-[1100px]">
        <div
          role="row"
          className="sticky top-0 z-10 grid h-8 items-center border-b border-line bg-bg-2/95 backdrop-blur"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {headers.map((h) =>
            h.column.id === 'select' ? (
              <div key={h.id} className="flex justify-center">
                <Checkbox
                  label="Select all filtered rows"
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() =>
                    onSelect(
                      allSelected
                        ? new Set([...selected].filter((id) => !allIds.includes(id)))
                        : new Set([...selected, ...allIds]),
                    )
                  }
                />
              </div>
            ) : (
              <button
                key={h.id}
                type="button"
                disabled={!h.column.getCanSort()}
                onClick={h.column.getToggleSortingHandler()}
                className="group flex h-full items-center gap-1 px-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted enabled:hover:text-fg disabled:cursor-default"
              >
                {flexRender(h.column.columnDef.header, h.getContext())}
                {h.column.getCanSort() &&
                  ({
                    asc: <ArrowUp className="size-3 text-accent" />,
                    desc: <ArrowDown className="size-3 text-accent" />,
                  }[h.column.getIsSorted() as string] ?? (
                    <ChevronsUpDown className="size-3 opacity-0 group-hover:opacity-60" />
                  ))}
              </button>
            ),
          )}
        </div>

        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((v) => {
            const row = sorted[v.index];
            const isSel = selected.has(row.id);
            const isCursor = v.index === cursor;
            return (
              <div
                key={row.id}
                role="row"
                aria-selected={isSel}
                onClick={(e) => {
                  setCursor(v.index);
                  if (e.shiftKey || e.ctrlKey || e.metaKey) toggleAt(v.index, e.shiftKey);
                  else onOpen(row.id);
                }}
                className={cn(
                  'absolute left-0 right-0 grid cursor-pointer items-center border-b border-line/50 text-[13px] transition-colors',
                  isSel
                    ? 'bg-accent/[0.07] hover:bg-accent/10'
                    : v.index % 2
                      ? 'bg-white/[0.012] hover:bg-surface-2'
                      : 'hover:bg-surface-2',
                  isCursor && 'shadow-[inset_2px_0_0_var(--color-accent)]',
                )}
                style={{ top: v.start, height: ROW_H, gridTemplateColumns: gridTemplate }}
              >
                {row.getVisibleCells().map((cell) =>
                  cell.column.id === 'select' ? (
                    <div key={cell.id} className="flex justify-center">
                      <Checkbox
                        label={`Select ${row.original.item.english}`}
                        checked={isSel}
                        onChange={(_, e) => toggleAt(v.index, 'shiftKey' in e && e.shiftKey)}
                      />
                    </div>
                  ) : (
                    <div key={cell.id} className="flex min-w-0 items-center overflow-hidden px-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ),
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
