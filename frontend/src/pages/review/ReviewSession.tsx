/** The live review: show a card, reveal the answer, rate it, move on. Keyboard first. */
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Keyboard, LogOut, RotateCcw, Trophy } from 'lucide-react';
import { api } from '@/api/client';
import { RATING_LABEL, type QueueEntry, type QueueRequest, type Rating } from '@/api/types';
import { useInvalidateAll, useQueue, useSettings } from '@/hooks/api';
import { useHotkeys } from '@/hooks/useHotkeys';
import { Button } from '@/components/ui/Button';
import { CefrBadge, RATING_COLOR, RatingBadge, StateBadge, TopicChip } from '@/components/ui/Badge';
import { Empty, keyLabel, Spinner } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { formatDateTime, relative, shortInterval } from '@/lib/dates';
import { uid } from '@/lib/id';

interface Outcome {
  rating: Rating;
  nextDue: string;
}

/** A field the teacher can show or hide on the word card. */
export type Panel = 'polish' | 'definition' | 'example';

/** Every field: how a review starts, so nothing is hidden until the teacher hides it. */
export const ALL_PANELS: ReadonlySet<Panel> = new Set<Panel>(['polish', 'definition', 'example']);

/** One running review session. */
export function ReviewSession({
  request,
  studentName,
  shown,
  onShownChange,
  onExit,
  onRestart,
}: {
  request: QueueRequest;
  studentName: string;
  /** Visible fields. They stay as the teacher set them from word to word until the review is closed. */
  shown: ReadonlySet<Panel>;
  onShownChange: (shown: ReadonlySet<Panel>) => void;
  onExit: () => void;
  onRestart: (itemIds: string[]) => void;
}) {
  const { data: queue, isLoading } = useQueue(request);
  const { data: settings } = useSettings();
  const invalidate = useInvalidateAll();
  const toast = useToast();

  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  // One request id per card in this session → pressing twice can never create two reviews.
  const requestIds = useRef(new Map<string, string>());
  const inFlight = useRef(false);

  const entry: QueueEntry | undefined = queue?.[index];
  const { data: preview } = useQuery({
    queryKey: ['preview', entry?.card.id, entry?.card.fsrs.reps],
    queryFn: () => api.previewRatings(entry!.card.id),
    enabled: !!entry && !outcomes[entry.card.id],
  });

  const goTo = (i: number) => {
    if (!queue) return;
    if (i >= queue.length) return setDone(true);
    setIndex(Math.max(0, i));
  };

  const rate = async (rating: Rating) => {
    if (!entry || outcomes[entry.card.id] || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    const cardId = entry.card.id;
    if (!requestIds.current.has(cardId)) requestIds.current.set(cardId, uid('r'));
    try {
      const res = await api.rate(cardId, rating, requestIds.current.get(cardId)!);
      setOutcomes((o) => ({
        ...o,
        [cardId]: { rating: (res.log.rating ?? rating) as Rating, nextDue: res.log.nextDue },
      }));
      goTo(index + 1);
    } catch (current) {
      toast({ tone: 'error', title: 'Rating not saved', body: (current as Error).message });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const toggle = (p: Panel) => {
    const next = new Set(shown);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onShownChange(next);
  };
  const toggleAll = () => onShownChange(shown.size === ALL_PANELS.size ? new Set() : ALL_PANELS);

  const keys = settings?.shortcuts;
  useHotkeys(
    keys
      ? [
          { key: keys.again, handler: () => rate(1) },
          { key: keys.hard, handler: () => rate(2) },
          { key: keys.good, handler: () => rate(3) },
          { key: keys.easy, handler: () => rate(4) },
          { key: keys.next, handler: () => goTo(index + 1) },
          { key: keys.previous, handler: () => goTo(index - 1) },
          { key: keys.reveal, handler: toggleAll },
          { key: keys.revealPolish, handler: () => toggle('polish') },
          { key: keys.revealDefinition, handler: () => toggle('definition') },
          { key: keys.revealExample, handler: () => toggle('example') },
        ]
      : [],
    !done,
  );

  const exit = () => {
    invalidate();
    onExit();
  };

  const tally = useMemo(() => {
    const tally = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Rating, number>;
    Object.values(outcomes).forEach((o) => tally[o.rating]++);
    return tally;
  }, [outcomes]);

  if (isLoading || !queue)
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    );
  if (!queue.length)
    return (
      <Empty
        icon={<CheckCircle2 />}
        title="Nothing to review"
        body="No words match this selection right now."
        action={<Button onClick={exit}>Back</Button>}
      />
    );

  const rated = Object.keys(outcomes).length;

  if (done) {
    const again = queue.filter((q) => outcomes[q.card.id]?.rating === 1);
    return (
      <div className="grid-bg grid flex-1 place-items-center p-6">
        <div className="panel w-[520px] max-w-full animate-pop p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-glow">
            <Trophy className="size-7" />
          </div>
          <h2 className="mt-4 font-display text-[22px] font-bold">Session complete</h2>
          <p className="mt-1 text-[13px] text-muted">
            {studentName} · {rated} of {queue.length} words rated · schedules saved
          </p>
          <div className="mt-6 grid grid-cols-4 gap-2">
            {([1, 2, 3, 4] as Rating[]).map((r) => (
              <div key={r} className="rounded-lg border border-line bg-bg-2 py-3">
                <div className="font-display text-[24px] font-semibold tabular-nums" style={{ color: RATING_COLOR[r] }}>
                  {tally[r]}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-muted">{RATING_LABEL[r]}</div>
              </div>
            ))}
          </div>
          <div className="mt-7 flex justify-center gap-2">
            <Button variant="ghost" onClick={() => (setDone(false), setIndex(queue.length - 1))}>
              Back to last word
            </Button>
            {again.length > 0 && (
              <Button
                variant="outline"
                icon={<RotateCcw className="size-3.5" />}
                onClick={() => (invalidate(), onRestart(again.map((a) => a.item.id)))}
              >
                Go over {again.length} “Again” word{again.length === 1 ? '' : 's'}
              </Button>
            )}
            <Button variant="primary" onClick={exit}>
              Finish
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const current = entry!;
  const outcome = outcomes[current.card.id];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <div className="flex h-14 items-center gap-4 border-b border-line px-5">
        <Button variant="ghost" size="sm" icon={<LogOut className="size-3.5" />} onClick={exit}>
          End
        </Button>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{studentName}</div>
          <div className="text-[11px] text-muted">
            {rated} rated · {queue.length - rated} left
          </div>
        </div>
        <div className="flex flex-1 items-center gap-[3px]" aria-label={`Word ${index + 1} of ${queue.length}`}>
          {queue.map((q, i) => {
            const outcome = outcomes[q.card.id];
            return (
              <button
                key={q.card.id}
                type="button"
                aria-label={`Go to word ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn('h-1.5 flex-1 rounded-full transition-all', i === index && 'h-2.5 ring-2 ring-fg/40')}
                style={{
                  background: outcome
                    ? RATING_COLOR[outcome.rating]
                    : i === index
                      ? 'var(--color-fg-2)'
                      : 'var(--color-line-2)',
                  maxWidth: 40,
                }}
              />
            );
          })}
        </div>
        <div className="font-mono text-[12px] tabular-nums text-muted">
          {index + 1}/{queue.length}
        </div>
      </div>

      <div className="grid-bg flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <div key={current.card.id} className="w-full max-w-[760px] animate-pop">
          {/* Word card */}
          <div className="relative overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-pop">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
            <div className="flex items-center gap-2 px-6 pt-5 text-[12px]">
              <StateBadge state={current.card.learningState} />
              <CefrBadge cefr={current.item.cefr} />
              {current.item.partOfSpeech && <span className="italic text-muted">{current.item.partOfSpeech}</span>}
              <span className="flex gap-1">
                {current.item.topics.map((t) => (
                  <TopicChip key={t} name={t} />
                ))}
              </span>
              <span className="ml-auto flex items-center gap-3 text-muted">
                <span title={formatDateTime(current.card.fsrs.lastReview)}>
                  Last: <RatingBadge rating={current.lastRating} />{' '}
                  {current.card.fsrs.lastReview ? relative(current.card.fsrs.lastReview) : 'never'}
                </span>
                <span title={formatDateTime(current.card.fsrs.due)}>Due {relative(current.card.fsrs.due)}</span>
              </span>
            </div>

            <div className="px-6 pb-7 pt-8 text-center">
              <div className="font-display text-[52px] font-bold leading-none tracking-tight text-fg">
                {current.item.english}
              </div>
            </div>

            <div className="grid grid-cols-3 border-t border-line">
              {(
                [
                  ['polish', 'Polish', current.item.polish.join(', '), keys?.revealPolish],
                  ['definition', 'Definition', current.item.definition, keys?.revealDefinition],
                  ['example', 'Example', current.item.example, keys?.revealExample],
                ] as [Panel, string, string | null, string | undefined][]
              ).map(([p, label, value, key], i) => {
                const open = shown.has(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggle(p)}
                    aria-expanded={open}
                    className={cn(
                      'group min-h-[104px] p-4 text-left transition-colors hover:bg-surface-2',
                      i > 0 && 'border-l border-line',
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {open ? <EyeOff className="size-3" /> : <Eye className="size-3" />} {label}
                      {key && <span className="kbd ml-auto">{keyLabel(key)}</span>}
                    </div>
                    {!value ? (
                      <div className="text-[13px] italic text-faint">not provided</div>
                    ) : open ? (
                      <div
                        className={cn(
                          'animate-in',
                          p === 'polish' ? 'text-[18px] font-semibold text-fg' : 'text-[14px] leading-snug text-fg-2',
                        )}
                      >
                        {value}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1 pt-1" aria-label="hidden">
                        {value
                          .split(' ')
                          .slice(0, 8)
                          .map((w, j) => (
                            <span
                              key={j}
                              className="h-3 rounded-sm bg-line-2/70"
                              style={{ width: Math.min(80, 8 + w.length * 6) }}
                            />
                          ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ratings */}
          <div className="mt-5">
            {outcome ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 py-4 text-[13px]">
                <CheckCircle2 className="size-4 text-accent" />
                Rated <RatingBadge rating={outcome.rating} /> · next review {relative(outcome.nextDue)}
                <span className="text-faint">({formatDateTime(outcome.nextDue)})</span>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2.5">
                {([1, 2, 3, 4] as Rating[]).map((r) => {
                  const key = keys ? [keys.again, keys.hard, keys.good, keys.easy][r - 1] : String(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      disabled={pending}
                      onClick={() => rate(r)}
                      className="group relative overflow-hidden rounded-xl border border-line-2 bg-surface py-3.5 transition-all hover:-translate-y-0.5 hover:bg-surface-2 active:translate-y-0 disabled:opacity-50"
                      style={{ ['--c' as string]: RATING_COLOR[r] }}
                    >
                      <span className="absolute inset-x-0 top-0 h-[3px] bg-[var(--c)] opacity-70 transition-opacity group-hover:opacity-100" />
                      <div className="text-[15px] font-semibold" style={{ color: RATING_COLOR[r] }}>
                        {RATING_LABEL[r]}
                      </div>
                      <div className="mt-0.5 font-mono text-[12px] text-muted">
                        {preview ? shortInterval(new Date().toISOString(), preview[r]) : '…'}
                      </div>
                      <span className="kbd absolute right-2 top-2">{keyLabel(key)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowLeft className="size-3.5" />}
                disabled={index === 0}
                onClick={() => goTo(index - 1)}
                kbd={keys && keyLabel(keys.previous)}
              >
                Previous
              </Button>
              <div className="flex items-center gap-1.5 text-[11px] text-faint">
                <Keyboard className="size-3.5" /> {keys && keyLabel(keys.reveal)} shows / hides all · shortcuts are off
                while typing
              </div>
              <Button variant="ghost" size="sm" onClick={() => goTo(index + 1)} kbd={keys && keyLabel(keys.next)}>
                {outcome ? 'Next' : 'Skip'} <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
