/**
 * The one interface every screen talks to. `httpApi` calls the FastAPI backend (the default); `mockApi`
 * runs on in-browser demo data for working on the UI without a server. No screen knows which one it uses.
 */
import type {
  AssignResult,
  BackupInfo,
  DuplicateCheck,
  DuplicateGroup,
  ID,
  ImportField,
  ImportPreviewRow,
  ImportResult,
  ImportRun,
  MergeResult,
  QueueEntry,
  QueueRequest,
  Rating,
  RateResult,
  ReviewLog,
  Settings,
  Student,
  StudentCardRow,
  StudentSummary,
  Suggestion,
  VocabDraft,
  VocabItem,
  VocabQuery,
  VocabRow,
  VocabSet,
} from './types';
import { mockApi } from './mock/mockApi';
import { httpApi } from './http/httpApi';

/** Changes applied to many items at once. A missing field is left alone. */
export interface BulkPatch {
  cefr?: VocabItem['cefr'];
  partOfSpeech?: string | null;
  addTopics?: string[];
  removeTopics?: string[];
}

/** Counts behind the filter menus. */
export interface Facets {
  topics: { name: string; count: number }[];
  pos: { name: string; count: number }[];
  totalItems: number;
  archivedItems: number;
  /** Groups of words in the bank that are the same word. */
  duplicateGroups: number;
}

/** A review log row with the word it belongs to. */
export type HistoryEntry = ReviewLog & { english: string; definition: string | null };

/** Every operation the UI can ask for. Implemented by httpApi and mockApi. */
export interface Api {
  // Vocabulary bank
  searchVocab(query: VocabQuery): Promise<VocabRow[]>;
  suggest(q: string): Promise<Suggestion[]>;
  facets(): Promise<Facets>;
  getItem(id: ID): Promise<VocabItem>;
  createItems(drafts: VocabDraft[]): Promise<VocabItem[]>;
  updateItem(id: ID, draft: VocabDraft): Promise<VocabItem>;
  bulkUpdate(ids: ID[], patch: BulkPatch): Promise<number>;
  archiveItems(ids: ID[]): Promise<number>;
  restoreItems(ids: ID[]): Promise<number>;
  /** Permanently deletes items that have no review history; returns how many were blocked. */
  deleteItems(ids: ID[]): Promise<{ deleted: number; blocked: number }>;

  // Duplicates (rule in lib/duplicates.ts)
  /** Checks rows about to be added against the bank and the rows before them. Saves nothing. */
  checkDuplicates(rows: { english: string; partOfSpeech: string | null }[]): Promise<DuplicateCheck[]>;
  duplicateGroups(): Promise<DuplicateGroup[]>;
  /** Merges each group into the kept word: sets, topics, blank fields and student progress move onto it. */
  mergeDuplicates(groups: { keepId: ID; removeIds: ID[] }[]): Promise<MergeResult>;
  /** Marks words as different meanings, so they are not offered as duplicates again. */
  dismissDuplicates(ids: ID[]): Promise<void>;

  // Sets
  listSets(): Promise<VocabSet[]>;
  createSet(name: string, description: string | null, itemIds?: ID[]): Promise<VocabSet>;
  updateSet(id: ID, patch: { name?: string; description?: string | null }): Promise<VocabSet>;
  deleteSet(id: ID): Promise<void>;
  addToSet(setId: ID, itemIds: ID[]): Promise<{ added: number; already: number }>;
  removeFromSet(setId: ID, itemIds: ID[]): Promise<number>;

  // Students and assignment
  listStudents(): Promise<StudentSummary[]>;
  getStudent(id: ID): Promise<StudentSummary>;
  createStudent(name: string, notes: string | null): Promise<Student>;
  updateStudent(id: ID, patch: Partial<Pick<Student, 'name' | 'notes' | 'active'>>): Promise<Student>;
  studentCards(studentId: ID): Promise<StudentCardRow[]>;
  assign(studentId: ID, itemIds: ID[]): Promise<AssignResult>;
  /** Archives the learning record; history is kept and re-assigning restores it. */
  unassign(cardIds: ID[]): Promise<number>;

  // Review and FSRS
  reviewQueue(req: QueueRequest): Promise<QueueEntry[]>;
  previewRatings(cardId: ID): Promise<Record<Rating, string>>;
  rate(cardId: ID, rating: Rating, requestId: string): Promise<RateResult>;
  resetCard(cardId: ID, mode: 'new' | 'due_now', note: string | null): Promise<void>;
  history(studentId: ID, itemId?: ID): Promise<HistoryEntry[]>;

  // Import / export
  previewImport(rows: string[][], mapping: ImportField[]): Promise<ImportPreviewRow[]>;
  commitImport(fileName: string, rows: ImportPreviewRow[]): Promise<ImportResult>;
  listImportRuns(): Promise<ImportRun[]>;
  exportCsv(kind: 'vocabulary' | 'students' | 'cards' | 'history'): Promise<{ fileName: string; content: string }>;

  // Settings and backup
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<Settings>;
  listBackups(): Promise<BackupInfo[]>;
  /** Saves a backup. The real backend returns a download `url`; the mock returns the `content`. */
  createBackup(): Promise<{ info: BackupInfo; fileName: string; url?: string; content?: string }>;
  /** Replaces all data with the backup file. A safety backup of the current data is taken first. */
  restoreBackup(file: File): Promise<{ safetyBackup?: string }>;
  /** Fills an empty database with sample words and students (real backend) or resets the demo (mock). */
  loadSampleData(): Promise<void>;
  resetDemoData(): Promise<void>;
  system(): Promise<SystemInfo>;
  readonly mode: 'mock' | 'http';
}

/** App version and data location, shown in Settings. */
export interface SystemInfo {
  version: string;
  fsrsVersion: string;
  dataDir: string;
  dbPath: string;
  schemaRevision: string | null;
  items: number;
  students: number;
}

/** Real backend by default. `npm run dev:mock` (VITE_API_MODE=mock) runs the UI on in-browser demo data. */
export const api: Api = import.meta.env.VITE_API_MODE === 'mock' ? mockApi : httpApi;
