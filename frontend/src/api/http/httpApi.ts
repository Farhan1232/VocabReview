/**
 * Real backend client: talks to the FastAPI server on 127.0.0.1 (same origin in production,
 * proxied by Vite in development). Same contract as the mock — see ../client.ts.
 */
import type { Api, BulkPatch, Facets, HistoryEntry, SystemInfo } from '../client';
import type {
  AssignResult,
  BackupInfo,
  DuplicateCheck,
  DuplicateGroup,
  ImportPreviewRow,
  ImportResult,
  ImportRun,
  MergeResult,
  QueueEntry,
  Rating,
  RateResult,
  Settings,
  Student,
  StudentCardRow,
  StudentSummary,
  Suggestion,
  VocabItem,
  VocabQuery,
  VocabRow,
  VocabSet,
} from '../types';

/** A failed request. The message is written for the teacher to read. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach Lexis. Is the app still running? Start it again from the desktop icon.', 0);
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const payload = await res.json();
      if (typeof payload.detail === 'string') detail = payload.detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

const get = <T>(params: string) => request<T>('GET', params);
const post = <T>(params: string, b?: unknown) => request<T>('POST', params, b ?? {});
const enc = encodeURIComponent;

function vocabParams(query: VocabQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.cefr.length) params.set('cefr', query.cefr.join(','));
  query.topics.forEach((t) => params.append('topic', t));
  query.pos.forEach((t) => params.append('pos', t));
  if (query.setId) params.set('set', query.setId);
  if (query.studentId) params.set('student', query.studentId);
  if (query.assignment !== 'any') params.set('assigned', query.assignment);
  if (query.states.length) params.set('state', query.states.join(','));
  if (query.due !== 'any') params.set('due', query.due);
  if (query.difficult) params.set('difficult', 'true');
  if (query.missing.length) params.set('missing', query.missing.join(','));
  if (query.includeArchived) params.set('archived', 'true');
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

/** The Api implemented over HTTP. */
export const httpApi: Api = {
  mode: 'http',

  searchVocab: (q) => get<VocabRow[]>(`/vocab${vocabParams(q)}`),
  suggest: (q) => get<Suggestion[]>(`/vocab/suggest?q=${enc(q)}`),
  facets: () => get<Facets>('/vocab/facets'),
  getItem: (id) => get<VocabItem>(`/vocab/${enc(id)}`),
  createItems: (drafts) => post<VocabItem[]>('/vocab', drafts),
  updateItem: (id, draft) => request<VocabItem>('PUT', `/vocab/${enc(id)}`, draft),
  bulkUpdate: (ids, patch: BulkPatch) =>
    post<number>('/vocab/bulk', {
      ids,
      patch: {
        ...patch,
        setCefr: 'cefr' in patch,
        setPartOfSpeech: 'partOfSpeech' in patch,
        addTopics: patch.addTopics ?? [],
        removeTopics: patch.removeTopics ?? [],
      },
    }),
  archiveItems: (ids) => post<number>('/vocab/archive', { ids }),
  restoreItems: (ids) => post<number>('/vocab/restore', { ids }),
  deleteItems: (ids) => post<{ deleted: number; blocked: number }>('/vocab/delete', { ids }),

  checkDuplicates: (rows) => post<DuplicateCheck[]>('/vocab/duplicates/check', rows),
  duplicateGroups: () => get<DuplicateGroup[]>('/vocab/duplicates'),
  mergeDuplicates: (groups) => post<MergeResult>('/vocab/duplicates/merge', { groups }),
  dismissDuplicates: async (ids) => {
    await post('/vocab/duplicates/dismiss', { ids });
  },

  listSets: () => get<VocabSet[]>('/sets'),
  createSet: (name, description, itemIds = []) => post<VocabSet>('/sets', { name, description, itemIds }),
  updateSet: (id, patch) =>
    request<VocabSet>('PATCH', `/sets/${enc(id)}`, { ...patch, setDescription: 'description' in patch }),
  deleteSet: async (id) => void (await request('DELETE', `/sets/${enc(id)}`)),
  addToSet: (setId, itemIds) => post<{ added: number; already: number }>(`/sets/${enc(setId)}/items`, { itemIds }),
  removeFromSet: (setId, itemIds) => post<number>(`/sets/${enc(setId)}/items/remove`, { itemIds }),

  listStudents: () => get<StudentSummary[]>('/students'),
  getStudent: (id) => get<StudentSummary>(`/students/${enc(id)}`),
  createStudent: (name, notes) => post<Student>('/students', { name, notes }),
  updateStudent: (id, patch) =>
    request<Student>('PATCH', `/students/${enc(id)}`, { ...patch, setNotes: 'notes' in patch }),
  studentCards: (id) => get<StudentCardRow[]>(`/students/${enc(id)}/cards`),
  assign: (studentId, itemIds) => post<AssignResult>('/assign', { studentId, itemIds }),
  unassign: (cardIds) => post<number>('/unassign', { cardIds }),

  reviewQueue: (req) => post<QueueEntry[]>('/review/queue', req),
  previewRatings: (cardId) => get<Record<Rating, string>>(`/cards/${enc(cardId)}/preview`),
  rate: (cardId, rating, requestId) => post<RateResult>(`/review/${enc(cardId)}/rate`, { rating, requestId }),
  resetCard: async (cardId, mode, note) => void (await post(`/cards/${enc(cardId)}/reset`, { mode, note })),
  history: (studentId, itemId) =>
    get<HistoryEntry[]>(`/students/${enc(studentId)}/history${itemId ? `?item=${enc(itemId)}` : ''}`),

  previewImport: (rows, mapping) => post<ImportPreviewRow[]>('/import/preview', { rows, mapping }),
  commitImport: (fileName, rows) => post<ImportResult>('/import/commit', { fileName, rows }),
  listImportRuns: () => get<ImportRun[]>('/import/runs'),
  exportCsv: (kind) => get<{ fileName: string; content: string }>(`/export/${kind}`),

  getSettings: () => get<Settings>('/settings'),
  saveSettings: (s) => request<Settings>('PUT', '/settings', s),
  listBackups: () => get<BackupInfo[]>('/backups'),
  createBackup: () => post<{ info: BackupInfo; fileName: string; url: string }>('/backups'),
  restoreBackup: (file) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return post<{ safetyBackup?: string }>('/restore', formData);
  },
  loadSampleData: async () => void (await post('/demo/sample')),
  resetDemoData: async () => {
    throw new ApiError('Not available in the real app', 400);
  },
  system: () => get<SystemInfo>('/system'),
};
