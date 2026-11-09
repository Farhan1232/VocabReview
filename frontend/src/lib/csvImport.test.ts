import { describe, expect, it } from 'vitest';
import { buildSeed } from '@/api/mock/seed';
import { autoMap, buildPreview, parseCsv } from './csvImport';

const existing = buildSeed().items;

describe('csv import', () => {
  it("maps the columns of the app's own vocabulary export", () => {
    expect(
      autoMap([
        'id',
        'english',
        'polish',
        'definition',
        'part_of_speech',
        'cefr',
        'example',
        'topics',
        'notes',
        'archived',
      ]),
    ).toEqual([
      'ignore',
      'english',
      'polish',
      'definition',
      'partOfSpeech',
      'cefr',
      'example',
      'topics',
      'notes',
      'ignore',
    ]);
  });
  it('auto-maps the familiar ENGLISH | DEFINITION | LEVEL | TOPIC | EXAMPLE header', () => {
    const p = parseCsv(
      'ENGLISH|DEFINITION|LEVEL|TOPIC|EXAMPLE\nkettle|a pot for boiling water|A2|Cooking|Put the kettle on.',
    );
    expect(p.delimiter).toBe('|');
    expect(autoMap(p.headers)).toEqual(['english', 'definition', 'cefr', 'topics', 'example']);
  });

  it('classifies new, exact duplicate, new sense and errors', () => {
    const csv = [
      'english,polish,definition,level',
      'kettle,czajnik,a pot for boiling water,A2',
      'bank,brzeg,the land along the side of a river,B1',
      'bank,ławka,a long seat,B2',
      ',x,,',
      'kettle,czajnik,a pot for boiling water,A2',
      'stove,kuchenka,,Z9',
    ].join('\n');
    const p = parseCsv(csv);
    const rows = buildPreview(p.rows, autoMap(p.headers), existing);
    expect(rows.map((r) => r.status)).toEqual([
      'new',
      'exact_duplicate',
      'possible_duplicate',
      'error',
      'exact_duplicate',
      'new',
    ]);
    expect(rows[2].matches.length).toBe(2);
    expect(rows[5].draft.cefr).toBeNull();
    expect(rows[5].messages[0]).toMatch(/Unknown CEFR/);
  });

  it('keeps blank optional fields blank', () => {
    const p = parseCsv('english,polish\nkettle,');
    const [row] = buildPreview(p.rows, autoMap(p.headers), existing);
    expect(row.draft.polish).toEqual([]);
    expect(row.draft.definition).toBeNull();
  });
});
