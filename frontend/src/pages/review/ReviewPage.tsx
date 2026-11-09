/** Review setup: choose the student, the words and the options, then start a session. */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlarmClock,
  Flame,
  Layers,
  ListChecks,
  MousePointerClick,
  Play,
  Shuffle,
  Sparkle,
  Users,
  Zap,
  BookCheck,
} from 'lucide-react';
import { CEFR_LEVELS, type Cefr, type QueueRequest, type QueueSource } from '@/api/types';
import { useFacets, useSets, useStudentCards, useStudents } from '@/hooks/api';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { PageHeader } from '@/components/ui/misc';
import { MultiPicker } from '@/components/MultiPicker';
import { cn } from '@/components/ui/cn';
import { matchesDue } from '@/lib/dates';
import { ALL_PANELS, ReviewSession, type Panel } from './ReviewSession';

const SOURCES: { value: QueueSource; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'due', label: 'Due today', icon: <Zap />, hint: 'Everything due before tonight, overdue first' },
  { value: 'overdue', label: 'Overdue', icon: <AlarmClock />, hint: 'Should have been reviewed before today' },
  { value: 'new', label: 'New', icon: <Sparkle />, hint: 'Assigned but never reviewed' },
  { value: 'learning', label: 'Learning & review', icon: <BookCheck />, hint: 'Already started, any due date' },
  { value: 'difficult', label: 'Difficult', icon: <Flame />, hint: 'Many lapses or high FSRS difficulty' },
  { value: 'all', label: 'All assigned', icon: <ListChecks />, hint: 'Every active word for this student' },
  { value: 'set', label: 'A saved set', icon: <Layers />, hint: 'Only words from one set' },
  {
    value: 'selection',
    label: 'My selection',
    icon: <MousePointerClick />,
    hint: 'Words selected in the vocabulary table',
  },
];

function readSelection(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem('lexis.selection') ?? '[]');
  } catch {
    return [];
  }
}

