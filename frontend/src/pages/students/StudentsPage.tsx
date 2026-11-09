/** All students with their progress; add or edit a student. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, UserRound, Users, Zap } from 'lucide-react';
import { api } from '@/api/client';
import type { LearningState, StudentSummary } from '@/api/types';
import { useApiMutation, useStudents } from '@/hooks/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Overlay';
import { Empty, PageHeader, Spinner } from '@/components/ui/misc';
import { STATE_META } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { relative } from '@/lib/dates';

/** Bar showing the share of words in each learning state. */
export function StateBar({ s, className }: { s: StudentSummary; className?: string }) {
  const total = Math.max(1, s.total);
  return (
    <div className={cn('flex h-1.5 overflow-hidden rounded-full bg-line', className)}>
      {(Object.keys(STATE_META) as LearningState[]).map((k) => (
        <div
          key={k}
          style={{ width: `${(s.counts[k] / total) * 100}%`, background: STATE_META[k].color }}
          title={`${STATE_META[k].label}: ${s.counts[k]}`}
        />
      ))}
    </div>
  );
}

/** Letters for a student's avatar. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Students page. */
export function StudentsPage() {
  const { data: students, isLoading } = useStudents();
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const navigate = useNavigate();
  const list = (students ?? []).filter((s) => showInactive || s.student.active);
  const inactive = (students ?? []).filter((s) => !s.student.active).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={<Users />}
        title="Students"
        subtitle="Each student has their own FSRS schedule for every assigned word."
        actions={
          <>
            {inactive > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowInactive((v) => !v)}>
                {showInactive ? 'Hide' : 'Show'} {inactive} inactive
              </Button>
            )}
            <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
              Add student
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <Spinner />
        ) : !list.length ? (
          <Empty
            icon={<UserRound />}
            title="No students yet"
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add your first student
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {list.map((s) => (
              <Link
                key={s.student.id}
                to={`/students/${s.student.id}`}
                className={cn(
                  'group panel block p-4 transition-all hover:-translate-y-0.5 hover:border-line-2 hover:bg-surface-2',
                  !s.student.active && 'opacity-55',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-surface-3 to-line-2 font-display text-[14px] font-bold text-fg-2 ring-1 ring-line-2">
                    {initials(s.student.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate font-display text-[15px] font-semibold">
                      {s.student.name}
                      {!s.student.active && (
                        <span className="rounded bg-surface-3 px-1.5 text-[10px] font-medium text-muted">inactive</span>
                      )}
                    </div>
                    <div className="truncate text-[12px] text-muted">
                      {s.student.notes || `${s.total} words assigned`}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                </div>
                <StateBar s={s} className="mt-4" />
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {[
                    ['Words', s.total, undefined],
                    ['Due today', s.dueToday, s.dueToday ? 'var(--color-accent)' : undefined],
                    ['Overdue', s.overdue, s.overdue ? 'var(--color-r-again)' : undefined],
                    ['Difficult', s.difficult, s.difficult ? 'var(--color-r-hard)' : undefined],
                  ].map(([l, v, c]) => (
                    <div key={l as string}>
                      <div
                        className="font-display text-[18px] font-semibold tabular-nums"
                        style={{ color: c as string | undefined }}
                      >
                        {v}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[11px] text-muted">
                  <span>Last review {s.lastReviewedAt ? relative(s.lastReviewedAt) : 'never'}</span>
                  {s.dueToday > 0 && s.student.active && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/review?student=${s.student.id}&source=due`);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 font-semibold text-accent hover:bg-accent/20"
                    >
                      <Zap className="size-3" /> Review {s.dueToday}
                    </button>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <StudentDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/** Add or edit a student. */
export function StudentDialog({
  open,
  onClose,
  student,
}: {
  open: boolean;
  onClose: () => void;
  student?: { id: string; name: string; notes: string | null };
}) {
  const [name, setName] = useState(student?.name ?? '');
  const [notes, setNotes] = useState(student?.notes ?? '');
  const toast = useToast();
  const save = useApiMutation(() =>
    student ? api.updateStudent(student.id, { name, notes: notes || null }) : api.createStudent(name, notes || null),
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={student ? 'Edit student' : 'Add student'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            loading={save.isPending}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: () => {
                  toast({ tone: 'success', title: student ? 'Saved' : `${name} added` });
                  if (!student) {
                    setName('');
                    setNotes('');
                  }
                  onClose();
                },
              })
            }
          >
            {student ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div>
          <label className="label" htmlFor="st-name">
            Name
          </label>
          <input
            id="st-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && save.mutate(undefined, { onSuccess: onClose })}
          />
        </div>
        <div>
          <label className="label" htmlFor="st-notes">
            Notes
          </label>
          <textarea
            id="st-notes"
            rows={2}
            className="field"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Level, goals, exam date…"
          />
        </div>
      </div>
    </Dialog>
  );
}
