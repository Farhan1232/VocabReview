/**
 * Domain types. They match the JSON sent by the FastAPI backend and mirror its tables:
 * vocab_items, topics, sets, students, student_cards, review_logs, settings, import_runs.
 *
 * All timestamps are ISO-8601 strings in UTC. The UI shows them in the teacher's local time.
 */

/** Record id. */
export type ID = string;

/** All CEFR levels, in order. */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
/** A CEFR level. */
export type Cefr = (typeof CEFR_LEVELS)[number];

/** Common parts of speech offered in the forms. */
export const PARTS_OF_SPEECH = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'phrasal verb',
  'phrase',
  'idiom',
  'preposition',
  'conjunction',
  'pronoun',
  'interjection',
  'other',
] as const;

/** One meaning ("sense") of an English word or phrase. Identified by id, never by spelling. */
export interface VocabItem {
  id: ID;
  english: string;
  /** Zero or more Polish translations. */
  polish: string[];
  definition: string | null;
  partOfSpeech: string | null;
  cefr: Cefr | null;
  example: string | null;
  topics: string[];
  notes: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The editable fields of a word. */
export type VocabDraft = Omit<VocabItem, 'id' | 'archived' | 'createdAt' | 'updatedAt'>;

/** A named, reusable list of words. */
export interface VocabSet {
  id: ID;
  name: string;
  description: string | null;
  itemIds: ID[];
  createdAt: string;
  updatedAt: string;
}

/** A student. */
export interface Student {
  id: ID;
  name: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

/** FSRS rating, one-to-one with the library: Again=1, Hard=2, Good=3, Easy=4. */
export type Rating = 1 | 2 | 3 | 4;
/** Rating names shown on the buttons. */
export const RATING_LABEL: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

/** Raw FSRS state as stored by the scheduler. 0 New, 1 Learning, 2 Review, 3 Relearning. */
export type FsrsState = 0 | 1 | 2 | 3;

/** FSRS scheduling data of one card. */
export interface FsrsCard {
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: FsrsState;
  lastReview: string | null;
  /** Opaque scheduler payload so no FSRS field is ever lost between versions. */
  raw: Record<string, unknown>;
}

/** Teacher-facing label derived from FSRS; it never changes scheduling. */
export type LearningState = 'new' | 'learning' | 'review' | 'mastered';

/** One student's learning record for one vocabulary item (unique per student+item). */
export interface StudentCard {
  id: ID;
  studentId: ID;
  itemId: ID;
  archived: boolean;
  assignedAt: string;
  fsrs: FsrsCard;
}

/** What a log entry records: a review, or a manual reset or override. */
export type ReviewKind = 'review' | 'override' | 'reset';

/** One entry in the permanent history. */
export interface ReviewLog {
  id: ID;
  cardId: ID;
  studentId: ID;
  itemId: ID;
  kind: ReviewKind;
  rating: Rating | null;
  reviewedAt: string;
  previousDue: string | null;
  nextDue: string;
  previousState: FsrsState;
  nextState: FsrsState;
  /** Client-generated id so a double press can never save two reviews. */
  requestId: string;
  note: string | null;
}

/* ---------- Search ---------- */

/** Filter on whether a word is assigned to the chosen student. */
export type AssignmentFilter = 'any' | 'assigned' | 'not_assigned';
/** Filter on when a card is due. */
export type DueFilter = 'any' | 'overdue' | 'due_today' | 'due_soon' | 'not_due';
/** A field the "Missing" filter can look for. */
export type MissingField = 'polish' | 'definition' | 'example' | 'cefr' | 'topic';

/** Search text plus every filter. Filters combine. */
export interface VocabQuery {
  q: string;
  cefr: Cefr[];
  topics: string[];
  pos: string[];
  setId: ID | null;
  studentId: ID | null;
  assignment: AssignmentFilter;
  states: LearningState[];
  due: DueFilter;
  difficult: boolean;
  missing: MissingField[];
  includeArchived: boolean;
}

/** A query with no text and no filters. */
export const EMPTY_QUERY: VocabQuery = {
  q: '',
  cefr: [],
  topics: [],
  pos: [],
  setId: null,
  studentId: null,
  assignment: 'any',
  states: [],
  due: 'any',
  difficult: false,
  missing: [],
  includeArchived: false,
};

/** A search result row. `card` is present only when a student is selected and the item is assigned. */
export interface VocabRow {
  item: VocabItem;
  card: (StudentCard & { learningState: LearningState; difficult: boolean }) | null;
  /** Which fields matched the text query, for highlighting. */
  matched: string[];
}

/** One suggestion under the search box. */
export interface Suggestion {
  itemId: ID;
  english: string;
  hint: string;
}

/* ---------- Students ---------- */

/** A student with counts for the overview. */
export interface StudentSummary {
  student: Student;
  total: number;
  counts: Record<LearningState, number>;
  dueNow: number;
  overdue: number;
  dueToday: number;
  difficult: number;
  lastReviewedAt: string | null;
  nextDueAt: string | null;
}

/** A student's card together with its word. */
export interface StudentCardRow {
  card: StudentCard & { learningState: LearningState; difficult: boolean };
  item: VocabItem;
  lastRating: Rating | null;
}

/* ---------- Assignment ---------- */

/** Counts returned by a bulk assign. */
export interface AssignResult {
  created: number;
  alreadyAssigned: number;
  restored: number;
}

/* ---------- Review ---------- */

/** Which of a student's cards a session or batch draws from. */
export type QueueSource = 'due' | 'overdue' | 'new' | 'learning' | 'difficult' | 'all' | 'set' | 'selection';

/** Asks for a list of cards to review. */
export interface QueueRequest {
  studentId: ID;
  source: QueueSource;
  setId?: ID | null;
  itemIds?: ID[];
  /** Optional extra filters, e.g. Student John + COOKING + A2 + DUE. */
  cefr?: Cefr[];
  topics?: string[];
  limit?: number;
  shuffle?: boolean;
}

/** One card in a review session. */
export interface QueueEntry {
  card: StudentCard & { learningState: LearningState; difficult: boolean };
  item: VocabItem;
  lastRating: Rating | null;
}

/** When each rating would make the card due next. */
export interface RatePreview {
  rating: Rating;
  due: string;
}

/** Result of saving a rating. `duplicate` means this request was already saved. */
export interface RateResult {
  card: StudentCard & { learningState: LearningState; difficult: boolean };
  log: ReviewLog;
  duplicate: boolean;
}

/* ---------- Import ---------- */

/** A field a CSV column can be mapped to. */
export type ImportField =
  'english' | 'polish' | 'definition' | 'partOfSpeech' | 'cefr' | 'example' | 'topics' | 'notes' | 'ignore';

/** How a CSV row compares with the bank. */
export type ImportRowStatus = 'new' | 'exact_duplicate' | 'possible_duplicate' | 'error';

/** A checked CSV row and the action chosen for it. */
export interface ImportPreviewRow {
  index: number;
  draft: VocabDraft;
  status: ImportRowStatus;
  messages: string[];
  /** Existing items with the same English form; shown so senses are never merged blindly. */
  matches: Pick<VocabItem, 'id' | 'english' | 'definition' | 'polish'>[];
  /** Teacher's decision for this row. */
  action: 'add' | 'skip' | 'update';
  updateTargetId: ID | null;
}

/** Final counts of an import. */
export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  rejected: number;
  runId: ID;
}

/** A finished import, kept for the history list. */
export interface ImportRun {
  id: ID;
  fileName: string;
  at: string;
  added: number;
  updated: number;
  skipped: number;
  rejected: number;
}

/* ---------- Settings ---------- */

/** A review action that has a keyboard shortcut. */
export type ShortcutAction =
  | 'again'
  | 'hard'
  | 'good'
  | 'easy'
  | 'next'
  | 'previous'
  | 'reveal'
  | 'revealPolish'
  | 'revealDefinition'
  | 'revealExample';

/** All app settings. */
export interface Settings {
  shortcuts: Record<ShortcutAction, string>;
  /** FSRS retention target, 0.7–0.97. Higher brings words back more often. Default 0.9. */
  desiredRetention: number;
  /** Review cards with stability (days) at or above this show as "Mastered". Display only. */
  masteredStabilityDays: number;
  /** A card counts as difficult with this many lapses or more... */
  difficultLapses: number;
  /** ...or an FSRS difficulty at or above this (1–10). */
  difficultDifficulty: number;
  dueSoonDays: number;
  autoBackupKeep: number;
}

/** One backup file. */
export interface BackupInfo {
  id: string;
  fileName: string;
  at: string;
  sizeBytes: number;
  reason: 'startup' | 'manual' | 'pre-restore' | 'pre-update';
}

/* ---------------- Duplicates ---------------- */

/** An existing word that a new row matches. */
export type DuplicateMatch = Pick<VocabItem, 'id' | 'english' | 'partOfSpeech' | 'cefr' | 'polish' | 'definition'>;

/** The duplicate check of one row about to be added. */
export interface DuplicateCheck {
  index: number;
  /** The first earlier row that is the same word, or null. */
  repeatOf: number | null;
  /** Words already in the bank that are the same word. */
  matches: DuplicateMatch[];
}

/** One copy in a group of duplicates, with what it is used for. */
export interface DuplicateGroupItem {
  item: VocabItem;
  students: number;
  reviews: number;
  sets: number;
}

/** Words in the bank that are the same word. `keepId` is the suggested copy to keep (listed first). */
export interface DuplicateGroup {
  english: string;
  keepId: ID;
  items: DuplicateGroupItem[];
}

/** What merging duplicates did. Copies still needed for a student's history are archived, not deleted. */
export interface MergeResult {
  merged: number;
  deleted: number;
  archived: number;
}
