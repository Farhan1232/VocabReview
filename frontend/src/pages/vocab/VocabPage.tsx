/** The vocabulary bank: search, filters, table, selection and bulk actions. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpenText, Copy, Download, FileUp, Plus, Rows3, Search, SearchX, User, X } from 'lucide-react';
import { api } from '@/api/client';
import { useFacets, useStudents, useVocab } from '@/hooks/api';
import { useVocabQueryParams } from '@/hooks/useVocabQueryParams';
import { useDebounced } from '@/hooks/useDebounced';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { useGlobalCombo, isTypingTarget } from '@/hooks/useHotkeys';
import { downloadText } from '@/hooks/download';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Empty, PageHeader, Spinner } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { FilterBar } from './FilterBar';
import { VocabTable } from './VocabTable';
import { ItemEditor } from './ItemEditor';
import { AddRowsDialog } from './AddRowsDialog';
import { BulkBar } from './BulkBar';

/** Vocabulary page. */
export function VocabPage() {
  const { query, update, reset, activeCount } = useVocabQueryParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { studentId: lessonStudent, setStudentId } = useCurrentStudent();
  const { data: students } = useStudents();
  const { data: facets } = useFacets();

  // Search box is local state so typing is instant; the URL/query follows after a short debounce.
  const [text, setText] = useState(query.q);
  const dText = useDebounced(text, 120);
  useEffect(() => {
    if (dText !== query.q) update({ q: dText });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dText]);
  useEffect(() => setText(query.q), [query.q]);

  // Default the student column to the "Lesson with" student once.
  const didDefault = useRef(false);
  useEffect(() => {
    if (!didDefault.current && !query.studentId && lessonStudent && !params.has('nostudent'))
      update({ studentId: lessonStudent });
    didDefault.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: rows = [], isLoading, isFetching } = useVocab(query);
  const { data: allRows = [] } = useVocab({
    ...query,
    q: '',
    cefr: [],
    topics: [],
    pos: [],
    setId: null,
    studentId: null,
    assignment: 'any',
    states: [],
    due: 'any',
    difficult: false,
    missing: [],
    includeArchived: false,
  });
  const senseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allRows.forEach((r) =>
      counts.set(r.item.english.toLowerCase(), (counts.get(r.item.english.toLowerCase()) ?? 0) + 1),
    );
    return counts;
  }, [allRows]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedItems = useMemo(() => rows.filter((r) => selected.has(r.item.id)).map((r) => r.item), [rows, selected]);
  // Selection that is filtered out stays selected but is reported so the scope is always clear.
  const hiddenSelected = selected.size - selectedItems.length;

  const editing = params.get('open');
  const openItem = (id: string | null) => {
    const nextParams = new URLSearchParams(params);
    if (id) nextParams.set('open', id);
    else nextParams.delete('open');
    setParams(nextParams, { replace: true });
  };
  const [addRows, setAddRows] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [sugIdx, setSugIdx] = useState(-1);
  const { data: suggestions = [] } = useQuery({
    queryKey: ['suggest', text],
    queryFn: () => api.suggest(text),
    enabled: suggestOpen && text.trim().length > 0,
  });

  useGlobalCombo({
    '/': (e) => {
      if (isTypingTarget(e.target)) return false;
      searchRef.current?.focus();
    },
    'mod+f': () => searchRef.current?.focus(),
    'mod+n': () => openItem('new'),
    escape: (e) => {
      if (isTypingTarget(e.target) || document.querySelector('[aria-modal="true"]') || !selected.size) return false;
      setSelected(new Set());
    },
  });

  const studentName = students?.find((s) => s.student.id === query.studentId)?.student.name ?? null;
  const resultLabel = isLoading
    ? 'Loading…'
    : `${rows.length} ${rows.length === 1 ? 'item' : 'items'}${activeCount || query.q ? ' match' : ''}`;

  const exportCsv = async () => {
    const exported = await api.exportCsv('vocabulary');
    downloadText(exported.fileName, exported.content, 'text/csv;charset=utf-8');
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={<BookOpenText />}
        title="Vocabulary bank"
        subtitle={
          <span>
            {resultLabel}
            {selected.size > 0 && (
              <span className="text-accent">
                {' '}
                · {selected.size} selected{hiddenSelected > 0 && ` (${hiddenSelected} hidden by filters)`}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {(facets?.duplicateGroups ?? 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="border-warn/50 text-warn"
                icon={<Copy className="size-3.5" />}
                onClick={() => navigate('/duplicates')}
              >
                {facets!.duplicateGroups} duplicate{facets!.duplicateGroups === 1 ? '' : 's'}
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<FileUp className="size-3.5" />}
              onClick={() => navigate('/import')}
            >
              Import
            </Button>
            <Button variant="outline" size="sm" icon={<Rows3 className="size-3.5" />} onClick={() => setAddRows(true)}>
              Add rows
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={() => openItem('new')}
              kbd="Ctrl N"
            >
              Add word
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 px-5 pt-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSuggestOpen(true);
              setSugIdx(-1);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && suggestions.length) {
                e.preventDefault();
                setSugIdx((i) => Math.min(i + 1, suggestions.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSugIdx((i) => Math.max(i - 1, -1));
              }
              if (e.key === 'Enter' && sugIdx >= 0) {
                e.preventDefault();
                openItem(suggestions[sugIdx].itemId);
                setSuggestOpen(false);
              }
              if (e.key === 'Escape') {
                if (text) setText('');
                else searchRef.current?.blur();
                setSuggestOpen(false);
              }
            }}
            placeholder='Search English, Polish, definition, example, topic, notes…  ("quotes" = exact word)'
            className="field h-10 rounded-lg pl-9 pr-24 text-[14px]"
            aria-label="Search vocabulary"
            aria-autocomplete="list"
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {isFetching && !isLoading && <Spinner className="size-3.5" />}
            {text ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setText('')}
                className="grid size-6 place-items-center rounded text-muted hover:bg-surface-3 hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            ) : (
              <span className="kbd">/</span>
            )}
          </div>
          {suggestOpen && text.trim() && suggestions.length > 0 && (
            <div
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 animate-pop overflow-hidden rounded-lg border border-line-2 bg-surface-2 p-1 shadow-pop"
              role="listbox"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.itemId}
                  type="button"
                  role="option"
                  aria-selected={i === sugIdx}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (openItem(s.itemId), setSuggestOpen(false))}
                  className={cn(
                    'flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px]',
                    i === sugIdx ? 'bg-surface-3' : 'hover:bg-surface-3',
                  )}
                >
                  <span className="font-semibold">{s.english}</span>
                  <span className="truncate text-[12px] text-muted">{s.hint}</span>
                </button>
              ))}
              <div className="border-t border-line px-2.5 pb-0.5 pt-1.5 text-[11px] text-faint">
                ↑↓ to choose · Enter opens · results below update as you type
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <User className="size-4 text-muted" />
          <Select
            aria-label="Show learning data for student"
            className="w-[200px]"
            value={query.studentId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              update({ studentId: id });
              if (id) setStudentId(id);
            }}
          >
            <option value="">All students (bank only)</option>
            {students
              ?.filter((s) => s.student.active)
              .map((s) => (
                <option key={s.student.id} value={s.student.id}>
                  {s.student.name}
                </option>
              ))}
          </Select>
        </div>
      </div>

      <FilterBar query={query} update={update} reset={reset} activeCount={activeCount} studentName={studentName} />

      {isLoading ? (
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      ) : rows.length === 0 && allRows.length === 0 && !activeCount && !query.q ? (
        <Empty
          icon={<BookOpenText />}
          title="Your vocabulary bank is empty"
          body="Add words one at a time, paste many rows from Excel, or import a CSV file."
          action={
            <div className="flex gap-2">
              <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => openItem('new')}>
                Add word
              </Button>
              <Button variant="outline" icon={<Rows3 className="size-3.5" />} onClick={() => setAddRows(true)}>
                Add rows
              </Button>
              <Button variant="outline" icon={<FileUp className="size-3.5" />} onClick={() => navigate('/import')}>
                Import CSV
              </Button>
            </div>
          }
        />
      ) : rows.length === 0 ? (
        <Empty
          icon={<SearchX />}
          title="Nothing matches"
          body={
            query.assignment === 'not_assigned'
              ? `${studentName} already has every word that matches these filters.`
              : 'Try fewer filters or a shorter search. Searching never adds words to the bank.'
          }
          action={
            (activeCount > 0 || text) && (
              <Button variant="outline" onClick={() => (setText(''), reset())}>
                Clear search and filters
              </Button>
            )
          }
        />
      ) : (
        <VocabTable
          rows={rows}
          selected={selected}
          onSelect={setSelected}
          onOpen={openItem}
          studentMode={!!query.studentId}
          senseCounts={senseCounts}
          q={query.q}
        />
      )}

      {selectedItems.length > 0 && (
        <BulkBar
          items={selectedItems}
          onClear={() => setSelected(new Set())}
          setId={query.setId}
          studentId={query.studentId}
        />
      )}

      <ItemEditor id={editing} onClose={() => openItem(null)} onOpen={openItem} />
      <AddRowsDialog open={addRows} onClose={() => setAddRows(false)} />
    </div>
  );
}
