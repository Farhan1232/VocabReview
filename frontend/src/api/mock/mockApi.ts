/**
 * In-browser implementation of the Api, for working on the UI without a server (`npm run dev:mock`).
 * It follows the same rules as the backend, so the UI behaves the same with either:
 *   - one active card per (student, item); bulk assign reports created vs already assigned
 *   - editing an item never touches cards or logs
 *   - unassign archives the card, re-assign restores it with its FSRS state
 *   - each rating carries a requestId; a repeated requestId returns the first result (no duplicate)
 *   - manual resets are logged as kind="reset", never as a review
 */
import type { Api, BulkPatch, Facets, HistoryEntry } from '../client';
import type {
  BackupInfo,
  ID,
  ImportPreviewRow,
  ImportRun,
  QueueEntry,
  QueueRequest,
  Rating,
  ReviewLog,
  Settings,
  StudentCard,
  StudentSummary,
  VocabDraft,
  VocabItem,
  VocabSet,
  Student,
} from '../types';
import { buildSeed, type SeedDb } from './seed';
import { newFsrsCard, previewRatings, rate as fsrsRate } from '@/lib/fsrs';
import { decorateCard, searchVocab, suggest } from '@/lib/search';
import { buildPreview } from '@/lib/csvImport';
import { checkRows, duplicateGroups, sameWord } from '@/lib/duplicates';
import { matchesDue } from '@/lib/dates';
import { uid } from '@/lib/id';
import { shuffled, newSeed } from '@/lib/random';
import Papa from 'papaparse';

const STORAGE_KEY = 'lexis.mockdb.v1';
const SCHEMA_VERSION = 1;

/** Settings used until the teacher changes them. */
export const DEFAULT_SETTINGS: Settings = {
  shortcuts: {
    again: '1',
    hard: '2',
    good: '3',
    easy: '4',
    next: 'ArrowRight',
    previous: 'ArrowLeft',
    reveal: ' ',
    revealPolish: 'p',
    revealDefinition: 'd',
    revealExample: 'e',
  },
  desiredRetention: 0.9,
  masteredStabilityDays: 21,
  difficultLapses: 2,
  difficultDifficulty: 7.5,
  dueSoonDays: 3,
  autoBackupKeep: 30,
};

interface Db extends SeedDb {
  version: number;
  settings: Settings;
  importRuns: ImportRun[];
  backups: BackupInfo[];
  /** Groups of word ids the teacher marked as different meanings. */
  dismissedDuplicates?: ID[][];
}

function fresh(): Db {
  const seed = buildSeed();
  // The demo shows BANK (money) and BANK (river) as separate meanings on purpose; don't offer them as duplicates.
  const dismissedDuplicates = duplicateGroups(seed.items, []).map((g) => g.items.map((r) => r.item.id).sort());
  return {
    version: SCHEMA_VERSION,
    ...seed,
    settings: DEFAULT_SETTINGS,
    importRuns: [],
    backups: [],
    dismissedDuplicates,
  };
}

function load(): Db {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Db;
      if (db.version === SCHEMA_VERSION) {
        db.settings = {
          ...DEFAULT_SETTINGS,
          ...db.settings,
          shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...db.settings?.shortcuts },
        };
        return db;
      }
    }
  } catch {
    /* corrupted or blocked storage → start from demo data */
  }
  return fresh();
}

let _db: Db | null = null;
/** Lazy so nothing is built or read unless the mock is actually used. */
const database = (): Db => (_db ??= load());
const ratedRequests = new Map<string, ReviewLog>();

function persist() {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(database()));
  } catch {
    /* storage full or blocked — data stays in memory for this session */
  }
}

/** Small artificial latency so loading states are exercised like with a real server. */
const delay = <T>(value: T, ms = 60): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(value)), ms));

const nowIso = () => new Date().toISOString();
const notFound = (what: string): never => {
  throw new Error(`${what} not found`);
};

