/**
 * Keeps the vocabulary filters in the page URL so refresh / back button keep the current view
 * (architecture doc, Frontend → Other details).
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  EMPTY_QUERY,
  type AssignmentFilter,
  type Cefr,
  type DueFilter,
  type LearningState,
  type MissingField,
  type VocabQuery,
} from '@/api/types';

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

/** Keeps the search and filters in the URL, so they survive reload and the back button. */
export function useVocabQueryParams() {
  const [params, setParams] = useSearchParams();

  const query: VocabQuery = useMemo(
    () => ({
      q: params.get('q') ?? '',
      cefr: list(params.get('cefr')) as Cefr[],
      topics: list(params.get('topic')),
      pos: list(params.get('pos')),
      setId: params.get('set'),
      studentId: params.get('student'),
      assignment: (params.get('assigned') as AssignmentFilter) ?? 'any',
      states: list(params.get('state')) as LearningState[],
      due: (params.get('due') as DueFilter) ?? 'any',
      difficult: params.get('difficult') === '1',
      missing: list(params.get('missing')) as MissingField[],
      includeArchived: params.get('archived') === '1',
    }),
    [params],
  );

  const update = useCallback(
    (patch: Partial<VocabQuery>) => {
      const next = { ...query, ...patch };
      if (!next.studentId) Object.assign(next, { assignment: 'any', states: [], due: 'any', difficult: false });
      const params = new URLSearchParams();
      const put = (k: string, v: string | null | undefined) => v && params.set(k, v);
      put('q', next.q);
      put('cefr', next.cefr.join(','));
      put('topic', next.topics.join(','));
      put('pos', next.pos.join(','));
      put('set', next.setId);
      put('student', next.studentId);
      if (next.assignment !== 'any') put('assigned', next.assignment);
      put('state', next.states.join(','));
      if (next.due !== 'any') put('due', next.due);
      if (next.difficult) put('difficult', '1');
      put('missing', next.missing.join(','));
      if (next.includeArchived) put('archived', '1');
      setParams(params, { replace: true });
    },
    [query, setParams],
  );

  const reset = useCallback(() => update({ ...EMPTY_QUERY, studentId: query.studentId }), [update, query.studentId]);

  const activeCount =
    query.cefr.length +
    query.topics.length +
    query.pos.length +
    (query.setId ? 1 : 0) +
    (query.assignment !== 'any' ? 1 : 0) +
    query.states.length +
    (query.due !== 'any' ? 1 : 0) +
    (query.difficult ? 1 : 0) +
    query.missing.length +
    (query.includeArchived ? 1 : 0);

  return { query, update, reset, activeCount };
}
