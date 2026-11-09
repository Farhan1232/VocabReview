import { describe, expect, it } from 'vitest';
import type { VocabItem } from '@/api/types';
import { DEFAULT_BATCH_FORMAT, formatAnswerKey, formatBatch } from './batchFormat';

const item = (english: string, polish: string[], definition: string | null = null): VocabItem => ({
  id: english,
  english,
  polish,
  definition,
  partOfSpeech: null,
  cefr: null,
  example: null,
  topics: [],
  notes: null,
  archived: false,
  createdAt: '',
  updatedAt: '',
});

const items = [
  item('bank', ['brzeg'], 'the side of a river'),
  item('recipe', ['przepis']),
  item('wardrobe', [], 'a tall cupboard'),
];
const base = { ...DEFAULT_BATCH_FORMAT, difficulty: 'very_hard' as const };

describe('formatBatch', () => {
  it('one item per line, numbered, no trailing spaces', () => {
    const { text } = formatBatch(items, base);
    expect(text.split('\n')).toEqual([
      '1. brzeg – _ _ _ _',
      '2. przepis – _ _ _ _ _ _',
      '3. a tall cupboard – _ _ _ _ _ _ _ _',
    ]);
    expect(text).not.toMatch(/ \n| $/);
  });

  it('only Polish shows the translation alone', () => {
    const { text, lines } = formatBatch(items, { ...base, show: 'polish', numbered: false });
    expect(text.split('\n')).toEqual(['brzeg', 'przepis', 'a tall cupboard']);
    expect(lines.map((l) => l.otherField)).toEqual([false, false, true]);
    expect(lines.map((l) => l.missingHint)).toEqual([false, false, false]);
  });

  it('a word with neither Polish nor a definition is flagged and shows only its blanks or English', () => {
    const bare = [item('landlord', [])];
    expect(formatBatch(bare, { ...base, numbered: false }).text).toBe('_ _ _ _ _ _ _ _');
    const onlyPolish = formatBatch(bare, { ...base, show: 'polish', numbered: false });
    expect(onlyPolish.text).toBe('landlord');
    expect(onlyPolish.lines[0]).toMatchObject({ missingHint: true, otherField: false });
  });

  it('Polish + definition shows both, or whichever one the word has', () => {
    const { text, lines } = formatBatch(items, { ...base, hint: 'both', show: 'polish', numbered: false });
    expect(text.split('\n')).toEqual(['brzeg (the side of a river)', 'przepis', 'a tall cupboard']);
    expect(lines.some((l) => l.otherField)).toBe(false);
  });

  it('only English shows the prefilled word', () => {
    const { text } = formatBatch(items, { ...base, show: 'english', numbered: false, style: 'compact' });
    expect(text).toBe('____\n______\n________');
  });

  it('definition can be used as the hint instead of Polish', () => {
    const { text } = formatBatch(items, { ...base, hint: 'definition', numbered: false });
    expect(text.split('\n')[0]).toBe('the side of a river – _ _ _ _');
    expect(text.split('\n')[1]).toBe('przepis – _ _ _ _ _ _');
  });

  it('pads numbers so long lists line up', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`w${i}`, ['x']));
    expect(formatBatch(many, base).text.split('\n')[0]).toBe(' 1. x – _ 0');
  });

  it('answer key lists full words in the same order', () => {
    expect(formatAnswerKey(items, { numbered: false, hint: 'polish', separator: ' – ' })).toBe(
      'bank – brzeg\nrecipe – przepis\nwardrobe – a tall cupboard',
    );
  });
});
