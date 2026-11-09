/**
 * Duplicate words. backend/app/services/duplicates.py implements the same rule for the real app.
 *
 * Two words are the same word when their English matches (ignoring case, accents and extra spaces)
 * and their part of speech matches, or one of them has no part of speech. SUIT (noun) and SUIT (verb)
 * are different words; a second ALTER (verb) is a duplicate even with a differently worded definition.
 * A real second meaning (BANK: money / river) matches too, so the teacher can keep it on purpose.
 */
import type { DuplicateCheck, DuplicateGroup, DuplicateMatch, VocabItem } from '@/api/types';
import { normalize } from './search';

/** The parts of a word the duplicate rule looks at. */
export interface WordKey {
  english: string;
  partOfSpeech: string | null;
}

const pos = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** True when two words count as the same word. */
export function sameWord(a: WordKey, b: WordKey): boolean {
  if (normalize(a.english) !== normalize(b.english)) return false;
  const pa = pos(a.partOfSpeech);
  const pb = pos(b.partOfSpeech);
  return !pa || !pb || pa === pb;
}

/** For each row, the index of the first earlier row that is the same word, or null. Rows with no English are never repeats. */
export function findRepeats(rows: WordKey[]): (number | null)[] {
  const seen = new Map<string, number[]>();
  return rows.map((row, index) => {
    const english = normalize(row.english);
    if (!english) return null;
    const earlier = seen.get(english) ?? [];
    const repeatOf = earlier.find((i) => sameWord(rows[i], row)) ?? null;
    seen.set(english, [...earlier, index]);
    return repeatOf;
  });
}

/** The short description of an existing word shown next to a duplicate row. */
export function toMatch(item: VocabItem): DuplicateMatch {
  const { id, english, partOfSpeech, cefr, polish, definition } = item;
  return { id, english, partOfSpeech, cefr, polish, definition };
}

/** Check new rows against the bank and against each other (demo mode; the real server does this itself). */
export function checkRows(rows: WordKey[], existing: VocabItem[]): DuplicateCheck[] {
  const active = existing.filter((item) => !item.archived);
  const repeats = findRepeats(rows);
  return rows.map((row, index) => ({
    index,
    repeatOf: repeats[index],
    matches: normalize(row.english) ? active.filter((item) => sameWord(item, row)).map(toMatch) : [],
  }));
}

const CEFR_ORDER: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

const filled = (item: VocabItem) =>
  [item.polish.length, item.definition, item.partOfSpeech, item.cefr, item.example, item.topics.length].filter(Boolean)
    .length;

/** Usage numbers for one word, used to pick which copy to keep. */
export interface WordUsage {
  students: number;
  reviews: number;
  sets: number;
}

/**
 * Groups of active words that are the same word, leaving out groups the teacher marked as different meanings.
 * In each group the suggested copy to keep comes first: learning history, then the most complete, then the oldest.
 */
export function duplicateGroups(
  items: VocabItem[],
  dismissed: string[][],
  usage: (id: string) => WordUsage = () => ({ students: 0, reviews: 0, sets: 0 }),
): DuplicateGroup[] {
  const gone = dismissed.map((ids) => new Set(ids));
  const byEnglish = new Map<string, VocabItem[]>();
  for (const item of items) {
    if (item.archived) continue;
    const key = normalize(item.english);
    byEnglish.set(key, [...(byEnglish.get(key) ?? []), item]);
  }
  const groups: VocabItem[][] = [];
  for (const same of byEnglish.values()) {
    if (same.length < 2) continue;
    // A word with no part of speech links words of different parts of speech, so join groups transitively.
    const parent = same.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < same.length; i++)
      for (let j = i + 1; j < same.length; j++) if (sameWord(same[i], same[j])) parent[root(j)] = root(i);
    const joined = new Map<number, VocabItem[]>();
    same.forEach((item, i) => joined.set(root(i), [...(joined.get(root(i)) ?? []), item]));
    for (const group of joined.values()) {
      if (group.length > 1 && !gone.some((set) => group.every((item) => set.has(item.id)))) groups.push(group);
    }
  }
  return groups
    .map((group) => {
      const rows = group.map((item) => ({ item, ...usage(item.id) }));
      rows.sort(
        (a, b) =>
          b.reviews - a.reviews ||
          b.students - a.students ||
          b.sets - a.sets ||
          filled(b.item) - filled(a.item) ||
          a.item.createdAt.localeCompare(b.item.createdAt) ||
          (CEFR_ORDER[a.item.cefr ?? ''] ?? 9) - (CEFR_ORDER[b.item.cefr ?? ''] ?? 9) ||
          a.item.id.localeCompare(b.item.id),
      );
      return { english: rows[0].item.english, keepId: rows[0].item.id, items: rows };
    })
    .sort(
      (a, b) =>
        a.english.toLowerCase().localeCompare(b.english.toLowerCase()) ||
        pos(a.items[0].item.partOfSpeech).localeCompare(pos(b.items[0].item.partOfSpeech)),
    );
}
