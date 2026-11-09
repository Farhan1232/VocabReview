import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi as api } from './mockApi';
import { EMPTY_QUERY } from '../types';

beforeEach(async () => {
  await api.resetDemoData();
});

describe('mock api rules', () => {
  it('bulk assign skips duplicates and reports counts', async () => {
    const [a, b] = await api.createItems([
      {
        english: 'kettle',
        polish: ['czajnik'],
        definition: null,
        partOfSpeech: 'noun',
        cefr: 'A2',
        example: null,
        topics: [],
        notes: null,
      },
      {
        english: 'stove',
        polish: [],
        definition: null,
        partOfSpeech: null,
        cefr: null,
        example: null,
        topics: [],
        notes: null,
      },
    ]);
    expect(await api.assign('st_john', [a.id, b.id])).toEqual({ created: 2, alreadyAssigned: 0, restored: 0 });
    expect(await api.assign('st_john', [a.id, b.id, a.id])).toEqual({ created: 0, alreadyAssigned: 2, restored: 0 });
  });

  it('a double press with the same requestId saves one review', async () => {
    const [entry] = await api.reviewQueue({ studentId: 'st_john', source: 'all' });
    const before = (await api.history('st_john', entry.item.id)).length;
    const [r1, r2] = await Promise.all([api.rate(entry.card.id, 3, 'req-1'), api.rate(entry.card.id, 3, 'req-1')]);
    expect([r1.duplicate, r2.duplicate].sort()).toEqual([false, true]);
    expect((await api.history('st_john', entry.item.id)).length).toBe(before + 1);
  });

  it("one student's review never changes another student's schedule", async () => {
    const travel = (await api.searchVocab({ ...EMPTY_QUERY, topics: ['Travel'] }))[0].item.id;
    const piotrBefore = (await api.studentCards('st_piotr')).find((r) => r.item.id === travel)!.card.fsrs;
    const john = (await api.studentCards('st_john')).find((r) => r.item.id === travel)!;
    await api.rate(john.card.id, 1, 'req-x');
    const piotrAfter = (await api.studentCards('st_piotr')).find((r) => r.item.id === travel)!.card.fsrs;
    expect(piotrAfter).toEqual(piotrBefore);
  });

  it('editing an item keeps its history; reset is logged as reset, not review', async () => {
    const row = (await api.studentCards('st_john'))[0];
    await api.rate(row.card.id, 3, 'req-y');
    await api.updateItem(row.item.id, { ...row.item, english: row.item.english + ' (edited)' });
    await api.resetCard(row.card.id, 'new', null);
    const h = await api.history('st_john', row.item.id);
    expect(h[0].kind).toBe('reset');
    expect(h.some((l) => l.requestId === 'req-y' && l.kind === 'review')).toBe(true);
  });

  it('unassign archives and re-assign restores the same card', async () => {
    const row = (await api.studentCards('st_anna'))[0];
    await api.unassign([row.card.id]);
    expect((await api.studentCards('st_anna')).some((r) => r.card.id === row.card.id)).toBe(false);
    expect(await api.assign('st_anna', [row.item.id])).toEqual({ created: 0, alreadyAssigned: 0, restored: 1 });
  });

  it('items with history cannot be hard-deleted', async () => {
    const withHistory = (await api.history('st_john'))[0].itemId;
    expect(await api.deleteItems([withHistory])).toEqual({ deleted: 0, blocked: 1 });
  });
});
