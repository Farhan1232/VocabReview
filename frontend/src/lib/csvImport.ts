/**
 * CSV import: parse → auto-map columns → validate → classify duplicates.
 * Duplicate rule: a row is an *exact duplicate* when English AND the sense (definition, or Polish
 * when there is no definition) match. A row that is the same word (lib/duplicates `sameWord`: same
 * English and part of speech) with a differently worded sense is a *possible duplicate*: added by
 * default and flagged (the teacher can skip it). Same English with another part of speech is new.
 * Senses are never merged by spelling alone.
 */
import Papa from 'papaparse';
import {
  CEFR_LEVELS,
  type Cefr,
  type ImportField,
  type ImportPreviewRow,
  type VocabDraft,
  type VocabItem,
} from '@/api/types';
import { normalize } from './search';
import { sameWord } from './duplicates';

/** A parsed file: the header row and the data rows. */
export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

/** Parse CSV text. The separator is detected automatically. */
export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t', '|'],
  });
  const data = res.data.map((r) => r.map((c) => (c ?? '').trim()));
  const [headers = [], ...rows] = data;
  return { headers, rows, delimiter: res.meta.delimiter };
}

const ALIASES: Record<Exclude<ImportField, 'ignore'>, string[]> = {
  english: ['english', 'word', 'phrase', 'term', 'en', 'vocabulary', 'vocab'],
  polish: ['polish', 'translation', 'pl', 'polski', 'tłumaczenie'],
  definition: ['definition', 'meaning', 'def', 'sense'],
  partOfSpeech: ['part of speech', 'part_of_speech', 'pos', 'type', 'word class'],
  cefr: ['level', 'cefr', 'cefr level'],
  example: ['example', 'example sentence', 'sentence'],
  topics: ['topic', 'topics', 'category', 'categories', 'tag', 'tags'],
  notes: ['notes', 'note', 'comment', 'comments', 'teacher notes'],
};

/** Guess each column's field from its header. */
export function autoMap(headers: string[]): ImportField[] {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const normalized = normalize(h);
    const hit = (Object.keys(ALIASES) as (keyof typeof ALIASES)[]).find(
      (f) => !used.has(f) && ALIASES[f].includes(normalized),
    );
    if (hit) used.add(hit);
    return hit ?? 'ignore';
  });
}

const splitList = (value: string) =>
  value
    .split(/[;,/|]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Turn one row into a draft, with messages for anything wrong. */
export function rowToDraft(
  row: string[],
  mapping: ImportField[],
): { draft: VocabDraft; messages: string[]; error: boolean } {
  const draft: VocabDraft = {
    english: '',
    polish: [],
    definition: null,
    partOfSpeech: null,
    cefr: null,
    example: null,
    topics: [],
    notes: null,
  };
  const messages: string[] = [];
  mapping.forEach((field, i) => {
    const value = (row[i] ?? '').trim();
    if (!value || field === 'ignore') return;
    switch (field) {
      case 'english':
        draft.english = value;
        break;
      case 'polish':
        draft.polish = splitList(value);
        break;
      case 'definition':
        draft.definition = value;
        break;
      case 'partOfSpeech':
        draft.partOfSpeech = value.toLowerCase();
        break;
      case 'example':
        draft.example = value;
        break;
      case 'topics':
        draft.topics = splitList(value);
        break;
      case 'notes':
        draft.notes = value;
        break;
      case 'cefr': {
        const cefr = value.toUpperCase();
        if ((CEFR_LEVELS as readonly string[]).includes(cefr)) draft.cefr = cefr as Cefr;
        else messages.push(`Unknown CEFR level "${value}" — left blank`);
        break;
      }
    }
  });
  const error = !draft.english;
  if (error) messages.unshift('English word is required');
  if (draft.english.length > 200) messages.push('English is longer than 200 characters');
  return { draft, messages, error };
}

function senseKey(draft: Pick<VocabDraft, 'definition' | 'polish'>): string {
  return draft.definition ? `d:${normalize(draft.definition)}` : `p:${draft.polish.map(normalize).sort().join('|')}`;
}

/** Check rows against the bank and classify duplicates (demo mode; the real server does this itself). */
export function buildPreview(rows: string[][], mapping: ImportField[], existing: VocabItem[]): ImportPreviewRow[] {
  const byEnglish = new Map<string, VocabItem[]>();
  for (const it of existing) {
    if (it.archived) continue;
    const key = normalize(it.english);
    byEnglish.set(key, [...(byEnglish.get(key) ?? []), it]);
  }
  const seenInFile = new Map<string, number>();
  const seenWords = new Map<string, number[]>();
  const drafts: VocabDraft[] = [];

  return rows.map((row, index) => {
    const { draft, messages, error } = rowToDraft(row, mapping);
    drafts[index] = draft;
    if (error) return { index, draft, status: 'error', messages, matches: [], action: 'skip', updateTargetId: null };

    const english = normalize(draft.english);
    const fileKey = `${english}#${senseKey(draft)}`;
    if (seenInFile.has(fileKey)) {
      messages.push(`Same word and sense as row ${seenInFile.get(fileKey)! + 2} in this file`);
      return { index, draft, status: 'exact_duplicate', messages, matches: [], action: 'skip', updateTargetId: null };
    }
    seenInFile.set(fileKey, index);
    const earlier = seenWords.get(english) ?? [];
    const repeatOf = earlier.find((i) => sameWord(drafts[i], draft));
    seenWords.set(english, [...earlier, index]);

    const sameEnglish = byEnglish.get(english) ?? [];
    const matches = sameEnglish.map(({ id, english, definition, polish }) => ({ id, english, definition, polish }));
    const exact = sameEnglish.find((it) => senseKey(it) === senseKey(draft));
    if (exact) {
      messages.push('Already in the bank (same word and sense)');
      return { index, draft, status: 'exact_duplicate', messages, matches, action: 'skip', updateTargetId: exact.id };
    }
    const sameWords = sameEnglish.filter((it) => sameWord(it, draft));
    if (sameWords.length) {
      messages.push(
        `Already in the bank (${sameWords.length} word(s) with the same English and part of speech) — will be added and flagged as a duplicate`,
      );
      return { index, draft, status: 'possible_duplicate', messages, matches, action: 'add', updateTargetId: null };
    }
    if (repeatOf !== undefined) {
      messages.push(`Same word as row ${repeatOf + 2} in this file — will be added and flagged as a duplicate`);
      return { index, draft, status: 'possible_duplicate', messages, matches, action: 'add', updateTargetId: null };
    }
    if (sameEnglish.length) {
      const kinds = [...new Set(sameEnglish.map((it) => it.partOfSpeech || '?'))].sort().join(', ');
      messages.push(`Also in the bank as another part of speech (${kinds})`);
    }
    return { index, draft, status: 'new', messages, matches, action: 'add', updateTargetId: null };
  });
}

/** Field names shown in the column menus. */
export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  english: 'English',
  polish: 'Polish',
  definition: 'Definition',
  partOfSpeech: 'Part of speech',
  cefr: 'CEFR level',
  example: 'Example',
  topics: 'Topic(s)',
  notes: 'Notes',
  ignore: '— ignore —',
};
