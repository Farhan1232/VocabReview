/**
 * Formats a revision batch as plain text for pasting into Zoom chat / any messenger:
 * one item per line, no markup, no trailing spaces.
 */
import type { VocabItem } from '@/api/types';
import { prefill, type BlankStyle, type Difficulty } from './prefill';

/** What each line shows: only Polish, only English, or both. */
export type BatchShow = 'english' | 'polish' | 'both';
/** What the Polish side uses: the translation, the English definition, or both together. */
export type BatchHint = 'polish' | 'definition' | 'both';

/** All options for formatting a batch. */
export interface BatchFormatOptions {
  show: BatchShow;
  /** Which text is used as the "Polish" side; teachers can switch it to the English definition. */
  hint: BatchHint;
  difficulty: Difficulty;
  seed: number;
  style: BlankStyle;
  numbered: boolean;
  separator: string;
  showLength: boolean;
}

/** Format used until the teacher changes it. */
export const DEFAULT_BATCH_FORMAT: BatchFormatOptions = {
  show: 'both',
  hint: 'polish',
  difficulty: 'medium',
  seed: 1,
  style: 'spaced',
  numbered: true,
  separator: ' – ',
  showLength: false,
};

/**
 * The text for the Polish side of a line. A word missing the chosen field uses the other one, so the
 * student still gets a clue. Null only when the word has neither.
 */
export function hintText(item: VocabItem, hint: BatchHint): string | null {
  const polish = item.polish.length ? item.polish.join(', ') : null;
  const definition = item.definition?.trim() || null;
  if (hint === 'both') return polish && definition ? `${polish} (${definition})` : (polish ?? definition);
  return hint === 'polish' ? (polish ?? definition) : (definition ?? polish);
}

/** True when the word lacks the chosen field but has the other one, so that one is shown instead. */
function usesOtherField(item: VocabItem, hint: BatchHint): boolean {
  if (hint === 'both') return false;
  const hasPolish = item.polish.length > 0;
  const hasDefinition = !!item.definition?.trim();
  return hint === 'polish' ? !hasPolish && hasDefinition : !hasDefinition && hasPolish;
}

/** One formatted line. */
export interface BatchLine {
  itemId: string;
  text: string;
  /** True when the word has neither a Polish translation nor a definition. */
  missingHint: boolean;
  /** True when the word lacks the chosen field, so the other one is shown instead. */
  otherField: boolean;
}

/** Format one word. */
export function formatBatchLine(item: VocabItem, o: BatchFormatOptions): BatchLine {
  const hint = hintText(item, o.hint);
  let english = prefill(item.english, { difficulty: o.difficulty, seed: o.seed, style: o.style });
  if (o.showLength) english += ` (${Array.from(item.english.replace(/[^\p{L}]/gu, '')).length})`;
  let text: string;
  switch (o.show) {
    case 'english':
      text = english;
      break;
    case 'polish':
      // Fall back to the English word itself so the line is never empty; flagged in the UI.
      text = hint ?? item.english;
      break;
    case 'both':
      text = hint ? `${hint}${o.separator}${english}` : english;
      break;
  }
  const usesHint = o.show !== 'english';
  return {
    itemId: item.id,
    text,
    missingHint: usesHint && !hint,
    otherField: usesHint && usesOtherField(item, o.hint),
  };
}

/** Format a whole batch: plain text for the chat, one item per line. */
export function formatBatch(items: VocabItem[], o: BatchFormatOptions): { text: string; lines: BatchLine[] } {
  const lines = items.map((it) => formatBatchLine(it, o));
  const width = String(lines.length).length;
  const text = lines
    .map((l, i) => (o.numbered ? `${String(i + 1).padStart(width, ' ')}. ${l.text}` : l.text).trimEnd())
    .join('\n');
  return { text, lines };
}

/** Teacher-only answer key in the same order. */
export function formatAnswerKey(
  items: VocabItem[],
  o: Pick<BatchFormatOptions, 'numbered' | 'hint' | 'separator'>,
): string {
  const width = String(items.length).length;
  return items
    .map((it, i) => {
      const hint = hintText(it, o.hint);
      const line = hint ? `${it.english}${o.separator}${hint}` : it.english;
      return o.numbered ? `${String(i + 1).padStart(width, ' ')}. ${line}` : line;
    })
    .join('\n');
}
