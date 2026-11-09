/** React Query hooks for every read, plus the mutation helper that refreshes data after a write. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { ID, QueueRequest, VocabQuery } from '@/api/types';

/** Cache keys for all server data. */
export const queryKeys = {
  vocab: (q: VocabQuery) => ['vocab', q] as const,
  facets: ['facets'] as const,
  sets: ['sets'] as const,
  students: ['students'] as const,
  student: (id: ID) => ['students', id] as const,
  studentCards: (id: ID) => ['studentCards', id] as const,
  history: (id: ID, itemId?: ID) => ['history', id, itemId ?? null] as const,
  settings: ['settings'] as const,
  backups: ['backups'] as const,
  importRuns: ['importRuns'] as const,
};

/** Search the bank; keeps the old rows on screen while new ones load. */
export const useVocab = (q: VocabQuery) =>
  useQuery({ queryKey: queryKeys.vocab(q), queryFn: () => api.searchVocab(q), placeholderData: keepPreviousData });
/** Filter menu counts. */
export const useFacets = () => useQuery({ queryKey: queryKeys.facets, queryFn: api.facets });
/** All sets. */
export const useSets = () => useQuery({ queryKey: queryKeys.sets, queryFn: api.listSets });
/** All students with counts. */
export const useStudents = () => useQuery({ queryKey: queryKeys.students, queryFn: api.listStudents });
/** One student with counts. */
export const useStudent = (id: ID | undefined) =>
  useQuery({ queryKey: queryKeys.student(id ?? ''), queryFn: () => api.getStudent(id!), enabled: !!id });
/** Words assigned to a student. */
export const useStudentCards = (id: ID | undefined) =>
  useQuery({ queryKey: queryKeys.studentCards(id ?? ''), queryFn: () => api.studentCards(id!), enabled: !!id });
/** A student's history, optionally for one word. */
export const useHistory = (id: ID | undefined, itemId?: ID) =>
  useQuery({ queryKey: queryKeys.history(id ?? '', itemId), queryFn: () => api.history(id!, itemId), enabled: !!id });
/** App settings. */
export const useSettings = () =>
  useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings, staleTime: Infinity });
/** Backup files. */
export const useBackups = () => useQuery({ queryKey: queryKeys.backups, queryFn: api.listBackups });
/** Recent imports. */
export const useImportRuns = () => useQuery({ queryKey: queryKeys.importRuns, queryFn: api.listImportRuns });
/** A review session's cards. Never refetched mid-session, so the order stays put. */
export const useQueue = (req: QueueRequest | null) =>
  useQuery({
    queryKey: ['queue', req],
    queryFn: () => api.reviewQueue(req!),
    enabled: !!req,
    staleTime: Infinity,
    gcTime: 0,
  });

/** Any write can change counts anywhere, so we refresh everything except settings. Cheap for a local app. */
export function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'settings' && q.queryKey[0] !== 'queue' });
}

/** A write that refreshes all server data when it succeeds. */
export function useApiMutation<A, R>(fn: (a: A) => Promise<R>) {
  const invalidate = useInvalidateAll();
  // Do NOT return the invalidate promise: React Query would wait for the refetch before running the
  // caller's onSuccess, and by then the calling component (e.g. the bulk bar) may have unmounted,
  // so its toast/close callbacks would silently never run.
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void invalidate();
    },
  });
}
