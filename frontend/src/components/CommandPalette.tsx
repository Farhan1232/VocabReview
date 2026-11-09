/** Ctrl+K palette: jump to any page, student, set or word from the keyboard. */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenText,
  CornerDownLeft,
  Copy,
  FileUp,
  Layers,
  Search,
  Settings2,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useSets, useStudents } from '@/hooks/api';
import { useDebounced } from '@/hooks/useDebounced';
import { cn } from './ui/cn';

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/** The palette dialog. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();
  const debouncedQuery = useDebounced(query, 80);
  const { data: students } = useStudents();
  const { data: sets } = useSets();
  const { data: words } = useQuery({
    queryKey: ['suggest', debouncedQuery],
    queryFn: () => api.suggest(debouncedQuery),
    enabled: open && debouncedQuery.length > 0,
  });

  useEffect(() => {
    if (open) {
      setQuery('');
      setIdx(0);
    }
  }, [open]);

  const goTo = (to: string) => () => {
    navigate(to);
    onClose();
  };

  const cmds = useMemo<Cmd[]>(() => {
    const needle = query.trim().toLowerCase();
    const pages: Cmd[] = [
      { id: 'p-vocab', group: 'Go to', label: 'Vocabulary bank', icon: <BookOpenText />, run: goTo('/vocab') },
      { id: 'p-review', group: 'Go to', label: 'Start a review', icon: <Zap />, run: goTo('/review') },
      {
        id: 'p-batch',
        group: 'Go to',
        label: 'Revision batch (copy to Zoom)',
        icon: <Sparkles />,
        run: goTo('/batch'),
      },
      { id: 'p-students', group: 'Go to', label: 'Students', icon: <User />, run: goTo('/students') },
      { id: 'p-sets', group: 'Go to', label: 'Sets', icon: <Layers />, run: goTo('/sets') },
      { id: 'p-import', group: 'Go to', label: 'Import CSV', icon: <FileUp />, run: goTo('/import') },
      { id: 'p-duplicates', group: 'Go to', label: 'Duplicates', icon: <Copy />, run: goTo('/duplicates') },
      {
        id: 'p-settings',
        group: 'Go to',
        label: 'Settings, shortcuts & backup',
        icon: <Settings2 />,
        run: goTo('/settings'),
      },
    ].filter((c) => !needle || c.label.toLowerCase().includes(needle));
    const studentCommands: Cmd[] = (students ?? [])
      .filter((x) => !needle || x.student.name.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((x) => ({
        id: `s-${x.student.id}`,
        group: 'Students',
        label: x.student.name,
        hint: `${x.dueToday} due · ${x.total} words`,
        icon: <User />,
        run: goTo(`/students/${x.student.id}`),
      }));
    const setCommands: Cmd[] = (sets ?? [])
      .filter((x) => needle && x.name.toLowerCase().includes(needle))
      .slice(0, 4)
      .map((x) => ({
        id: `set-${x.id}`,
        group: 'Sets',
        label: x.name,
        hint: `${x.itemIds.length} words`,
        icon: <Layers />,
        run: goTo(`/vocab?set=${x.id}`),
      }));
    const wordCommands: Cmd[] = (query ? (words ?? []) : []).map((x) => ({
      id: `w-${x.itemId}`,
      group: 'Vocabulary',
      label: x.english,
      hint: x.hint,
      icon: <Search />,
      run: goTo(`/vocab?q=${encodeURIComponent(`"${x.english}"`)}&open=${x.itemId}`),
    }));
    return [...wordCommands, ...studentCommands, ...setCommands, ...pages];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, students, sets, words]);

  useEffect(() => setIdx(0), [query]);

  if (!open) return null;
  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 animate-in bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-[600px] max-w-[calc(100%-2rem)] animate-pop overflow-hidden rounded-xl border border-line-2 bg-surface shadow-pop"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, cmds.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter') cmds[idx]?.run();
            }}
            placeholder="Find a word, student, set or page…"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {cmds.length === 0 && <div className="px-3 py-8 text-center text-[12px] text-muted">No matches</div>}
          {cmds.map((c, i) => {
            const header = c.group !== lastGroup ? ((lastGroup = c.group), true) : false;
            return (
              <div key={c.id}>
                {header && (
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                    {c.group}
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setIdx(i)}
                  onClick={c.run}
                  className={cn(
                    'flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px]',
                    i === idx ? 'bg-surface-3 text-fg' : 'text-fg-2',
                  )}
                >
                  <span className={cn('[&>svg]:size-4', i === idx ? 'text-accent' : 'text-muted')}>{c.icon}</span>
                  <span className="truncate font-medium">{c.label}</span>
                  {c.hint && <span className="truncate text-[12px] text-muted">{c.hint}</span>}
                  <span className="ml-auto">
                    {i === idx ? (
                      <CornerDownLeft className="size-3.5 text-muted" />
                    ) : (
                      <ArrowRight className="size-3.5 text-transparent" />
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