function cleanDraft(cleaned: VocabDraft): VocabDraft {
  const cleanText = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    english: cleaned.english.trim(),
    polish: cleaned.polish.map((p) => p.trim()).filter(Boolean),
    definition: cleanText(cleaned.definition),
    partOfSpeech: cleanText(cleaned.partOfSpeech),
    cefr: cleaned.cefr,
    example: cleanText(cleaned.example),
    topics: [...new Set(cleaned.topics.map((x) => x.trim()).filter(Boolean))],
    notes: cleanText(cleaned.notes),
  };
}

function activeCards(studentId: ID): StudentCard[] {
  return database().cards.filter((c) => c.studentId === studentId && !c.archived);
}

function lastRatingOf(cardId: ID): Rating | null {
  for (let i = database().logs.length - 1; i >= 0; i--) {
    const log = database().logs[i];
    if (log.cardId === cardId && log.kind === 'review') return log.rating;
  }
  return null;
}

function summary(student: Student): StudentSummary {
  const now = new Date();
  const cards = activeCards(student.id).map((c) => decorateCard(c, database().settings));
  const counts = { new: 0, learning: 0, review: 0, mastered: 0 };
  let dueNow = 0,
    overdue = 0,
    dueToday = 0,
    difficult = 0;
  let nextDueAt: string | null = null;
  for (const c of cards) {
    counts[c.learningState]++;
    if (new Date(c.fsrs.due) <= now) dueNow++;
    if (matchesDue('overdue', c.fsrs.due, now)) overdue++;
    if (matchesDue('due_today', c.fsrs.due, now)) dueToday++;
    if (c.difficult) difficult++;
    if (new Date(c.fsrs.due) > now && (!nextDueAt || c.fsrs.due < nextDueAt)) nextDueAt = c.fsrs.due;
  }
  const lastLog = [...database().logs].reverse().find((l) => l.studentId === student.id && l.kind === 'review');
  return {
    student,
    total: cards.length,
    counts,
    dueNow,
    overdue,
    dueToday,
    difficult,
    lastReviewedAt: lastLog?.reviewedAt ?? null,
    nextDueAt,
  };
}

function toCsv(rows: Record<string, unknown>[]): string {
  return '﻿' + Papa.unparse(rows, { newline: '\r\n' });
}

