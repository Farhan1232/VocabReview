/** Filter controls above the vocabulary table. */
import { AlertCircle, Archive, Flame, RotateCcw, Tag, Shapes, Layers, Activity, CalendarClock } from 'lucide-react';
import { CEFR_LEVELS, type DueFilter, type LearningState, type MissingField, type VocabQuery } from '@/api/types';
import { useFacets, useSets } from '@/hooks/api';
import { FilterPill, MultiPicker } from '@/components/MultiPicker';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/components/ui/cn';
import { STATE_META } from '@/components/ui/Badge';

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_today', label: 'Due today' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'not_due', label: 'Not due' },
];

const MISSING: { value: MissingField; label: string }[] = [
  { value: 'polish', label: 'Polish translation' },
  { value: 'definition', label: 'Definition' },
  { value: 'example', label: 'Example' },
  { value: 'cefr', label: 'CEFR level' },
  { value: 'topic', label: 'Topic' },
];

/** The filter row. */
export function FilterBar({
  query,
  update,
  reset,
  activeCount,
  studentName,
}: {
  query: VocabQuery;
  update: (p: Partial<VocabQuery>) => void;
  reset: () => void;
  activeCount: number;
  studentName: string | null;
}) {
  const { data: facets } = useFacets();
  const { data: sets } = useSets();
  const hasStudent = !!query.studentId;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-2">
      <div
        className="flex items-center rounded-md border border-line bg-surface p-0.5"
        role="group"
        aria-label="CEFR level"
      >
        {CEFR_LEVELS.map((c) => {
          const on = query.cefr.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => update({ cefr: on ? query.cefr.filter((x) => x !== c) : [...query.cefr, c] })}
              className={cn(
                'h-6 w-8 rounded font-mono text-[11px] font-semibold transition-colors',
                on ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-surface-3 hover:text-fg',
              )}
            >
              {c}
            </button>
          );
        })}
      </div>

      <MultiPicker
        label="Topic"
        icon={<Tag />}
        value={query.topics}
        onChange={(topics) => update({ topics })}
        options={(facets?.topics ?? []).map((t) => ({ value: t.name, label: t.name, count: t.count }))}
      />
      <MultiPicker
        label="Part of speech"
        icon={<Shapes />}
        value={query.pos}
        onChange={(pos) => update({ pos })}
        options={(facets?.pos ?? []).map((t) => ({ value: t.name, label: t.name, count: t.count }))}
      />
      <MultiPicker
        label="Set"
        icon={<Layers />}
        searchable={false}
        value={query.setId ? [query.setId] : []}
        onChange={(v) => update({ setId: v[v.length - 1] ?? null })}
        options={(sets ?? []).map((s) => ({ value: s.id, label: s.name, count: s.itemIds.length }))}
      />
      <MultiPicker
        label="Missing"
        icon={<AlertCircle />}
        searchable={false}
        value={query.missing}
        onChange={(v) => update({ missing: v as MissingField[] })}
        options={MISSING}
      />

      {hasStudent && (
        <>
          <span className="mx-1 h-5 w-px bg-line" />
          <Segmented
            size="sm"
            ariaLabel={`Assignment for ${studentName}`}
            value={query.assignment}
            onChange={(assignment) => update({ assignment })}
            options={[
              { value: 'any', label: 'All' },
              { value: 'assigned', label: 'Assigned' },
              { value: 'not_assigned', label: 'Not assigned' },
            ]}
          />
          <MultiPicker
            label="State"
            icon={<Activity />}
            searchable={false}
            value={query.states}
            onChange={(v) => update({ states: v as LearningState[] })}
            options={(Object.keys(STATE_META) as LearningState[]).map((s) => ({
              value: s,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ background: STATE_META[s].color }} />
                  {STATE_META[s].label}
                </span>
              ),
            }))}
          />
          <MultiPicker
            label="Due"
            icon={<CalendarClock />}
            searchable={false}
            value={query.due === 'any' ? [] : [query.due]}
            onChange={(v) => update({ due: (v[v.length - 1] as DueFilter) ?? 'any' })}
            options={DUE_OPTIONS}
          />
          <FilterPill
            active={query.difficult}
            onClick={() => update({ difficult: !query.difficult })}
            icon={<Flame />}
            title="Many lapses or high FSRS difficulty"
          >
            Difficult
          </FilterPill>
        </>
      )}

      <FilterPill
        active={query.includeArchived}
        onClick={() => update({ includeArchived: !query.includeArchived })}
        icon={<Archive />}
      >
        Archived
      </FilterPill>

      {activeCount > 0 && (
        <button
          type="button"
          onClick={reset}
          className="ml-1 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted hover:bg-surface hover:text-fg"
        >
          <RotateCcw className="size-3.5" /> Reset {activeCount}
        </button>
      )}
    </div>
  );
}
