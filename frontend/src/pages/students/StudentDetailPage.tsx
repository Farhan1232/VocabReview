/** One student: learning stats, assigned words, recent activity and per-word history. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Flame,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Sparkles,
  Timer,
  UserMinus,
  Zap,
} from 'lucide-react';
import { api } from '@/api/client';
import type { LearningState, StudentCardRow } from '@/api/types';
import { useApiMutation, useHistory, useStudent, useStudentCards } from '@/hooks/api';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { Button, IconButton } from '@/components/ui/Button';
import { CefrBadge, RatingBadge, STATE_META, StateBadge } from '@/components/ui/Badge';
import { Drawer, MenuItem, MenuSep, Popover } from '@/components/ui/Overlay';
import { Empty, Spinner, Stat } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/Segmented';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { dueBucket, formatDateTime, relative } from '@/lib/dates';
import { StateBar, StudentDialog, initials } from './StudentsPage';

type View = 'due' | 'all' | LearningState | 'difficult';

/** One student's page. */
export function StudentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { setStudentId } = useCurrentStudent();
  const { data: s } = useStudent(id);
  const { data: rows = [], isLoading } = useStudentCards(id);
  const { data: recent = [] } = useHistory(id);
  const [view, setView] = useState<View>('due');
  const [historyFor, setHistoryFor] = useState<StudentCardRow | null>(null);
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const toggleActive = useApiMutation(() => api.updateStudent(id, { active: !s!.student.active }));

  const filtered = useMemo(() => {
    const now = new Date();
    return rows.filter((r) => {
      if (view === 'all') return true;
      if (view === 'due')
        return dueBucket(r.card.fsrs.due, now) === 'overdue' || dueBucket(r.card.fsrs.due, now) === 'today';
      if (view === 'difficult') return r.card.difficult;
      return r.card.learningState === view;
    });
  }, [rows, view]);

  if (!s)
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    );
  const student = s.student;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line px-5 pb-4 pt-3">
        <Link to="/students" className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">
          <ArrowLeft className="size-3.5" /> Students
        </Link>
        <div className="mt-2 flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-accent/30 to-surface-3 font-display text-[17px] font-bold ring-1 ring-accent/40">
            {initials(student.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 font-display text-[20px] font-bold tracking-tight">
              {student.name}
              {!student.active && (
                <span className="rounded bg-surface-3 px-1.5 text-[11px] font-medium text-muted">inactive</span>
              )}
            </h1>
            <div className="text-[12px] text-muted">
              {student.notes || 'No notes'} · last review {s.lastReviewedAt ? relative(s.lastReviewedAt) : 'never'}
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Power className="size-3.5" />}
            onClick={async () => {
              if (
                student.active &&
                !(await confirm({
                  title: `Deactivate ${student.name}?`,
                  body: 'They will be hidden from student pickers. All words, schedules and history are kept; you can reactivate at any time.',
                  confirmLabel: 'Deactivate',
                }))
              )
                return;
              toggleActive.mutate(undefined, {
                onSuccess: () => toast({ tone: 'success', title: student.active ? 'Deactivated' : 'Reactivated' }),
              });
            }}
          >
            {student.active ? 'Deactivate' : 'Reactivate'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Plus className="size-3.5" />}
            onClick={() => (setStudentId(id), navigate(`/vocab?student=${id}&assigned=not_assigned`))}
          >
            Assign words
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Sparkles className="size-3.5" />}
            onClick={() => navigate(`/batch?student=${id}&source=due`)}
          >
            Batch
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Zap className="size-3.5" />}
            disabled={!s.dueToday}
            onClick={() => navigate(`/review?student=${id}&source=due`)}
          >
            Review {s.dueToday || ''} due
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-3 px-5 pt-4 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
          <Stat label="Assigned" value={s.total} onClick={() => setView('all')} />
          <Stat label="Due today" value={s.dueToday} tone="var(--color-accent)" onClick={() => setView('due')} />
          <Stat
            label="Overdue"
            value={s.overdue}
            tone="var(--color-r-again)"
            onClick={() => setView('due')}
            hint="Included in Due today"
          />
          {(Object.keys(STATE_META) as LearningState[]).map((k) => (
            <Stat
              key={k}
              label={STATE_META[k].label}
              value={s.counts[k]}
              tone={STATE_META[k].color}
              onClick={() => setView(k)}
            />
          ))}
          <Stat label="Difficult" value={s.difficult} tone="var(--color-r-hard)" onClick={() => setView('difficult')} />
        </div>
        <div className="px-5 pt-3">
          <StateBar s={s} className="h-2" />
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
            <CalendarClock className="size-3.5" />
            Next upcoming review {s.nextDueAt ? `${relative(s.nextDueAt)} (${formatDateTime(s.nextDueAt)})` : '—'}
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[1fr_340px]">
          <section className="panel min-w-0 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">Words</h2>
              <Segmented
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: 'due', label: `Due (${s.dueToday})` },
                  { value: 'all', label: 'All' },
                  { value: 'new', label: 'New' },
                  { value: 'learning', label: 'Learning' },
                  { value: 'review', label: 'Review' },
                  { value: 'mastered', label: 'Mastered' },
                  { value: 'difficult', label: 'Difficult' },
                ]}
              />
              <span className="ml-auto text-[12px] text-muted">{filtered.length}</span>
            </div>
            {isLoading ? (
              <div className="p-6">
                <Spinner />
              </div>
            ) : !filtered.length ? (
              <Empty
                title={view === 'due' ? 'Nothing due — all caught up' : 'No words here'}
                body={!rows.length ? 'Assign words from the vocabulary bank.' : undefined}
              />
            ) : (
              <div className="max-h-[560px] overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-bg-2/95 text-[11px] uppercase tracking-wider text-muted backdrop-blur">
                    <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                      <th>English</th>
                      <th>Polish</th>
                      <th>CEFR</th>
                      <th>State</th>
                      <th>Last</th>
                      <th>Next review</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <CardRow key={r.card.id} row={r} onHistory={() => setHistoryFor(r)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <History className="size-4 text-muted" />
              <h2 className="text-[13px] font-semibold">Recent activity</h2>
            </div>
            <ul className="max-h-[560px] divide-y divide-line/60 overflow-y-auto">
              {recent.slice(0, 40).map((l) => (
                <li key={l.id} className="flex items-center gap-2 px-4 py-2 text-[12px]">
                  {l.kind === 'review' ? (
                    <RatingBadge rating={l.rating} />
                  ) : (
                    <span className="rounded bg-warn/15 px-1.5 text-[11px] font-medium text-warn">
                      {l.kind === 'reset' ? 'Reset' : 'Override'}
                    </span>
                  )}
                  <span className="truncate font-medium">{l.english}</span>
                  <span className="ml-auto shrink-0 text-faint" title={formatDateTime(l.reviewedAt)}>
                    {relative(l.reviewedAt)}
                  </span>
                </li>
              ))}
              {!recent.length && <li className="px-4 py-6 text-center text-[12px] text-muted">No reviews yet</li>}
            </ul>
          </section>
        </div>
      </div>

      <HistoryDrawer row={historyFor} studentId={id} onClose={() => setHistoryFor(null)} />
      {editing && <StudentDialog open onClose={() => setEditing(false)} student={student} />}
    </div>
  );
}

function CardRow({ row, onHistory }: { row: StudentCardRow; onHistory: () => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const reset = useApiMutation((mode: 'new' | 'due_now') => api.resetCard(row.card.id, mode, null));
  const unassign = useApiMutation(() => api.unassign([row.card.id]));
  const bucket = dueBucket(row.card.fsrs.due);
  return (
    <tr className="border-t border-line/60 hover:bg-surface-2 [&>td]:px-3 [&>td]:py-1.5">
      <td className="font-semibold">
        <span className="inline-flex items-center gap-1.5">
          {row.item.english}
          {row.card.difficult && <Flame className="size-3.5 text-r-again" aria-label="Difficult" />}
        </span>
      </td>
      <td className="max-w-[220px] truncate text-fg-2">
        {row.item.polish.join(', ') || <span className="text-faint">—</span>}
      </td>
      <td>
        <CefrBadge cefr={row.item.cefr} />
      </td>
      <td>
        <StateBadge state={row.card.learningState} />
      </td>
      <td>
        <RatingBadge rating={row.lastRating} />
      </td>
      <td
        className={cn(
          'tabular-nums',
          bucket === 'overdue' ? 'text-r-again' : bucket === 'today' ? 'text-accent' : 'text-muted',
        )}
        title={formatDateTime(row.card.fsrs.due)}
      >
        {row.card.fsrs.reps === 0 ? <span className="text-st-new">new</span> : relative(row.card.fsrs.due)}
      </td>
      <td>
        <IconButton
          ref={setAnchor}
          label="Actions"
          size="xs"
          icon={<MoreHorizontal className="size-3.5" />}
          onClick={() => setOpen((v) => !v)}
        />
        <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end">
          <MenuItem icon={<History />} onClick={() => (setOpen(false), onHistory())}>
            Review history
          </MenuItem>
          <MenuSep />
          <MenuItem
            icon={<Timer />}
            onClick={() => (
              setOpen(false),
              reset.mutate('due_now', {
                onSuccess: () =>
                  toast({ tone: 'success', title: 'Made due now', body: 'Logged as a manual override, not a review.' }),
              })
            )}
          >
            Make due now
          </MenuItem>
          <MenuItem
            icon={<RotateCcw />}
            onClick={async () => {
              setOpen(false);
              if (
                await confirm({
                  title: `Reset “${row.item.english}” to New?`,
                  body: 'The FSRS memory state for this student starts over. Past reviews stay in the history, and the reset is logged as a manual reset.',
                  confirmLabel: 'Reset',
                  danger: true,
                })
              )
                reset.mutate('new', { onSuccess: () => toast({ tone: 'success', title: 'Reset to New' }) });
            }}
          >
            Reset to New…
          </MenuItem>
          <MenuSep />
          <MenuItem
            danger
            icon={<UserMinus />}
            onClick={async () => {
              setOpen(false);
              if (
                await confirm({
                  title: `Unassign “${row.item.english}”?`,
                  body: 'The word leaves this student’s list. Its schedule and history are archived, not deleted — assigning it again restores them. The word stays in the bank.',
                  confirmLabel: 'Unassign',
                })
              )
                unassign.mutate(undefined, {
                  onSuccess: () => toast({ tone: 'success', title: 'Unassigned', body: 'History kept.' }),
                });
            }}
          >
            Unassign…
          </MenuItem>
        </Popover>
      </td>
    </tr>
  );
}

function HistoryDrawer({
  row,
  studentId,
  onClose,
}: {
  row: StudentCardRow | null;
  studentId: string;
  onClose: () => void;
}) {
  const { data: logs = [], isLoading } = useHistory(row ? studentId : undefined, row?.item.id);
  const STATE_NAME = ['New', 'Learning', 'Review', 'Relearning'];
  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      width={520}
      title={row ? `History · ${row.item.english}` : ''}
      subtitle={
        row && (
          <span>
            {row.item.polish.join(', ')} · {row.item.definition}
          </span>
        )
      }
    >
      {row && (
        <div className="mb-4 grid grid-cols-4 gap-2">
          <Stat label="Reviews" value={row.card.fsrs.reps} />
          <Stat label="Lapses" value={row.card.fsrs.lapses} />
          <Stat label="Stability" value={`${row.card.fsrs.stability.toFixed(1)}d`} hint="FSRS stability in days" />
          <Stat label="Difficulty" value={row.card.fsrs.difficulty.toFixed(1)} hint="FSRS difficulty 1–10" />
        </div>
      )}
      {isLoading ? (
        <Spinner />
      ) : !logs.length ? (
        <Empty title="Not reviewed yet" />
      ) : (
        <ol className="relative ml-2 border-l border-line-2">
          {logs.map((l) => (
            <li key={l.id} className="relative pb-4 pl-5">
              <span
                className={cn(
                  'absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-surface',
                  l.kind === 'review' ? 'bg-fg-2' : 'bg-warn',
                )}
              />
              <div className="flex items-center gap-2 text-[12px]">
                {l.kind === 'review' ? (
                  <RatingBadge rating={l.rating} />
                ) : (
                  <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[11px] font-semibold text-warn">
                    Manual {l.kind}
                  </span>
                )}
                <span className="text-fg-2">{formatDateTime(l.reviewedAt)}</span>
              </div>
              <div className="mt-1 text-[12px] text-muted">
                {STATE_NAME[l.previousState]} → {STATE_NAME[l.nextState]} · due{' '}
                {l.previousDue ? formatDateTime(l.previousDue) : '—'} →{' '}
                <span className="text-fg-2">{formatDateTime(l.nextDue)}</span>
              </div>
              {l.note && <div className="mt-0.5 text-[12px] italic text-faint">{l.note}</div>}
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}