/** The Api implemented in the browser, for `npm run dev:mock`. */
export const mockApi: Api = {
  /* ---------------- Vocabulary ---------------- */

  async searchVocab(query) {
    const cardsByItem = new Map<string, StudentCard>();
    if (query.studentId) for (const c of activeCards(query.studentId)) cardsByItem.set(c.itemId, c);
    const set = query.setId ? database().sets.find((s) => s.id === query.setId) : null;
    const rows = searchVocab(query, {
      items: database().items,
      cardsByItem,
      setItemIds: set ? new Set(set.itemIds) : null,
      settings: database().settings,
    });
    return delay(rows, 40);
  },

  async suggest(q) {
    return delay(suggest(database().items, q), 20);
  },

  async facets() {
    const topics = new Map<string, number>();
    const pos = new Map<string, number>();
    for (const item of database().items) {
      if (item.archived) continue;
      item.topics.forEach((t) => topics.set(t, (topics.get(t) ?? 0) + 1));
      if (item.partOfSpeech) pos.set(item.partOfSpeech, (pos.get(item.partOfSpeech) ?? 0) + 1);
    }
    const sorted = (m: Map<string, number>) =>
      [...m].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
    const facets: Facets = {
      topics: sorted(topics),
      pos: sorted(pos),
      totalItems: database().items.filter((i) => !i.archived).length,
      archivedItems: database().items.filter((i) => i.archived).length,
      duplicateGroups: duplicateGroups(database().items, database().dismissedDuplicates ?? []).length,
    };
    return delay(facets, 20);
  },

  async getItem(id) {
    return delay(database().items.find((i) => i.id === id) ?? notFound('Item'));
  },

  async createItems(drafts) {
    const at = nowIso();
    const created = drafts
      .map(cleanDraft)
      .filter((d) => d.english)
      .map<VocabItem>((d) => ({ ...d, id: uid('v'), archived: false, createdAt: at, updatedAt: at }));
    database().items.push(...created);
    persist();
    return delay(created);
  },

  async updateItem(id, draft) {
    const item = database().items.find((i) => i.id === id) ?? notFound('Item');
    const cleaned = cleanDraft(draft);
    if (!cleaned.english) throw new Error('English is required');
    Object.assign(item, cleaned, { updatedAt: nowIso() });
    persist();
    return delay(item);
  },

  async bulkUpdate(ids, patch: BulkPatch) {
    const set = new Set(ids);
    let count = 0;
    for (const item of database().items) {
      if (!set.has(item.id)) continue;
      if (patch.cefr !== undefined) item.cefr = patch.cefr;
      if (patch.partOfSpeech !== undefined) item.partOfSpeech = patch.partOfSpeech;
      if (patch.addTopics?.length) item.topics = [...new Set([...item.topics, ...patch.addTopics])];
      if (patch.removeTopics?.length) item.topics = item.topics.filter((t) => !patch.removeTopics!.includes(t));
      item.updatedAt = nowIso();
      count++;
    }
    persist();
    return delay(count);
  },

  async archiveItems(ids) {
    let count = 0;
    for (const item of database().items) {
      if (ids.includes(item.id) && !item.archived) {
        item.archived = true;
        count++;
      }
    }
    persist();
    return delay(count);
  },

  async restoreItems(ids) {
    let count = 0;
    for (const item of database().items) {
      if (ids.includes(item.id) && item.archived) {
        item.archived = false;
        count++;
      }
    }
    persist();
    return delay(count);
  },

  async deleteItems(ids) {
    const withHistory = new Set(database().logs.map((l) => l.itemId));
    const deletable = ids.filter((id) => !withHistory.has(id));
    database().items = database().items.filter((i) => !deletable.includes(i.id));
    database().cards = database().cards.filter((c) => !deletable.includes(c.itemId));
    database().sets.forEach((s) => (s.itemIds = s.itemIds.filter((x) => !deletable.includes(x))));
    persist();
    return delay({ deleted: deletable.length, blocked: ids.length - deletable.length });
  },

  /* ---------------- Duplicates ---------------- */

  async checkDuplicates(rows) {
    return delay(checkRows(rows, database().items), 30);
  },

  async duplicateGroups() {
    const db = database();
    const usage = (id: ID) => ({
      students: db.cards.filter((c) => c.itemId === id).length,
      reviews: db.logs.filter((l) => l.itemId === id).length,
      sets: db.sets.filter((s) => s.itemIds.includes(id)).length,
    });
    return delay(duplicateGroups(db.items, db.dismissedDuplicates ?? [], usage));
  },

  async mergeDuplicates(groups) {
    const db = database();
    const at = nowIso();
    let merged = 0,
      deleted = 0,
      archived = 0;
    for (const group of groups) {
      const keep = db.items.find((i) => i.id === group.keepId);
      const removeIds = [...new Set(group.removeIds)].filter((id) => id !== group.keepId);
      if (!keep || !removeIds.length) continue;
      for (const id of removeIds) {
        const other = db.items.find((i) => i.id === id);
        if (!other || !sameWord(keep, other))
          throw new Error(`“${other?.english ?? id}” is not the same word as “${keep.english}”`);
      }
      for (const id of removeIds) {
        const other = db.items.find((i) => i.id === id)!;
        // Fill only what the kept word is missing; nothing it already has is overwritten.
        if (!keep.polish.length) keep.polish = other.polish;
        keep.definition ||= other.definition;
        keep.partOfSpeech ||= other.partOfSpeech;
        keep.cefr ||= other.cefr;
        keep.example ||= other.example;
        keep.notes ||= other.notes;
        keep.topics = [...new Set([...keep.topics, ...other.topics])];
        for (const set of db.sets) {
          if (!set.itemIds.includes(id)) continue;
          set.itemIds = set.itemIds.includes(keep.id)
            ? set.itemIds.filter((x) => x !== id)
            : set.itemIds.map((x) => (x === id ? keep.id : x));
        }
        let left = 0;
        for (const card of db.cards.filter((c) => c.itemId === id)) {
          if (db.cards.some((c) => c.itemId === keep.id && c.studentId === card.studentId)) {
            left++;
            continue;
          }
          card.itemId = keep.id;
          db.logs.forEach((l) => l.cardId === card.id && (l.itemId = keep.id));
        }
        if (left) {
          other.archived = true;
          other.updatedAt = at;
          archived++;
        } else {
          db.items = db.items.filter((i) => i.id !== id);
          deleted++;
        }
      }
      keep.updatedAt = at;
      merged++;
    }
    persist();
    return delay({ merged, deleted, archived });
  },

  async dismissDuplicates(ids) {
    const unique = [...new Set(ids)].sort();
    if (unique.length < 2) throw new Error('Choose at least two words');
    const db = database();
    db.dismissedDuplicates = [...(db.dismissedDuplicates ?? []), unique];
    persist();
    return delay(undefined);
  },

  /* ---------------- Sets ---------------- */

  async listSets() {
    return delay(
      [...database().sets].sort((a, b) => a.name.localeCompare(b.name)),
      30,
    );
  },

  async createSet(name, description, itemIds = []) {
    if (!name.trim()) throw new Error('Set name is required');
    if (database().sets.some((s) => s.name.toLowerCase() === name.trim().toLowerCase()))
      throw new Error('A set with this name already exists');
    const vocabSet: VocabSet = {
      id: uid('set'),
      name: name.trim(),
      description,
      itemIds: [...new Set(itemIds)],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    database().sets.push(vocabSet);
    persist();
    return delay(vocabSet);
  },

  async updateSet(id, patch) {
    const vocabSet = database().sets.find((x) => x.id === id) ?? notFound('Set');
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new Error('Set name is required');
      vocabSet.name = patch.name.trim();
    }
    if (patch.description !== undefined) vocabSet.description = patch.description;
    vocabSet.updatedAt = nowIso();
    persist();
    return delay(vocabSet);
  },

  async deleteSet(id) {
    database().sets = database().sets.filter((s) => s.id !== id);
    persist();
    return delay(undefined);
  },

  async addToSet(setId, itemIds) {
    const vocabSet = database().sets.find((x) => x.id === setId) ?? notFound('Set');
    const before = new Set(vocabSet.itemIds);
    const add = [...new Set(itemIds)].filter((id) => !before.has(id));
    vocabSet.itemIds.push(...add);
    vocabSet.updatedAt = nowIso();
    persist();
    return delay({ added: add.length, already: itemIds.length - add.length });
  },

  async removeFromSet(setId, itemIds) {
    const vocabSet = database().sets.find((x) => x.id === setId) ?? notFound('Set');
    const count = vocabSet.itemIds.length;
    vocabSet.itemIds = vocabSet.itemIds.filter((id) => !itemIds.includes(id));
    persist();
    return delay(count - vocabSet.itemIds.length);
  },

  /* ---------------- Students ---------------- */

  async listStudents() {
    return delay(
      database()
        .students.map(summary)
        .sort(
          (a, b) => Number(b.student.active) - Number(a.student.active) || a.student.name.localeCompare(b.student.name),
        ),
      30,
    );
  },

  async getStudent(id) {
    return delay(summary(database().students.find((s) => s.id === id) ?? notFound('Student')));
  },

  async createStudent(name, notes) {
    if (!name.trim()) throw new Error('Name is required');
    const student: Student = { id: uid('st'), name: name.trim(), notes, active: true, createdAt: nowIso() };
    database().students.push(student);
    persist();
    return delay(student);
  },

  async updateStudent(id, patch) {
    const student = database().students.find((x) => x.id === id) ?? notFound('Student');
    Object.assign(student, patch);
    persist();
    return delay(student);
  },

  async studentCards(studentId) {
    const items = new Map(database().items.map((i) => [i.id, i]));
    return delay(
      activeCards(studentId)
        .map((c) => ({
          card: decorateCard(c, database().settings),
          item: items.get(c.itemId)!,
          lastRating: lastRatingOf(c.id),
        }))
        .filter((r) => r.item)
        .sort((a, b) => a.card.fsrs.due.localeCompare(b.card.fsrs.due)),
    );
  },

  async assign(studentId, itemIds) {
    let created = 0,
      alreadyAssigned = 0,
      restored = 0;
    for (const itemId of new Set(itemIds)) {
      const existing = database().cards.find((c) => c.studentId === studentId && c.itemId === itemId);
      if (!existing) {
        database().cards.push({
          id: uid('c'),
          studentId,
          itemId,
          archived: false,
          assignedAt: nowIso(),
          fsrs: newFsrsCard(),
        });
        created++;
      } else if (existing.archived) {
        existing.archived = false;
        restored++;
      } else alreadyAssigned++;
    }
    persist();
    return delay({ created, alreadyAssigned, restored });
  },

  async unassign(cardIds) {
    let count = 0;
    for (const c of database().cards) {
      if (cardIds.includes(c.id) && !c.archived) {
        c.archived = true;
        count++;
      }
    }
    persist();
    return delay(count);
  },

  /* ---------------- Review ---------------- */

  async reviewQueue(req: QueueRequest) {
    const now = new Date();
    const items = new Map(database().items.map((i) => [i.id, i]));
    let cards = activeCards(req.studentId).map((c) => decorateCard(c, database().settings));
    const setIds =
      req.source === 'set' && req.setId
        ? new Set(database().sets.find((s) => s.id === req.setId)?.itemIds ?? [])
        : null;
    const selIds = req.source === 'selection' ? new Set(req.itemIds ?? []) : null;

    cards = cards.filter((c) => {
      const item = items.get(c.itemId);
      if (!item || item.archived) return false;
      if (req.cefr?.length && (!item.cefr || !req.cefr.includes(item.cefr))) return false;
      if (req.topics?.length && !item.topics.some((t) => req.topics!.includes(t))) return false;
      switch (req.source) {
        case 'due':
          return new Date(c.fsrs.due) <= now || matchesDue('due_today', c.fsrs.due, now);
        case 'overdue':
          return matchesDue('overdue', c.fsrs.due, now);
        case 'new':
          return c.learningState === 'new';
        case 'learning':
          return c.learningState === 'learning' || c.learningState === 'review';
        case 'difficult':
          return c.difficult;
        case 'set':
          return setIds!.has(c.itemId);
        case 'selection':
          return selIds!.has(c.itemId);
        case 'all':
          return true;
      }
    });
    // Most overdue first, new cards last — a sensible lesson order.
    cards.sort(
      (a, b) =>
        Number(a.learningState === 'new') - Number(b.learningState === 'new') || a.fsrs.due.localeCompare(b.fsrs.due),
    );
    if (req.shuffle) cards = shuffled(cards, newSeed());
    if (req.limit) cards = cards.slice(0, req.limit);
    const out: QueueEntry[] = cards.map((card) => ({
      card,
      item: items.get(card.itemId)!,
      lastRating: lastRatingOf(card.id),
    }));
    return delay(out);
  },

  async previewRatings(cardId) {
    const card = database().cards.find((x) => x.id === cardId) ?? notFound('Card');
    return delay(previewRatings(card.fsrs, database().settings.desiredRetention), 10);
  },

  async rate(cardId, rating, requestId) {
    const previous = ratedRequests.get(requestId) ?? database().logs.find((l) => l.requestId === requestId);
    const card = database().cards.find((x) => x.id === cardId) ?? notFound('Card');
    if (previous) return delay({ card: decorateCard(card, database().settings), log: previous, duplicate: true });

    const now = new Date();
    const prev = card.fsrs;
    card.fsrs = fsrsRate(prev, rating, database().settings.desiredRetention, now);
    const log: ReviewLog = {
      id: uid('l'),
      cardId,
      studentId: card.studentId,
      itemId: card.itemId,
      kind: 'review',
      rating,
      reviewedAt: now.toISOString(),
      previousDue: prev.reps ? prev.due : null,
      nextDue: card.fsrs.due,
      previousState: prev.state,
      nextState: card.fsrs.state,
      requestId,
      note: null,
    };
    database().logs.push(log);
    ratedRequests.set(requestId, log);
    persist();
    return delay({ card: decorateCard(card, database().settings), log, duplicate: false }, 80);
  },

  async resetCard(cardId, mode, note) {
    const card = database().cards.find((x) => x.id === cardId) ?? notFound('Card');
    const prev = card.fsrs;
    card.fsrs = mode === 'new' ? newFsrsCard() : { ...prev, due: nowIso() };
    database().logs.push({
      id: uid('l'),
      cardId,
      studentId: card.studentId,
      itemId: card.itemId,
      kind: mode === 'new' ? 'reset' : 'override',
      rating: null,
      reviewedAt: nowIso(),
      previousDue: prev.due,
      nextDue: card.fsrs.due,
      previousState: prev.state,
      nextState: card.fsrs.state,
      requestId: uid('r'),
      note: note || (mode === 'new' ? 'Reset to new' : 'Made due now'),
    });
    persist();
    return delay(undefined);
  },

  async history(studentId, itemId) {
    const items = new Map(database().items.map((i) => [i.id, i]));
    const out: HistoryEntry[] = database()
      .logs.filter((l) => l.studentId === studentId && (!itemId || l.itemId === itemId))
      .map((l) => ({
        ...l,
        english: items.get(l.itemId)?.english ?? '(deleted)',
        definition: items.get(l.itemId)?.definition ?? null,
      }))
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
    return delay(out);
  },

  /* ---------------- Import / export ---------------- */

  async previewImport(rows, mapping) {
    return delay(buildPreview(rows, mapping, database().items), 120);
  },

  async commitImport(fileName, rows: ImportPreviewRow[]) {
    let added = 0,
      updated = 0,
      skipped = 0,
      rejected = 0;
    const at = nowIso();
    for (const r of rows) {
      if (r.status === 'error') {
        rejected++;
        continue;
      }
      if (r.action === 'skip') {
        skipped++;
        continue;
      }
      const cleaned = cleanDraft(r.draft);
      if (r.action === 'update' && r.updateTargetId) {
        const item = database().items.find((i) => i.id === r.updateTargetId);
        if (item) {
          // Only fill fields that are blank in the bank — never silently overwrite teacher content.
          if (!item.polish.length) item.polish = cleaned.polish;
          item.definition ??= cleaned.definition;
          item.partOfSpeech ??= cleaned.partOfSpeech;
          item.cefr ??= cleaned.cefr;
          item.example ??= cleaned.example;
          item.notes ??= cleaned.notes;
          item.topics = [...new Set([...item.topics, ...cleaned.topics])];
          item.updatedAt = at;
          updated++;
          continue;
        }
      }
      database().items.push({ ...cleaned, id: uid('v'), archived: false, createdAt: at, updatedAt: at });
      added++;
    }
    const run: ImportRun = { id: uid('imp'), fileName, at, added, updated, skipped, rejected };
    database().importRuns.unshift(run);
    persist();
    return delay({ added, updated, skipped, rejected, runId: run.id }, 150);
  },

  async listImportRuns() {
    return delay(database().importRuns);
  },

  async exportCsv(kind) {
    const stamp = new Date().toISOString().slice(0, 10);
    const items = new Map(database().items.map((i) => [i.id, i]));
    const students = new Map(database().students.map((s) => [s.id, s]));
    let rows: Record<string, unknown>[] = [];
    if (kind === 'vocabulary')
      rows = database().items.map((i) => ({
        id: i.id,
        english: i.english,
        polish: i.polish.join('; '),
        definition: i.definition ?? '',
        part_of_speech: i.partOfSpeech ?? '',
        cefr: i.cefr ?? '',
        example: i.example ?? '',
        topics: i.topics.join('; '),
        notes: i.notes ?? '',
        archived: i.archived,
      }));
    if (kind === 'students')
      rows = database().students.map((s) => ({ id: s.id, name: s.name, notes: s.notes ?? '', active: s.active }));
    if (kind === 'cards')
      rows = database().cards.map((c) => ({
        student: students.get(c.studentId)?.name,
        english: items.get(c.itemId)?.english,
        item_id: c.itemId,
        archived: c.archived,
        state: c.fsrs.state,
        due_utc: c.fsrs.due,
        stability: c.fsrs.stability.toFixed(2),
        difficulty: c.fsrs.difficulty.toFixed(2),
        reps: c.fsrs.reps,
        lapses: c.fsrs.lapses,
      }));
    if (kind === 'history')
      rows = database().logs.map((l) => ({
        reviewed_at_utc: l.reviewedAt,
        student: students.get(l.studentId)?.name,
        english: items.get(l.itemId)?.english,
        item_id: l.itemId,
        kind: l.kind,
        rating: l.rating ?? '',
        previous_due_utc: l.previousDue ?? '',
        next_due_utc: l.nextDue,
        note: l.note ?? '',
      }));
    return delay({ fileName: `${kind}-${stamp}.csv`, content: toCsv(rows) });
  },

  /* ---------------- Settings / backup ---------------- */

  async getSettings() {
    return delay(database().settings, 10);
  },

  async saveSettings(s) {
    database().settings = s;
    persist();
    return delay(database().settings);
  },

  async listBackups() {
    return delay(database().backups);
  },

  async createBackup() {
    const at = new Date();
    const fileName = `lexis-backup-${at.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    const { backups: _b, ...data } = database();
    const content = JSON.stringify({ format: 'lexis-backup', ...data }, null, 2);
    const info: BackupInfo = {
      id: uid('bk'),
      fileName,
      at: at.toISOString(),
      sizeBytes: content.length,
      reason: 'manual',
    };
    database().backups = [info, ...database().backups].slice(0, database().settings.autoBackupKeep);
    persist();
    return delay({ info, fileName, content });
  },

  async restoreBackup(file) {
    const content = await file.text();
    const parsed = JSON.parse(content) as Partial<Db> & { format?: string };
    if (parsed.format !== 'lexis-backup' || !Array.isArray(parsed.items) || !Array.isArray(parsed.cards))
      throw new Error('This file is not a Lexis backup');
    const keepBackups = database().backups;
    _db = { ...fresh(), ...parsed, version: SCHEMA_VERSION, backups: keepBackups } as Db;
    persist();
    return delay({}, 200);
  },

  async resetDemoData() {
    _db = fresh();
    persist();
    return delay(undefined);
  },

  async loadSampleData() {
    return mockApi.resetDemoData();
  },

  async system() {
    return delay({
      version: 'demo',
      fsrsVersion: 'ts-fsrs 6',
      dataDir: 'browser storage',
      dbPath: 'localStorage',
      schemaRevision: null,
      items: database().items.length,
      students: database().students.length,
    });
  },

  mode: 'mock',
};
