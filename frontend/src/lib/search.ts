/**
 * Search and filter rules. The UI uses normalize and parseQuery for text matching on screen (such as highlighting);
 * the search itself runs here only in mock mode. backend/app/services/vocab.py and text.py implement the same rules for the real app.
 *
 *  - Text search looks in English, Polish, definition, example, topics and notes.
 *  - Wrapping the query in quotes ("bank") means exact English match.
 *  - Results are ranked: exact English > English prefix > English contains > other fields.
 *  - All filters combine with AND; values inside one filter (e.g. A1, A2) combine with OR.
 *  - Searching never creates or changes records.
 */
import type { LearningState, Settings, StudentCard, VocabItem, VocabQuery, VocabRow } from '@/api/types';
import { matchesDue } from './dates';
import { isDifficult, learningStateOf } from './fsrs';

/** Lower-case text with accents removed, so that "skladnik" finds "składnik". */
export function normalize(s: string): string {
  return s.toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();
}

/** How well an item matches: its score and the fields that matched. */
export interface TextMatch {
  score: number;
  fields: string[];
}

/** The normalized search text, and whether it was quoted (exact match). */
export function parseQuery(q: string): { text: string; exact: boolean } {
  const trimmed = q.trim();
  const match = /^"(.*)"$/.exec(trimmed);
  return match ? { text: normalize(match[1]), exact: true } : { text: normalize(trimmed), exact: false };
}

/** Score an item against a search, or null if it does not match. */
export function matchText(item: VocabItem, q: string): TextMatch | null {
  const { text, exact } = parseQuery(q);
  if (!text) return { score: 0, fields: [] };
  const english = normalize(item.english);
  if (exact) return english === text ? { score: 1000, fields: ['english'] } : null;

  const fields: string[] = [];
  let score = 0;
  if (english === text) score = 1000;
  else if (english.startsWith(text)) score = 600 - Math.min(english.length, 100);
  else if (english.includes(text)) score = 400;
  if (score) fields.push('english');

  const other: [string, string | null][] = [
    ['polish', item.polish.join(' | ')],
    ['definition', item.definition],
    ['example', item.example],
    ['topics', item.topics.join(' | ')],
    ['notes', item.notes],
  ];
  for (const [name, value] of other) {
    if (!value) continue;
    const normalizedValue = normalize(value);
    if (normalizedValue.includes(text)) {
      fields.push(name);
      score = Math.max(score, name === 'polish' ? (normalizedValue.split(' | ').includes(text) ? 500 : 300) : 100);
    }
  }
  return fields.length ? { score, fields } : null;
}

/** A card with its display label and difficulty flag worked out. */
export type CardWithState = StudentCard & { learningState: LearningState; difficult: boolean };

/** Work out a card's display label and difficulty flag. */
export function decorateCard(card: StudentCard, settings: Settings): CardWithState {
  return { ...card, learningState: learningStateOf(card.fsrs, settings), difficult: isDifficult(card.fsrs, settings) };
}

/** Data a search needs besides the query. */
export interface SearchContext {
  items: VocabItem[];
  /** Active cards of the selected student, by item id. */
  cardsByItem: Map<string, StudentCard>;
  setItemIds: Set<string> | null;
  settings: Settings;
  now?: Date;
}

/** Apply all filters and the text search (demo mode; the real server does this itself). */
export function searchVocab(query: VocabQuery, ctx: SearchContext): VocabRow[] {
  const now = ctx.now ?? new Date();
  const studentFilters =
    query.assignment === 'assigned' || query.states.length > 0 || query.due !== 'any' || query.difficult;
  const rows: (VocabRow & { score: number })[] = [];

  for (const item of ctx.items) {
    if (item.archived && !query.includeArchived) continue;
    if (query.cefr.length && (!item.cefr || !query.cefr.includes(item.cefr))) continue;
    if (query.topics.length && !item.topics.some((t) => query.topics.includes(t))) continue;
    if (query.pos.length && (!item.partOfSpeech || !query.pos.includes(item.partOfSpeech))) continue;
    if (ctx.setItemIds && !ctx.setItemIds.has(item.id)) continue;
    if (query.missing.length) {
      const missing = query.missing.every((f) => {
        switch (f) {
          case 'polish':
            return item.polish.length === 0;
          case 'definition':
            return !item.definition;
          case 'example':
            return !item.example;
          case 'cefr':
            return !item.cefr;
          case 'topic':
            return item.topics.length === 0;
        }
      });
      if (!missing) continue;
    }

    let card: CardWithState | null = null;
    if (query.studentId) {
      const raw = ctx.cardsByItem.get(item.id);
      card = raw ? decorateCard(raw, ctx.settings) : null;
      if (query.assignment === 'not_assigned' && card) continue;
      if (studentFilters) {
        if (!card) continue;
        if (query.states.length && !query.states.includes(card.learningState)) continue;
        if (!matchesDue(query.due, card.fsrs.due, now, ctx.settings.dueSoonDays)) continue;
        if (query.difficult && !card.difficult) continue;
      }
    }

    const match = matchText(item, query.q);
    if (!match) continue;
    rows.push({ item, card, matched: match.fields, score: match.score });
  }

  const hasText = !!parseQuery(query.q).text;
  rows.sort((a, b) =>
    hasText && b.score !== a.score
      ? b.score - a.score
      : a.item.english.localeCompare(b.item.english, 'en', { sensitivity: 'base' }),
  );
  return rows.map(({ score: _score, ...r }) => r);
}

/** The best few matches for the search box. */
export function suggest(items: VocabItem[], q: string, limit = 8) {
  const { text } = parseQuery(q);
  if (!text) return [];
  return items
    .filter((i) => !i.archived)
    .map((i) => ({ i, m: matchText(i, q) }))
    .filter((x): x is { i: VocabItem; m: TextMatch } => !!x.m && x.m.score > 0)
    .sort((a, b) => b.m.score - a.m.score || a.i.english.localeCompare(b.i.english))
    .slice(0, limit)
    .map(({ i }) => ({
      itemId: i.id,
      english: i.english,
      hint: [i.partOfSpeech, i.polish.join(', ') || i.definition].filter(Boolean).join(' · '),
    }));
}
