/** Left column of the Revision batch page: the four setup steps (student, scramble, difficulty, display). */
import type { ReactNode } from 'react';
import { Dices, Shuffle, Undo2 } from 'lucide-react';
import type { QueueSource, StudentSummary, VocabSet } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/components/ui/cn';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import type { BatchFormatOptions, BatchHint, BatchShow } from '@/lib/batchFormat';
import { DIFFICULTIES, DIFFICULTY_LABEL, prefill, type BlankStyle, type Difficulty } from '@/lib/prefill';

/** How many words the batch holds. */
export type BatchLimit = '10' | '15' | '20' | 'all';

const SOURCE_LABEL: Record<QueueSource, string> = {
  due: 'Due today',
  overdue: 'Overdue',
  new: 'New',
  learning: 'Learning & review',
  difficult: 'Difficult',
  all: 'All assigned',
  set: 'A saved set',
  selection: 'My selection',
};

const DIFFICULTY_META: Record<Difficulty, { tone: string; hint: string }> = {
  easy: { tone: 'var(--color-st-mastered)', hint: 'Most letters filled in' },
  medium: { tone: 'var(--color-r-good)', hint: 'About half filled in' },
  hard: { tone: 'var(--color-r-hard)', hint: 'A few letters filled in' },
  very_hard: { tone: 'var(--color-r-again)', hint: 'No letters — only blanks' },
};

const LIMIT_OPTIONS: { value: BatchLimit; label: string }[] = [
  { value: '10', label: '10' },
  { value: '15', label: '15' },
  { value: '20', label: '20' },
  { value: 'all', label: 'All' },
];

interface BatchControlsProps {
  students: StudentSummary[] | undefined;
  studentId: string;
  onStudentChange: (id: string) => void;
  source: QueueSource;
  onSourceChange: (source: QueueSource) => void;
  /** Number of words the teacher selected in the bank; zero disables the "My selection" source. */
  selectionCount: number;
  sets: VocabSet[] | undefined;
  setId: string;
  onSetChange: (id: string) => void;
  limit: BatchLimit;
  onLimitChange: (limit: BatchLimit) => void;
  /** One line saying how many words are in the batch. */
  summary: string;
  canScramble: boolean;
  onScramble: () => void;
  onNewBlanks: () => void;
  onOriginalOrder: () => void;
  /** Word shown on the difficulty buttons as a live example. */
  sampleWord: string;
  options: BatchFormatOptions;
  onOptionsChange: (patch: Partial<BatchFormatOptions>) => void;
}

