/**
 * Duplicate cleanup: every word that is in the bank more than once (same English and part of speech),
 * grouped. Duplicates are only flagged when they are added; the teacher cleans them up here when there
 * is time, by removing copies one by one, merging a group into one copy, or keeping a group as
 * different meanings (BANK: money / river).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Pencil, Search, Split, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { DuplicateGroup, DuplicateGroupItem, ID } from '@/api/types';
import { useApiMutation } from '@/hooks/api';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { CefrBadge } from '@/components/ui/Badge';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { Empty, PageHeader, Spinner } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { normalize } from '@/lib/search';
import { ItemEditor } from '../vocab/ItemEditor';

const groupKey = (group: DuplicateGroup) =>
  group.items
    .map((row) => row.item.id)
    .sort()
    .join('|');

/** The Duplicates tab. */
export function DuplicatesPage() {
  const { data: groups, isLoading } = useQuery({ queryKey: ['duplicates'], queryFn: api.duplicateGroups });
  const [filter, setFilter] = useState('');
  const [keep, setKeep] = useState<Record<string, ID>>({});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ID | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const merge = useApiMutation((body: { keepId: ID; removeIds: ID[] }[]) => api.mergeDuplicates(body));
  const dismiss = useApiMutation((ids: ID[]) => api.dismissDuplicates(ids));
  // A copy with review history cannot be deleted (the history would be lost), so it is archived instead.
  const remove = useApiMutation(async (id: ID) => {
    const { deleted } = await api.deleteItems([id]);
    if (!deleted) await api.archiveItems([id]);
    return deleted ? 'deleted' : 'archived';
  });

  const shown = useMemo(() => {
    const q = normalize(filter);
    return (groups ?? []).filter((group) => !q || normalize(group.english).includes(q));
  }, [groups, filter]);
  const copies = (groups ?? []).reduce((n, group) => n + group.items.length - 1, 0);

  const plan = (groups ?? [])
    .filter((group) => chosen.has(groupKey(group)))
    .map((group) => {
      const keepId = keep[groupKey(group)] ?? group.keepId;
      return { keepId, removeIds: group.items.map((row) => row.item.id).filter((id) => id !== keepId) };
    });
  const merging = plan.reduce((n, group) => n + group.removeIds.length, 0);

  const toggle = (key: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const removeCopy = async (group: DuplicateGroup, row: DuplicateGroupItem) => {
    const ok = await confirm({
      title: `Remove this copy of “${row.item.english}”?`,
      body: (
        <>
          {row.item.polish.join(', ') || 'No Polish'}
          {row.item.cefr && ` · ${row.item.cefr}`}
          {row.item.definition && ` — ${row.item.definition}`}
          <br />
          <br />
          {row.reviews > 0
            ? 'This copy has review history, so it will be archived (hidden, history kept) instead of deleted.'
            : `It is deleted from the bank${row.sets ? ' and from its sets' : ''}. The other ${
                group.items.length - 1
              } cop${group.items.length === 2 ? 'y stays' : 'ies stay'}.`}
        </>
      ),
      confirmLabel: row.reviews > 0 ? 'Archive' : 'Remove',
      danger: true,
    });
    if (!ok) return;
    remove.mutate(row.item.id, {
      onSuccess: (how) => toast({ tone: 'success', title: `${row.item.english}: one copy ${how}` }),
      onError: (e) => toast({ tone: 'error', title: 'Could not remove', body: String((e as Error).message) }),
    });
  };

  const runMerge = async () => {
    const ok = await confirm({
      title: `Merge ${plan.length} group(s)?`,
      body: (
        <>
          {merging} extra cop{merging === 1 ? 'y' : 'ies'} will be merged into the copy you keep in each group. Their
          sets, topics and student progress move onto it, and only its empty fields are filled in. A backup is a good
          idea first (Settings → Backup).
        </>
      ),
      confirmLabel: 'Merge',
    });
    if (!ok) return;
    merge.mutate(plan, {
      onSuccess: (result) => {
        toast({
          tone: 'success',
          title: `${result.merged} group(s) merged`,
          body:
            `${result.deleted} extra cop${result.deleted === 1 ? 'y' : 'ies'} removed` +
            (result.archived
              ? ` · ${result.archived} archived because a student already had the kept word (history kept)`
              : ''),
        });
        setChosen(new Set());
        setKeep({});
      },
      onError: (e) => toast({ tone: 'error', title: 'Could not merge', body: String((e as Error).message) }),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={<Copy />}
        title="Duplicates"
        subtitle={
          groups?.length
            ? `${groups.length} word(s) are in the bank more than once · ${copies} extra cop${copies === 1 ? 'y' : 'ies'}`
            : 'Words with the same English and part of speech are flagged here when they are added.'
        }
        actions={
          plan.length > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setChosen(new Set())}>
                Clear selection
              </Button>
              <Button variant="primary" size="sm" loading={merge.isPending} onClick={runMerge}>
                Merge {plan.length} group{plan.length === 1 ? '' : 's'}
              </Button>
            </>
          )
        }
      />
      {isLoading ? (
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      ) : !groups?.length ? (
        <Empty
          icon={<Copy />}
          title="No duplicates"
          body="Every word in the bank is there once. A word added again later will show up here."
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
            <label className="flex h-8 w-64 items-center gap-2 rounded-md border border-line bg-surface px-2.5 focus-within:border-accent">
              <Search className="size-3.5" />
              <input
                aria-label="Find a word"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a word…"
                className="flex-1 bg-transparent text-[13px] text-fg outline-none"
              />
            </label>
            <span>
              Remove the copies you don't want with <Trash2 className="inline size-3" />, or tick groups and merge them
              into the copy you keep (its learning history is kept).
            </span>
            <button
              type="button"
              className="ml-auto underline underline-offset-2 hover:text-fg"
              onClick={() => setChosen(new Set(shown.map(groupKey)))}
            >
              Tick all shown
            </button>
          </div>
          {!shown.length && (
            <div className="py-10 text-center text-[13px] text-muted">No duplicate matches “{filter}”.</div>
          )}
          <div className="grid gap-2">
            {shown.map((group) => {
              const key = groupKey(group);
              const on = chosen.has(key);
              const keepId = keep[key] ?? group.keepId;
              return (
                <section key={key} className="rounded-lg border border-line">
                  <header className="flex items-center gap-2 border-b border-line bg-bg-2/60 px-3 py-1.5">
                    <Checkbox checked={on} onChange={(v) => toggle(key, v)} label={`Merge ${group.english}`} />
                    <span className="font-semibold">{group.english}</span>
                    <span className="text-[12px] text-muted">
                      {group.items[0].item.partOfSpeech ?? 'no part of speech'} · {group.items.length} copies
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="ml-auto"
                      icon={<Split className="size-3" />}
                      loading={
                        dismiss.isPending && dismiss.variables?.join() === group.items.map((r) => r.item.id).join()
                      }
                      onClick={() =>
                        dismiss.mutate(
                          group.items.map((row) => row.item.id),
                          {
                            onSuccess: () =>
                              toast({ tone: 'success', title: `${group.english}: kept as different meanings` }),
                          },
                        )
                      }
                    >
                      Different meanings, keep all
                    </Button>
                  </header>
                  {group.items.map((row) => {
                    const kept = row.item.id === keepId;
                    return (
                      <div
                        key={row.item.id}
                        className={cn(
                          'grid grid-cols-[20px_44px_1fr_auto_auto] items-start gap-2 border-t border-line/60 px-3 py-2 text-[12px] first-of-type:border-t-0',
                          on && kept && 'bg-accent/[0.05]',
                        )}
                      >
                        <input
                          type="radio"
                          name={key}
                          aria-label={`Keep this copy of ${row.item.english} when merging`}
                          title="Keep this copy when merging"
                          checked={kept}
                          disabled={!on}
                          onChange={() => setKeep((current) => ({ ...current, [key]: row.item.id }))}
                          className={cn('mt-0.5 accent-[var(--color-accent)]', !on && 'invisible')}
                        />
                        <CefrBadge cefr={row.item.cefr} />
                        <div className="min-w-0">
                          <div className="text-fg">
                            {row.item.polish.join(', ') || <span className="text-faint">no Polish</span>}
                          </div>
                          {row.item.definition && <div className="mt-0.5 text-muted">{row.item.definition}</div>}
                          {row.item.example && <div className="mt-0.5 italic text-faint">{row.item.example}</div>}
                        </div>
                        <div className="text-right text-[11px] text-muted">
                          {on && (
                            <div className={cn('font-semibold', kept ? 'text-accent' : 'text-faint')}>
                              {kept ? 'Keep' : 'Merge into kept'}
                            </div>
                          )}
                          {row.students > 0 && <div>{row.students} student(s)</div>}
                          {row.reviews > 0 && <div>{row.reviews} review(s)</div>}
                          {row.sets > 0 && <div>in {row.sets} set(s)</div>}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={<Pencil className="size-3" />}
                            onClick={() => setEditing(row.item.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-danger"
                            icon={<Trash2 className="size-3" />}
                            loading={remove.isPending && remove.variables === row.item.id}
                            onClick={() => removeCopy(group, row)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </div>
      )}
      <ItemEditor id={editing} onClose={() => setEditing(null)} onOpen={setEditing} />
    </div>
  );
}
