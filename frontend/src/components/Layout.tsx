/** App frame: sidebar navigation, the "Lesson with" student picker, and the page area. */
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BookOpenText,
  Command,
  Copy,
  FileUp,
  Layers,
  Settings2,
  Sparkles,
  Users,
  Zap,
  GraduationCap,
} from 'lucide-react';
import { useStudents, useFacets } from '@/hooks/api';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { useGlobalCombo } from '@/hooks/useHotkeys';
import { cn } from './ui/cn';
import { Select } from './ui/Select';
import { CommandPalette } from './CommandPalette';

const NAV = [
  { to: '/vocab', label: 'Vocabulary', icon: BookOpenText, combo: 'G V' },
  { to: '/review', label: 'Review', icon: Zap, combo: 'G R' },
  { to: '/batch', label: 'Revision batch', icon: Sparkles, combo: 'G B' },
  { to: '/students', label: 'Students', icon: Users, combo: 'G S' },
  { to: '/sets', label: 'Sets', icon: Layers, combo: 'G E' },
  { to: '/import', label: 'Import CSV', icon: FileUp, combo: 'G I' },
  { to: '/duplicates', label: 'Duplicates', icon: Copy, combo: 'G D' },
];

/** Sidebar plus the current page. */
export function Layout() {
  const { data: students } = useStudents();
  const { data: facets } = useFacets();
  const { studentId, setStudentId } = useCurrentStudent();
  const [palette, setPalette] = useState(false);
  const navigate = useNavigate();
  useGlobalCombo({ 'mod+k': () => setPalette((v) => !v) });

  const current = students?.find((s) => s.student.id === studentId);
  const active = students?.filter((s) => s.student.active) ?? [];

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-bg-2">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <div className="relative grid size-8 place-items-center rounded-lg bg-accent text-accent-ink shadow-glow">
            <GraduationCap className="size-[18px]" strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-bold tracking-tight">Lexis</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-faint">EN · PL vocabulary</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPalette(true)}
          className="mx-3 mb-3 flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[12px] text-muted transition-colors hover:border-line-2 hover:text-fg-2"
        >
          <Command className="size-3.5" />
          <span className="flex-1 truncate text-left">Search…</span>
          <span className="kbd">Ctrl K</span>
        </button>

        <div className="mx-3 mb-3 rounded-lg border border-line bg-surface p-2.5">
          <label className="label" htmlFor="lesson-student">
            Lesson with
          </label>
          <Select id="lesson-student" value={studentId ?? ''} onChange={(e) => setStudentId(e.target.value || null)}>
            <option value="">No student selected</option>
            {active.map((s) => (
              <option key={s.student.id} value={s.student.id}>
                {s.student.name}
              </option>
            ))}
          </Select>
          {current && (
            <div className="mt-2 grid grid-cols-3 gap-1 text-center">
              {[
                ['Due', current.dueToday, 'var(--color-accent)'],
                ['Overdue', current.overdue, 'var(--color-r-again)'],
                ['New', current.counts.new, 'var(--color-st-new)'],
              ].map(([label, n, c]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() =>
                    navigate(
                      `/review?student=${current.student.id}&source=${label === 'Due' ? 'due' : label === 'Overdue' ? 'overdue' : 'new'}`,
                    )
                  }
                  className="rounded-md bg-bg-2 py-1 transition-colors hover:bg-surface-3"
                  title={`Start review: ${label}`}
                >
                  <div
                    className="font-display text-[15px] font-semibold tabular-nums"
                    style={{ color: Number(n) ? (c as string) : undefined }}
                  >
                    {n}
                  </div>
                  <div className="text-[10px] text-muted">{label}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                  isActive ? 'bg-surface-3 text-fg' : 'text-fg-2 hover:bg-surface hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" />}
                  <Icon className={cn('size-4', isActive ? 'text-accent' : 'text-muted group-hover:text-fg-2')} />
                  <span className="flex-1">{label}</span>
                  {to === '/vocab' && facets && (
                    <span className="text-[11px] tabular-nums text-faint">{facets.totalItems}</span>
                  )}
                  {to === '/duplicates' && facets && facets.duplicateGroups > 0 && (
                    <span className="rounded bg-warn/15 px-1.5 text-[11px] font-semibold tabular-nums text-warn">
                      {facets.duplicateGroups}
                    </span>
                  )}
                  {to === '/review' && current && current.dueToday > 0 && (
                    <span className="rounded bg-accent-soft px-1.5 text-[11px] font-semibold tabular-nums text-accent">
                      {current.dueToday}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-2 pb-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium',
                isActive ? 'bg-surface-3 text-fg' : 'text-fg-2 hover:bg-surface hover:text-fg',
              )
            }
          >
            <Settings2 className="size-4 text-muted" /> Settings
          </NavLink>
          <div className="mt-2 flex items-center gap-1.5 px-2.5 text-[11px] text-faint">
            <span className="size-1.5 rounded-full bg-ok shadow-[0_0_6px_var(--color-ok)]" />
            Local only · 127.0.0.1
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
