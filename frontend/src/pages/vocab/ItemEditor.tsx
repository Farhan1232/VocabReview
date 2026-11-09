/** Add and edit form for one word, shown in a side drawer. */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Copy, Save, Split, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { CEFR_LEVELS, PARTS_OF_SPEECH, type Cefr, type VocabDraft, type VocabItem } from '@/api/types';
import { useApiMutation, useFacets } from '@/hooks/api';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { CefrBadge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/dates';
import { normalize } from '@/lib/search';
import { useDebounced } from '@/hooks/useDebounced';

/** A blank word. */
export const EMPTY_DRAFT: VocabDraft = {
  english: '',
  polish: [],
  definition: null,
  partOfSpeech: null,
  cefr: null,
  example: null,
  topics: [],
  notes: null,
};

const toList = (s: string) =>
  s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** The form fields, shared by adding and editing. */
export function VocabForm({
  draft,
  onChange,
  autoFocus,
}: {
  draft: VocabDraft;
  onChange: (d: VocabDraft) => void;
  autoFocus?: boolean;
}) {
  const { data: facets } = useFacets();
  const set = (p: Partial<VocabDraft>) => onChange({ ...draft, ...p });
  const [polishText, setPolishText] = useState(draft.polish.join(', '));
  const [topicsText, setTopicsText] = useState(draft.topics.join(', '));

  return (
    <div className="grid gap-3.5">
      <div>
        <label className="label" htmlFor="f-en">
          English word or phrase <span className="text-accent">*</span>
        </label>
        <input
          id="f-en"
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
          className="field h-10 font-display text-[16px] font-semibold"
          value={draft.english}
          onChange={(e) => set({ english: e.target.value })}
          placeholder="e.g. bank"
        />
      </div>
      <div>
        <label className="label" htmlFor="f-pl">
          Polish translation(s)
        </label>
        <input
          id="f-pl"
          className="field"
          value={polishText}
          onChange={(e) => (setPolishText(e.target.value), set({ polish: toList(e.target.value) }))}
          placeholder="Separate several with commas"
        />
      </div>
      <div>
        <label className="label" htmlFor="f-def">
          English definition / sense
        </label>
        <textarea
          id="f-def"
          rows={2}
          className="field"
          value={draft.definition ?? ''}
          onChange={(e) => set({ definition: e.target.value || null })}
          placeholder="Tells this sense apart from others with the same spelling"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="f-pos">
            Part of speech
          </label>
          <Select
            id="f-pos"
            value={draft.partOfSpeech ?? ''}
            onChange={(e) => set({ partOfSpeech: e.target.value || null })}
          >
            <option value="">—</option>
            {[...new Set([...PARTS_OF_SPEECH, ...(draft.partOfSpeech ? [draft.partOfSpeech] : [])])].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="label">CEFR level</span>
          <div className="flex gap-1">
            {CEFR_LEVELS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={draft.cefr === c}
                onClick={() => set({ cefr: draft.cefr === c ? null : (c as Cefr) })}
                className={`h-8 flex-1 rounded-md border font-mono text-[11px] font-semibold transition-colors ${draft.cefr === c ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-bg-2 text-muted hover:text-fg'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="f-ex">
          Example sentence
        </label>
        <textarea
          id="f-ex"
          rows={2}
          className="field"
          value={draft.example ?? ''}
          onChange={(e) => set({ example: e.target.value || null })}
        />
      </div>
      <div>
        <label className="label" htmlFor="f-top">
          Topics
        </label>
        <input
          id="f-top"
          list="topic-list"
          className="field"
          value={topicsText}
          onChange={(e) => (setTopicsText(e.target.value), set({ topics: toList(e.target.value) }))}
          placeholder="Cooking, Travel"
        />
        <datalist id="topic-list">
          {facets?.topics.map((t) => (
            <option key={t.name} value={t.name} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="f-notes">
          Teacher notes
        </label>
        <textarea
          id="f-notes"
          rows={2}
          className="field"
          value={draft.notes ?? ''}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </div>
    </div>
  );
}

/** Edit an existing item (id) or create a new one (id === 'new'). */
export function ItemEditor({
  id,
  onClose,
  onOpen,
}: {
  id: string | null;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();
  const { data: item } = useQuery({ queryKey: ['item', id], queryFn: () => api.getItem(id!), enabled: !!id && !isNew });
  const { data: siblings } = useQuery({
    queryKey: ['siblings', item?.english],
    queryFn: () =>
      api.searchVocab({
        q: `"${item!.english}"`,
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
        includeArchived: true,
      }),
    enabled: !!item,
  });
  const [draft, setDraft] = useState<VocabDraft>(EMPTY_DRAFT);
  const [loadedKey, setLoadedKey] = useState('');

  // A word that is already in the bank (same English and part of speech) is shown, but adding it is never blocked.
  const typedKey = isNew ? JSON.stringify([draft.english.trim(), draft.partOfSpeech]) : '';
  const newKey = useDebounced(typedKey, 250);
  const { data: existing } = useQuery({
    queryKey: ['duplicate-check', 'one', newKey],
    queryFn: async () => {
      const [english, partOfSpeech] = JSON.parse(newKey) as [string, string | null];
      return (await api.checkDuplicates([{ english, partOfSpeech }]))[0].matches;
    },
    enabled: isNew && !!newKey && JSON.parse(newKey)[0] !== '',
  });
  const sameAlready = isNew && draft.english.trim() && newKey === typedKey ? (existing ?? []) : [];

  useEffect(() => {
    if (isNew) {
      setDraft(EMPTY_DRAFT);
      setLoadedKey('new');
    } else if (item) {
      const { id: _i, archived: _a, createdAt: _c, updatedAt: _u, ...d } = item;
      setDraft(d);
      setLoadedKey(`${item.id}-${item.updatedAt}`);
    }
  }, [item, isNew, id]);

  const save = useApiMutation(async (d: VocabDraft) =>
    isNew ? (await api.createItems([d]))[0] : api.updateItem(id!, d),
  );
  const archive = useApiMutation((v: { ids: string[]; restore: boolean }) =>
    v.restore ? api.restoreItems(v.ids) : api.archiveItems(v.ids),
  );
  const del = useApiMutation((ids: string[]) => api.deleteItems(ids));

  const [formKey, setFormKey] = useState(0);
  const submit = async () => {
    if (!draft.english.trim()) {
      toast({ tone: 'error', title: 'English word is required' });
      return;
    }
    save.mutate(draft, {
      onSuccess: (saved: VocabItem) => {
        toast({
          tone: 'success',
          title: isNew ? 'Word added' : 'Changes saved',
          body: isNew
            ? sameAlready.length
              ? `${saved.english} — flagged as a duplicate (see the Duplicates tab)`
              : `${saved.english} — add the next one`
            : 'Student schedules and history were not changed.',
        });
        if (isNew) {
          setDraft(EMPTY_DRAFT);
          setFormKey((k) => k + 1);
        } else onClose();
      },
      onError: (e) => toast({ tone: 'error', title: 'Could not save', body: String((e as Error).message) }),
    });
  };

  const others = (siblings ?? []).filter(
    (r) => r.item.id !== id && normalize(r.item.english) === normalize(item?.english ?? ''),
  );

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width={460}
      title={isNew ? 'Add a word' : (item?.english ?? '…')}
      subtitle={
        isNew
          ? 'Only English is required. Blank fields stay blank.'
          : item && (
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-faint">{item.id}</span>· updated{' '}
                {formatDateTime(item.updatedAt)}
                {item.archived && <span className="rounded bg-warn/15 px-1.5 text-[11px] text-warn">Archived</span>}
              </span>
            )
      }
      footer={
        <>
          {!isNew && item && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={item.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                onClick={() =>
                  archive.mutate(
                    { ids: [item.id], restore: item.archived },
                    {
                      onSuccess: () =>
                        toast({
                          tone: 'success',
                          title: item.archived ? 'Restored' : 'Archived',
                          body: item.archived ? undefined : 'Hidden from the bank. Student history is kept.',
                        }),
                    },
                  )
                }
              >
                {item.archived ? 'Restore' : 'Archive'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-3.5" />}
                className="text-danger/80 hover:text-danger"
                onClick={async () => {
                  const confirmed = await confirm({
                    title: `Delete “${item.english}” permanently?`,
                    body: 'Items that already have review history cannot be deleted — archive them instead so the history is kept. This cannot be undone.',
                    confirmLabel: 'Delete',
                    danger: true,
                  });
                  if (!confirmed) return;
                  del.mutate([item.id], {
                    onSuccess: (r) =>
                      r.blocked
                        ? toast({
                            tone: 'error',
                            title: 'Not deleted',
                            body: 'This word has review history. Archive it instead.',
                          })
                        : (toast({ tone: 'success', title: 'Deleted' }), onClose()),
                  });
                }}
              >
                Delete
              </Button>
            </>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Save className="size-3.5" />}
            loading={save.isPending}
            onClick={submit}
            kbd="Ctrl ↵"
          >
            {isNew ? 'Add' : 'Save'}
          </Button>
        </>
      }
    >
      <div onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && (e.preventDefault(), submit())}>
        {loadedKey && <VocabForm key={`${loadedKey}-${formKey}`} draft={draft} onChange={setDraft} autoFocus />}
        {sameAlready.length > 0 && (
          <div className="mt-5 rounded-lg border border-warn/30 bg-warn/[0.06] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-warn">
              <Copy className="size-3.5" /> Already in the bank — it will be added and flagged as a duplicate
            </div>
            <div className="grid gap-1">
              {sameAlready.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpen(m.id)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-surface-3"
                >
                  <CefrBadge cefr={m.cefr} />
                  <span className="font-semibold">{m.english}</span>
                  {m.partOfSpeech && <span className="text-muted">{m.partOfSpeech}</span>}
                  <span className="text-fg-2">{m.polish.join(', ') || '—'}</span>
                  <span className="truncate text-muted">{m.definition}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {others.length > 0 && (
          <div className="mt-5 rounded-lg border border-st-review/25 bg-st-review/[0.05] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-st-review">
              <Split className="size-3.5" /> Other senses of “{item?.english}”
            </div>
            <div className="grid gap-1">
              {others.map((r) => (
                <button
                  key={r.item.id}
                  type="button"
                  onClick={() => onOpen(r.item.id)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-surface-3"
                >
                  <CefrBadge cefr={r.item.cefr} />
                  <span className="text-fg-2">{r.item.polish.join(', ') || '—'}</span>
                  <span className="truncate text-muted">{r.item.definition}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
