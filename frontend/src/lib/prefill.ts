/**
 * Letter prefill for revision batches (client request, 31 Oct).
 *
 *   Easy       → about 70 % shown          b a _ k
 *   Medium     → about 45 % shown          b _ _ k
 *   Hard       → about 25 % shown          _ _ n _
 *   Very hard  → nothing shown            _ _ _ _
 *
 * Rules
 *  - Only letters are hidden. Spaces, hyphens, apostrophes and digits always stay visible,
 *    so "look after" and "mother-in-law" keep their shape.
 *  - Easy and Medium always show the first letter of every word.
 *  - Except on Very hard, at least one letter of every word stays visible when the word has
 *    3+ letters, and at least one letter is always hidden (otherwise it is not an exercise).
 *  - The choice of letters is seeded, so the same batch gives the same blanks until the teacher
 *    presses "New blanks".
 */
import { hashString, seededRandom } from './random';

/** All difficulty levels, easiest first. */
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard'] as const;
/** How many letters are prefilled. */
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Names shown on the buttons. */
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  very_hard: 'Very hard',
};

const REVEAL_RATIO: Record<Difficulty, number> = { easy: 0.7, medium: 0.45, hard: 0.25, very_hard: 0 };

/** `spaced` is "b _ n k", `compact` is "b_nk". */
export type BlankStyle = 'spaced' | 'compact';

/** Options for prefill(). */
export interface PrefillOptions {
  difficulty: Difficulty;
  seed: number;
  style?: BlankStyle;
  blank?: string;
}

const LETTER = /\p{L}/u;

/** Returns, for each character, whether it is shown. Non-letters are always shown. */
export function revealMask(text: string, difficulty: Difficulty, seed: number): boolean[] {
  const chars = Array.from(text);
  const mask = chars.map((c) => !LETTER.test(c));
  if (difficulty === 'very_hard') return mask;

  // Split into words: runs of letters (apostrophes/hyphens break words but stay visible).
  const words: number[][] = [];
  let current: number[] = [];
  chars.forEach((c, i) => {
    if (LETTER.test(c)) current.push(i);
    else if (current.length) {
      words.push(current);
      current = [];
    }
  });
  if (current.length) words.push(current);

  const rnd = seededRandom(seed ^ hashString(text));
  const keepFirst = difficulty === 'easy' || difficulty === 'medium';

  for (const word of words) {
    const letters = word.length;
    if (letters === 1) {
      mask[word[0]] = keepFirst;
      continue;
    }
    let reveal = Math.round(letters * REVEAL_RATIO[difficulty]);
    if (keepFirst) reveal = Math.max(reveal, 1);
    if (letters >= 3) reveal = Math.max(reveal, 1);
    reveal = Math.min(reveal, letters - 1);

    const chosen = new Set<number>();
    if (keepFirst) chosen.add(0);
    const pool = word.map((_, k) => k).filter((k) => !chosen.has(k));
    while (chosen.size < reveal && pool.length) {
      const pick = Math.floor(rnd() * pool.length);
      chosen.add(pool.splice(pick, 1)[0]);
    }
    chosen.forEach((k) => (mask[word[k]] = true));
  }
  return mask;
}

/** "bank" → "b _ n k" (spaced) or "b_nk" (compact). Words are separated by three spaces when spaced. */
export function prefill(text: string, opts: PrefillOptions): string {
  const { difficulty, seed, style = 'spaced', blank = '_' } = opts;
  const chars = Array.from(text.trim());
  const mask = revealMask(chars.join(''), difficulty, seed);
  const shown = chars.map((c, i) => (mask[i] ? c : blank));
  if (style === 'compact') return shown.join('');
  const words: string[] = [];
  let current: string[] = [];
  chars.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (current.length) words.push(current.join(' '));
      current = [];
    } else current.push(shown[i]);
  });
  if (current.length) words.push(current.join(' '));
  return words.join('   ');
}

/** How many letters are hidden in this text. */
export function countHidden(text: string, difficulty: Difficulty, seed: number): number {
  return revealMask(text, difficulty, seed).filter((v) => !v).length;
}
