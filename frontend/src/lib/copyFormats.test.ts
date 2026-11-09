import { describe, expect, it } from 'vitest';
import type { VocabItem } from '@/api/types';
import { COPY_FIELDS_LABEL, countEmptyForCopy, formatCopy, type CopyFields } from './copyFormats';

const it1: VocabItem = {
  id: '1',
  english: 'bank',
  polish: ['brzeg'],
  definition: 'river side',
  partOfSpeech: 'noun',
  cefr: 'B1',
  example: 'On the bank.',
  topics: [],
  notes: null,
  archived: false,
  createdAt: '',
  updatedAt: '',
};
const it2: VocabItem = { ...it1, id: '2', english: 'landlord', polish: [], definition: null, example: null };

describe('formatCopy', () => {
  it('omits missing fields cleanly in line layout', () => {
    expect(formatCopy([it1, it2], 'en_pl_def', 'lines')).toBe('bank – brzeg – river side\nlandlord');
  });
  it('keeps columns in tab-separated layout', () => {
    expect(formatCopy([it1, it2], 'en_pl', 'tsv')).toBe('bank\tbrzeg\nlandlord');
  });
  it('english only', () => {
    expect(formatCopy([it1, it2], 'en', 'lines')).toBe('bank\nlandlord');
  });
  it('english + example', () => {
    expect(formatCopy([it1], 'en_ex', 'lines')).toBe('bank – On the bank.');
  });
  it('polish only and definition only', () => {
    expect(formatCopy([it1], 'pl', 'lines')).toBe('brzeg');
    expect(formatCopy([it1], 'def', 'lines')).toBe('river side');
  });
  it('polish + definition', () => {
    expect(formatCopy([it1], 'pl_def', 'lines')).toBe('brzeg – river side');
    expect(formatCopy([it1], 'pl_def', 'tsv')).toBe('brzeg\triver side');
  });
  it('a word with nothing to copy leaves no blank line, but keeps its row in a table', () => {
    expect(formatCopy([it2, it1], 'pl', 'lines')).toBe('brzeg');
    expect(formatCopy([it2, it1], 'pl', 'tsv')).toBe('\nbrzeg');
    expect(countEmptyForCopy([it2, it1], 'pl')).toBe(1);
    expect(countEmptyForCopy([it2, it1], 'en')).toBe(0);
  });
  it('copies only the words, never a heading', () => {
    for (const fields of Object.keys(COPY_FIELDS_LABEL) as CopyFields[]) {
      const text = formatCopy([it1], fields, 'lines');
      expect(text).not.toContain(COPY_FIELDS_LABEL[fields]);
      expect(text).not.toContain('---');
      expect(text.split('\n')).toHaveLength(1);
    }
  });
});