/** Review setup page, or the running session. */
export function ReviewPage() {
  const [params, setParams] = useSearchParams();
  const { studentId: lesson, setStudentId: setLesson } = useCurrentStudent();
  const { data: students } = useStudents();
  const { data: sets } = useSets();
  const { data: facets } = useFacets();

  const [studentId, setStudentId] = useState(params.get('student') ?? lesson ?? '');
  const [source, setSource] = useState<QueueSource>((params.get('source') as QueueSource) ?? 'due');
  const [setId, setSetId] = useState(params.get('set') ?? '');
  const [cefr, setCefr] = useState<Cefr[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [limit, setLimit] = useState<'10' | '20' | '30' | 'all'>('20');
  const [shuffle, setShuffle] = useState(false);
  const [selection] = useState(readSelection);
  const [session, setSession] = useState<QueueRequest | null>(null);
  const [shownPanels, setShownPanels] = useState<ReadonlySet<Panel>>(ALL_PANELS);

  const { data: cards = [] } = useStudentCards(studentId || undefined);
  const counts = useMemo(() => {
    const now = new Date();
    const setItems = new Set(sets?.find((s) => s.id === setId)?.itemIds ?? []);
    const sel = new Set(selection);
    const pass = (c: (typeof cards)[number]) =>
      (!cefr.length || (c.item.cefr && cefr.includes(c.item.cefr))) &&
      (!topics.length || c.item.topics.some((t) => topics.includes(t))) &&
      !c.item.archived;
    const filtered = cards.filter(pass);
    return {
      due: filtered.filter((c) => matchesDue('due_today', c.card.fsrs.due, now)).length,
      overdue: filtered.filter((c) => matchesDue('overdue', c.card.fsrs.due, now)).length,
      new: filtered.filter((c) => c.card.learningState === 'new').length,
      learning: filtered.filter((c) => c.card.learningState !== 'new').length,
      difficult: filtered.filter((c) => c.card.difficult).length,
      all: filtered.length,
      set: setId ? filtered.filter((c) => setItems.has(c.item.id)).length : 0,
      selection: filtered.filter((c) => sel.has(c.item.id)).length,
    } as Record<QueueSource, number>;
  }, [cards, sets, setId, selection, cefr, topics]);

  const start = (src = source) => {
    if (!studentId) return;
    setLesson(studentId);
    setSession({
      studentId,
      source: src,
      setId: src === 'set' ? setId : null,
      itemIds: src === 'selection' ? selection : undefined,
      cefr,
      topics,
      limit: limit === 'all' ? undefined : Number(limit),
      shuffle,
    });
  };

  // Deep links from the sidebar / student page start straight away.
  useEffect(() => {
    if (params.get('student') && params.get('source') && params.get('go') !== '0') {
      start((params.get('source') as QueueSource) ?? 'due');
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeSession = () => {
    setSession(null);
    setShownPanels(ALL_PANELS);
  };

  if (session) {
    const name = students?.find((s) => s.student.id === session.studentId)?.student.name ?? '';
    return (
      <ReviewSession
        key={JSON.stringify(session)}
        request={session}
        studentName={name}
        shown={shownPanels}
        onShownChange={setShownPanels}
        onExit={closeSession}
        onRestart={(itemIds) =>
          setSession({ ...session, source: 'selection', itemIds, setId: null, limit: undefined, cefr: [], topics: [] })
        }
      />
    );
  }

  const student = students?.find((s) => s.student.id === studentId);
  const count = counts[source] ?? 0;
  const willReview = limit === 'all' ? count : Math.min(count, Number(limit));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={<Zap />}
        title="Review"
        subtitle="Teacher-led review with FSRS scheduling. The student never touches the app."
      />
      <div className="grid-bg min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] px-6 py-8">
          <div className="panel p-5">
            <div className="grid gap-5 md:grid-cols-[1fr_auto]">
              <div>
                <label className="label" htmlFor="rv-st">
                  Student
                </label>
                <Select
                  id="rv-st"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="max-w-[340px]"
                >
                  <option value="">Choose a student…</option>
                  {students
                    ?.filter((s) => s.student.active)
                    .map((s) => (
                      <option key={s.student.id} value={s.student.id}>
                        {s.student.name}
                      </option>
                    ))}
                </Select>
              </div>
              {student && (
                <div className="flex gap-4 text-right">
                  {[
                    ['Assigned', student.total],
                    ['Due today', student.dueToday],
                    ['Overdue', student.overdue],
                  ].map(([l, v]) => (
                    <div key={l as string}>
                      <div className="font-display text-[20px] font-semibold tabular-nums">{v}</div>
                      <div className="text-[11px] uppercase tracking-wider text-muted">{l}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6">
              <span className="label">What to review</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SOURCES.map((s) => {
                  const count = counts[s.value];
                  const disabled = !studentId || (s.value === 'selection' && !selection.length);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      disabled={disabled}
                      aria-pressed={source === s.value}
                      title={s.hint}
                      onClick={() => setSource(s.value)}
                      onDoubleClick={() => (setSource(s.value), start(s.value))}
                      className={cn(
                        'group relative flex flex-col items-start rounded-lg border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40',
                        source === s.value
                          ? 'border-accent/60 bg-accent-soft shadow-glow'
                          : 'border-line bg-bg-2 hover:border-line-2 hover:bg-surface-2',
                      )}
                    >
                      <span className={cn('[&>svg]:size-4', source === s.value ? 'text-accent' : 'text-muted')}>
                        {s.icon}
                      </span>
                      <span className="mt-2 text-[13px] font-semibold">{s.label}</span>
                      <span className="font-display text-[20px] font-semibold tabular-nums text-fg-2">
                        {studentId ? count : '–'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {source === 'set' && (
                <Select
                  aria-label="Set"
                  value={setId}
                  onChange={(e) => setSetId(e.target.value)}
                  className="mt-2 max-w-[340px]"
                >
                  <option value="">Choose a set…</option>
                  {sets?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <span className="label">Narrow down (optional)</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex rounded-md border border-line bg-surface p-0.5">
                    {CEFR_LEVELS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={cefr.includes(c)}
                        onClick={() => setCefr((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]))}
                        className={cn(
                          'h-6 w-8 rounded font-mono text-[11px] font-semibold',
                          cefr.includes(c) ? 'bg-accent text-accent-ink' : 'text-muted hover:text-fg',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <MultiPicker
                    label="Topic"
                    value={topics}
                    onChange={setTopics}
                    options={(facets?.topics ?? []).map((t) => ({ value: t.name, label: t.name }))}
                  />
                </div>
              </div>
              <div>
                <span className="label">How many</span>
                <Segmented
                  size="sm"
                  value={limit}
                  onChange={setLimit}
                  options={[
                    { value: '10', label: '10' },
                    { value: '20', label: '20' },
                    { value: '30', label: '30' },
                    { value: 'all', label: 'All' },
                  ]}
                />
              </div>
              <div>
                <span className="label">Order</span>
                <Segmented
                  size="sm"
                  value={shuffle ? 'shuffle' : 'due'}
                  onChange={(v) => setShuffle(v === 'shuffle')}
                  options={[
                    { value: 'due', label: 'Most urgent first' },
                    {
                      value: 'shuffle',
                      label: (
                        <span className="inline-flex items-center gap-1">
                          <Shuffle className="size-3" />
                          Shuffled
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            </div>

            <div className="mt-7 flex items-center justify-between border-t border-line pt-5">
              <div className="text-[12px] text-muted">
                {!studentId ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    Choose a student to begin
                  </span>
                ) : willReview ? (
                  <>
                    <span className="font-semibold text-fg">{willReview}</span> word{willReview === 1 ? '' : 's'} for{' '}
                    {student?.student.name}
                    {cefr.length + topics.length > 0 && ` · ${[...cefr, ...topics].join(' + ')}`}
                  </>
                ) : (
                  'No words match — try another source.'
                )}
              </div>
              <Button
                size="lg"
                variant="primary"
                icon={<Play className="size-4" />}
                disabled={!studentId || !willReview || (source === 'set' && !setId)}
                onClick={() => start()}
              >
                Start review
              </Button>
            </div>
          </div>
          <p className="mt-4 text-center text-[11px] text-faint">
            Tip: double-click a source to start immediately. Ratings use stock FSRS: Again 1 · Hard 2 · Good 3 · Easy 4.
          </p>
        </div>
      </div>
    </div>
  );
}
