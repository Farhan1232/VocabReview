import { describe, expect, it } from 'vitest';
import { EMPTY_QUERY } from '@/api/types';
import { buildSeed } from '@/api/mock/seed';
import { DEFAULT_SETTINGS } from '@/api/mock/mockApi';
import { searchVocab } from './search';

const seed = buildSeed(new Date('2026-10-31T12:00:00Z'));
const ctx = (studentId: string | null = null) => ({
  items: seed.items,
  cardsByItem: new Map(seed.cards.filter((c) => c.studentId === studentId).map((c) => [c.itemId, c])),
  setItemIds: null,
  settings: DEFAULT_SETTINGS,
  now: new Date('2026-10-31T12:00:00Z'),
});

describe('searchVocab', () => {
  it('keeps distinct senses as separate rows', () => {
    const rows = searchVocab({ ...EMPTY_QUERY, q: '"bank"' }, ctx());
    expect(rows.map((r) => r.item.polish[0]).sort()).toEqual(['bank', 'brzeg']);
  });

  it('finds by Polish translation and ignores Polish diacritics', () => {
    expect(searchVocab({ ...EMPTY_QUERY, q: 'skladnik' }, ctx())[0].item.english).toBe('ingredient');
  });

  it('ranks exact English match first', () => {
    expect(searchVocab({ ...EMPTY_QUERY, q: 'book' }, ctx())[0].item.english).toBe('book');
  });

  it('combines topic + CEFR', () => {
    const rows = searchVocab({ ...EMPTY_QUERY, topics: ['Cooking'], cefr: ['A2'] }, ctx());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.item.cefr === 'A2' && r.item.topics.includes('Cooking'))).toBe(true);
  });

  it('NOT ASSIGNED returns only items the student does not have', () => {
    const c = ctx('st_john');
    const rows = searchVocab({ ...EMPTY_QUERY, studentId: 'st_john', assignment: 'not_assigned' }, c);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !c.cardsByItem.has(r.item.id))).toBe(true);
    const assigned = searchVocab({ ...EMPTY_QUERY, studentId: 'st_john', assignment: 'assigned' }, c);
    expect(rows.length + assigned.length).toBe(seed.items.length);
  });

  it('missing Polish filter', () => {
    const rows = searchVocab({ ...EMPTY_QUERY, missing: ['polish'] }, ctx());
    expect(rows.map((r) => r.item.english).sort()).toEqual(['landlord', 'wardrobe']);
  });

  it('never creates records', () => {
    const before = seed.items.length;
    searchVocab({ ...EMPTY_QUERY, q: 'nonexistent word xyz' }, ctx());
    expect(seed.items.length).toBe(before);
  });
});
