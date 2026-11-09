/**
 * Thin wrapper around the maintained ts-fsrs library (stock FSRS, default parameters plus the
 * library's own retention target from Settings).
 *
 * The real scheduler lives in the backend (py-fsrs). This wrapper is used by the mock API so the
 * frontend shows real FSRS behaviour before the backend exists. The algorithm is never modified:
 * we only translate between the library's Card and our serialisable FsrsCard.
 */
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs';
import type { FsrsCard, FsrsState, LearningState, Rating, Settings } from '@/api/types';

const schedulers = new Map<number, ReturnType<typeof fsrs>>();

function schedulerFor(retention: number) {
  let scheduler = schedulers.get(retention);
  if (!scheduler) {
    scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: retention }));
    schedulers.set(retention, scheduler);
  }
  return scheduler;
}

function toLib(card: FsrsCard): Card {
  const raw = card.raw as Partial<Record<keyof Card, unknown>>;
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: Number(raw.scheduled_days ?? 0),
    learning_steps: Number(raw.learning_steps ?? 0),
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  };
}

function fromLib(card: Card): FsrsCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as FsrsState,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
    raw: { scheduled_days: card.scheduled_days, learning_steps: card.learning_steps },
  };
}

/** FSRS data of a card that has never been reviewed. */
export function newFsrsCard(now = new Date()): FsrsCard {
  return fromLib(createEmptyCard(now));
}

/** Apply a rating and return the new FSRS data. */
export function rate(card: FsrsCard, rating: Rating, retention: number, now = new Date()): FsrsCard {
  return fromLib(schedulerFor(retention).next(toLib(card), now, rating as Grade).card);
}

/** Next due date for each of the four ratings, shown on the review buttons. */
export function previewRatings(card: FsrsCard, retention: number, now = new Date()): Record<Rating, string> {
  const out = {} as Record<Rating, string>;
  for (const r of [1, 2, 3, 4] as Rating[]) out[r] = rate(card, r, retention, now).due;
  return out;
}

/** Label shown to the teacher for this FSRS data. */
export function learningStateOf(card: FsrsCard, settings: Pick<Settings, 'masteredStabilityDays'>): LearningState {
  if (card.reps === 0 || card.state === 0) return 'new';
  if (card.state === 1 || card.state === 3) return 'learning';
  return card.stability >= settings.masteredStabilityDays ? 'mastered' : 'review';
}

/** True if the card passes the Settings thresholds for lapses or difficulty. */
export function isDifficult(
  card: FsrsCard,
  settings: Pick<Settings, 'difficultLapses' | 'difficultDifficulty'>,
): boolean {
  if (card.reps === 0) return false;
  return card.lapses >= settings.difficultLapses || card.difficulty >= settings.difficultDifficulty;
}
