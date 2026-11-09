/**
 * Revision batch page (client request, 31 Oct): pick a student's words, scramble them, choose how many
 * letters are prefilled, then copy one item per line for the Zoom chat. Holds the page's state; the
 * two columns are BatchControls and ChatPreview.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Zap } from 'lucide-react';
import { api } from '@/api/client';
import { EMPTY_QUERY, type QueueSource, type VocabItem } from '@/api/types';
import { useSets, useStudents } from '@/hooks/api';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { useGlobalCombo } from '@/hooks/useHotkeys';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { DEFAULT_BATCH_FORMAT, formatAnswerKey, formatBatch, type BatchFormatOptions } from '@/lib/batchFormat';
import { copyText } from '@/lib/copyFormats';
import { newSeed, shuffled } from '@/lib/random';
import { BatchControls, type BatchLimit } from './BatchControls';
import { ChatPreview, type CopyTarget } from './ChatPreview';

const PREFERENCES_KEY = 'lexis.batchFormat';
const SELECTION_KEY = 'lexis.selection';

/** The teacher's last format choices. The seed is always new, so each visit gets fresh blanks. */
function loadPreferences(): BatchFormatOptions {
  try {
    return { ...DEFAULT_BATCH_FORMAT, ...JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}'), seed: newSeed() };
  } catch {
    return { ...DEFAULT_BATCH_FORMAT, seed: newSeed() };
  }
}

/** Item ids the teacher selected in the vocabulary bank before opening this page. */
function readSelection(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SELECTION_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Revision batch page. */
export function BatchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { studentId: lessonStudentId } = useCurrentStudent();
  const { data: students } = useStudents();
  const { data: sets } = useSets();

  const [studentId, setStudentId] = useState(params.get('student') ?? lessonStudentId ?? '');
  const [source, setSource] = useState<QueueSource>((params.get('source') as QueueSource) ?? 'due');
  const [setId, setSetId] = useState('');
  const [limit, setLimit] = useState<BatchLimit>('15');
  const [selection] = useState(readSelection);
  const [options, setOptions] = useState<BatchFormatOptions>(loadPreferences);
  const [order, setOrder] = useState<string[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  const updateOptions = (patch: Partial<BatchFormatOptions>) => setOptions((current) => ({ ...current, ...patch }));

  useEffect(() => {
    try {
      const { seed: _seed, ...preferences } = options;
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      /* per-browser convenience only */
    }
  }, [options]);

  const needsStudent = source !== 'set' && source !== 'selection';
  const { data: pool, isFetching } = useQuery({
    queryKey: ['batch-pool', studentId, source, setId, selection],
    enabled: needsStudent ? !!studentId : source === 'set' ? !!setId : selection.length > 0,
    queryFn: async (): Promise<VocabItem[]> => {
      if (source === 'set' || source === 'selection') {
        const ids = source === 'set' ? (sets?.find((s) => s.id === setId)?.itemIds ?? []) : selection;
        const bank = await api.searchVocab({ ...EMPTY_QUERY });
        const byId = new Map(bank.map((row) => [row.item.id, row.item]));
        return ids.map((id) => byId.get(id)).filter((item): item is VocabItem => !!item);
      }
      const queue = await api.reviewQueue({ studentId, source });
      return queue.map((entry) => entry.item);
    },
  });

  const resetOrder = () => {
    setOrder((pool ?? []).map((item) => item.id));
    setRemoved(new Set());
  };

  // New pool → new order (unscrambled until the teacher presses Scramble).
  useEffect(() => {
    setOrder((pool ?? []).map((item) => item.id));
    setRemoved(new Set());
  }, [pool]);

  const items = useMemo(() => {
    const byId = new Map((pool ?? []).map((item) => [item.id, item]));
    const list = order.map((id) => byId.get(id)).filter((item): item is VocabItem => !!item && !removed.has(item.id));
    return limit === 'all' ? list : list.slice(0, Number(limit));
  }, [pool, order, removed, limit]);

  const { text, lines } = useMemo(() => formatBatch(items, options), [items, options]);
  const textLines = useMemo(() => text.split('\n'), [text]);

  const scramble = () => {
    setOrder((ids) => shuffled(ids, newSeed()));
    updateOptions({ seed: newSeed() });
  };

  const copy = async (target: CopyTarget) => {
    if (!items.length) return;
    await copyText(target === 'batch' ? text : formatAnswerKey(items, options));
    setCopied(target);
    setTimeout(() => setCopied(null), 1600);
    toast({
      tone: 'success',
      title: target === 'batch' ? `Copied ${items.length} lines` : 'Answer key copied',
      body: target === 'batch' ? 'Paste it into the Zoom chat with Ctrl+V.' : 'For you only — keep it out of the chat.',
    });
  };

  useGlobalCombo({
    'mod+shift+c': () => void copy('batch'),
    'mod+shift+s': () => scramble(),
  });

  const studentName = students?.find((s) => s.student.id === studentId)?.student.name;

  let summary = '';
  if (isFetching) summary = 'Loading…';
  else if (pool) {
    summary = `${items.length} of ${pool.length - removed.size} words in this batch${studentName ? ` for ${studentName}` : ''}`;
  } else if (needsStudent) summary = 'Choose a student';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={<Sparkles />}
        title="Revision batch"
        subtitle="Scramble, choose difficulty, copy — pastes into Zoom chat one item per line."
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<Zap className="size-3.5" />}
            disabled={!items.length || !studentId}
            onClick={() => {
              sessionStorage.setItem(SELECTION_KEY, JSON.stringify(items.map((item) => item.id)));
              navigate(`/review?student=${studentId}&source=selection`);
            }}
          >
            Review these with FSRS
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(380px,440px)_1fr] overflow-hidden">
        <BatchControls
          students={students}
          studentId={studentId}
          onStudentChange={setStudentId}
          source={source}
          onSourceChange={setSource}
          selectionCount={selection.length}
          sets={sets}
          setId={setId}
          onSetChange={setSetId}
          limit={limit}
          onLimitChange={setLimit}
          summary={summary}
          canScramble={items.length > 0}
          onScramble={scramble}
          onNewBlanks={() => updateOptions({ seed: newSeed() })}
          onOriginalOrder={resetOrder}
          sampleWord={items[0]?.english ?? 'vocabulary'}
          options={options}
          onOptionsChange={updateOptions}
        />
        <ChatPreview
          loading={isFetching && !pool}
          items={items}
          lines={lines}
          textLines={textLines}
          options={options}
          studentName={studentName}
          needsStudentChoice={needsStudent && !studentId}
          removedCount={removed.size}
          copied={copied}
          onCopy={copy}
          onRemove={(itemId) => setRemoved((current) => new Set(current).add(itemId))}
          onPutBack={() => setRemoved(new Set())}
        />
      </div>
    </div>
  );
}