/** The four setup steps. */
export function BatchControls({
  students,
  studentId,
  onStudentChange,
  source,
  onSourceChange,
  selectionCount,
  sets,
  setId,
  onSetChange,
  limit,
  onLimitChange,
  summary,
  canScramble,
  onScramble,
  onNewBlanks,
  onOriginalOrder,
  sampleWord,
  options,
  onOptionsChange,
}: BatchControlsProps) {
  return (
    <div className="min-h-0 overflow-y-auto border-r border-line bg-bg-2/40 px-5 py-5">
      <Step number={1} title="Open a batch for a student">
        <Select aria-label="Student" value={studentId} onChange={(e) => onStudentChange(e.target.value)}>
          <option value="">Choose a student…</option>
          {students
            ?.filter((s) => s.student.active)
            .map((s) => (
              <option key={s.student.id} value={s.student.id}>
                {s.student.name}
              </option>
            ))}
        </Select>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Select
            aria-label="Words from"
            value={source}
            onChange={(e) => onSourceChange(e.target.value as QueueSource)}
          >
            {(Object.keys(SOURCE_LABEL) as QueueSource[]).map((s) => (
              <option key={s} value={s} disabled={s === 'selection' && !selectionCount}>
                {SOURCE_LABEL[s]}
                {s === 'selection' ? ` (${selectionCount})` : ''}
              </option>
            ))}
          </Select>
          {source === 'set' ? (
            <Select aria-label="Set" value={setId} onChange={(e) => onSetChange(e.target.value)}>
              <option value="">Choose a set…</option>
              {sets?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : (
            <Segmented size="sm" className="w-full" value={limit} onChange={onLimitChange} options={LIMIT_OPTIONS} />
          )}
        </div>
        {source === 'set' && (
          <Segmented size="sm" className="mt-2 w-full" value={limit} onChange={onLimitChange} options={LIMIT_OPTIONS} />
        )}
        <div className="mt-2 text-[12px] text-muted">{summary}</div>
      </Step>

      <Step number={2} title="Scramble the order">
        <Button
          size="lg"
          variant="secondary"
          className="w-full"
          icon={<Shuffle className="size-4" />}
          onClick={onScramble}
          disabled={!canScramble}
          kbd="Ctrl ⇧ S"
        >
          Scramble
        </Button>
        <div className="mt-1.5 flex justify-between text-[11px] text-faint">
          <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={onNewBlanks}>
            <Dices className="size-3" /> New blanks, same order
          </button>
          <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={onOriginalOrder}>
            <Undo2 className="size-3" /> Original order
          </button>
        </div>
      </Step>

      <Step number={3} title="Choose the difficulty">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((difficulty) => {
            const selected = options.difficulty === difficulty;
            const { tone, hint } = DIFFICULTY_META[difficulty];
            return (
              <button
                key={difficulty}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onOptionsChange({ difficulty })}
                className={cn(
                  'relative overflow-hidden rounded-lg border p-2.5 text-left transition-all',
                  selected ? 'border-transparent bg-surface-3' : 'border-line bg-surface hover:border-line-2',
                )}
                style={selected ? { boxShadow: `0 0 0 1.5px ${tone}, 0 0 20px -6px ${tone}` } : undefined}
              >
                <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <span className="size-2 rounded-full" style={{ background: tone }} />
                  {DIFFICULTY_LABEL[difficulty]}
                </div>
                <div className="mt-1 truncate font-mono text-[12px] text-fg-2">
                  {prefill(sampleWord, { difficulty, seed: options.seed, style: options.style })}
                </div>
                <div className="mt-0.5 text-[10px] text-faint">{hint}</div>
              </button>
            );
          })}
        </div>
        {options.show === 'polish' && (
          <p className="mt-2 text-[11px] text-warn/90">
            “Only Polish” shows no English letters, so difficulty has no effect.
          </p>
        )}
      </Step>

      <Step number={4} title="What the student sees">
        <Segmented<BatchShow>
          className="w-full"
          value={options.show}
          onChange={(show) => onOptionsChange({ show })}
          options={[
            { value: 'polish', label: 'Only Polish' },
            { value: 'english', label: 'Only English' },
            { value: 'both', label: 'Both' },
          ]}
        />
        <div className="mt-2.5 flex items-center gap-2 text-[12px] text-muted">
          <span>Polish side uses</span>
          <Segmented<BatchHint>
            size="sm"
            value={options.hint}
            onChange={(hint) => onOptionsChange({ hint })}
            options={[
              { value: 'polish', label: 'Polish' },
              { value: 'definition', label: 'Definition' },
              { value: 'both', label: 'Polish + definition' },
            ]}
          />
        </div>
        <div className="mt-3 grid gap-2 text-[12px] text-fg-2">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={options.numbered} onChange={(numbered) => onOptionsChange({ numbered })} /> Number the
            lines (1. 2. 3.)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={options.showLength} onChange={(showLength) => onOptionsChange({ showLength })} /> Show
            letter count, e.g. (4)
          </label>
          <div className="flex items-center gap-2">
            <span>Blanks</span>
            <Segmented<BlankStyle>
              size="sm"
              value={options.style}
              onChange={(style) => onOptionsChange({ style })}
              options={[
                { value: 'spaced', label: 'b _ n k', hint: 'Spaced — easiest to read in chat' },
                { value: 'compact', label: 'b_nk', hint: 'Compact' },
              ]}
            />
          </div>
        </div>
      </Step>
    </div>
  );
}

/** A numbered heading with its controls. */
function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-fg-2">
        <span className="grid size-5 place-items-center rounded-full border border-line-2 bg-surface font-mono text-[10px] text-accent">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}
