import { describe, expect, it } from 'vitest';
import type { VocabItem } from '@/api/types';
import { checkRows, duplicateGroups, findRepeats, sameWord } from './duplicates';
import { autoMap, buildPreview, parseCsv } from './csvImport';

const word = (id: string, english: string, partOfSpeech: string | null, extra: Partial<VocabItem> = {}): VocabItem => ({
  id,
  english,
  polish: [],
  definition: null,
  partOfSpeech,
  cefr: null,
  example: null,
  topics: [],
  notes: null,
  archived: false,
  createdAt: '2026-11-06T17:26:00.000Z',
  updatedAt: '2026-11-06T17:26:00.000Z',
  ...extra,
});

describe('duplicate words', () => {
  it('treats the same English and part of speech as the same word', () => {
    expect(sameWord({ english: 'ALTER', partOfSpeech: 'verb' }, { english: ' alter ', partOfSpeech: 'Verb' })).toBe(
      true,
    );
    expect(sameWord({ english: 'składnik', partOfSpeech: null }, { english: 'Skladnik', partOfSpeech: 'noun' })).toBe(
      true,
    );
    expect(sameWord({ english: 'suit', partOfSpeech: 'noun' }, { english: 'suit', partOfSpeech: 'verb' })).toBe(false);
    expect(sameWord({ english: 'alter', partOfSpeech: 'verb' }, { english: 'alteration', partOfSpeech: 'verb' })).toBe(
      false,
    );
  });

  it('finds rows that repeat an earlier row, like an AI list with one copy per CEFR level', () => {
    const rows = [
      { english: 'FIT', partOfSpeech: 'verb' },
      { english: 'SUIT', partOfSpeech: 'noun' },
      { english: 'FIT', partOfSpeech: 'verb' },
      { english: 'SUIT', partOfSpeech: 'verb' },
      { english: '', partOfSpeech: null },
      { english: '', partOfSpeech: null },
      { english: 'fit', partOfSpeech: 'verb' },
    ];
    expect(findRepeats(rows)).toEqual([null, null, 0, null, null, null, 0]);
  });

  it('checks new rows against the bank, ignoring archived words', () => {
    const bank = [word('a', 'ALTER', 'verb'), word('b', 'SUIT', 'verb'), word('c', 'COAT', 'noun', { archived: true })];
    const result = checkRows(
      [
        { english: 'alter', partOfSpeech: 'verb' },
        { english: 'suit', partOfSpeech: 'noun' },
        { english: 'coat', partOfSpeech: 'noun' },
      ],
      bank,
    );
    expect(result.map((r) => r.matches.map((m) => m.id))).toEqual([['a'], [], []]);
  });

  it('groups copies in the bank and suggests the copy with history, then the most complete one', () => {
    const items = [
      word('a1', 'FIT', 'verb', { cefr: 'A1' }),
      word('a2', 'FIT', 'verb', { cefr: 'A2', polish: ['pasować'], definition: 'To be the right size' }),
      word('b1', 'FIT', 'verb', { cefr: 'B1' }),
      word('n1', 'SUIT', 'noun'),
      word('v1', 'SUIT', 'verb'),
    ];
    const groups = duplicateGroups(items, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].keepId).toBe('a2');
    expect(groups[0].items.map((r) => r.item.id)).toEqual(['a2', 'a1', 'b1']);

    const used = duplicateGroups(items, [], (id) => ({ students: 0, reviews: id === 'b1' ? 5 : 0, sets: 0 }));
    expect(used[0].keepId).toBe('b1');
  });

  it('joins words through a copy with no part of speech, and leaves out groups marked as different meanings', () => {
    const items = [word('n', 'bank', 'noun'), word('x', 'bank', null), word('v', 'bank', 'verb')];
    expect(duplicateGroups(items, []).map((g) => g.items.length)).toEqual([3]);
    expect(duplicateGroups(items, [['n', 'v', 'x']])).toEqual([]);
    // A new copy after the teacher's choice makes the group show again.
    expect(duplicateGroups([...items, word('y', 'BANK', 'noun')], [['n', 'v', 'x']])).toHaveLength(1);
  });

  it('adds and flags CSV rows that are the same word with reworded definitions', () => {
    const bank = [word('a', 'alter', 'verb', { definition: 'To change the fit of a garment' })];
    const csv = [
      'english,definition,part_of_speech,level',
      'alter,To modify the dimensions of a garment,verb,C1',
      'apparel,Clothing as a category,noun,B2',
      'apparel,Clothing considered as a general category,noun,C1',
      'alter,An altar (misspelt),noun,B2',
    ].join('\n');
    const p = parseCsv(csv);
    const rows = buildPreview(p.rows, autoMap(p.headers), bank);
    expect(rows.map((r) => [r.status, r.action])).toEqual([
      ['possible_duplicate', 'add'],
      ['new', 'add'],
      ['possible_duplicate', 'add'],
      ['new', 'add'],
    ]);
    expect(rows[2].messages.at(-1)).toMatch(/Same word as row 3 in this file/);
    expect(rows[3].messages.at(-1)).toMatch(/another part of speech \(verb\)/);
  });
});
