/** Create, rename, delete and open reusable word sets. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layers, Pencil, Plus, Sparkles, Table2, Trash2, UserPlus, X, Zap } from 'lucide-react';
import { api } from '@/api/client';
import { EMPTY_QUERY } from '@/api/types';
import { useApiMutation, useSets, useStudents, useVocab } from '@/hooks/api';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Overlay';
import { Select } from '@/components/ui/Select';
import { CefrBadge } from '@/components/ui/Badge';
import { Empty, PageHeader, Spinner } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { cn } from '@/components/ui/cn';

/** Sets page. */
export function SetsPage() {
  const { data: sets, isLoading } = useSets();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id') ?? sets?.[0]?.id ?? null;
  const set = sets?.find((s) => s.id === selectedId) ?? null;
  const [dialog, setDialog] = useState<null | 'new' | 'rename' | 'assign'>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { studentId: lesson } = useCurrentStudent();
  const { data: rows = [], isLoading: loadingRows } = useVocab({ ...EMPTY_QUERY, setId: selectedId });
  const remove = useApiMutation((ids: string[]) => api.removeFromSet(selectedId!, ids));
  const del = useApiMutation((id: string) => api.deleteSet(id));
  const select = (id: string) => setParams({ id }, { replace: true });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={<Layers />}
        title="Sets"
        subtitle="Reusable collections. A set only points at words — a word can be in many sets and is never duplicated."
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDialog('new')}>
            New set
          </Button>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-r border-line p-2">
          {isLoading && <Spinner className="m-3" />}
          {sets?.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                s.id === selectedId ? 'bg-surface-3' : 'hover:bg-surface',
              )}
            >
              <div
                className={cn(
                  'grid size-8 place-items-center rounded-lg border',
                  s.id === selectedId
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-line bg-surface-2 text-muted',
                )}
              >
                <Layers className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{s.name}</div>
                <div className="truncate text-[11px] text-muted">{s.description || 'No description'}</div>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-faint">{s.itemIds.length}</span>
            </button>
          ))}
          {sets && !sets.length && (
            <Empty title="No sets yet" body="Create one, or select words in the bank and choose “Add to set”." />
          )}
        </aside>

        {set ? (
          <section className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-[17px] font-semibold">{set.name}</h2>
                <div className="text-[12px] text-muted">
                  {set.itemIds.length} words{set.description ? ` · ${set.description}` : ''}
                </div>
              </div>
              <IconButton label="Rename" icon={<Pencil className="size-3.5" />} onClick={() => setDialog('rename')} />
              <IconButton
                label="Delete set"
                icon={<Trash2 className="size-3.5" />}
                className="hover:text-danger"
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete the set “${set.name}”?`,
                      body: 'Only the set is removed. Its words stay in the bank and student assignments are not changed.',
                      confirmLabel: 'Delete set',
                      danger: true,
                    })
                  )
                    del.mutate(set.id, {
                      onSuccess: () => (setParams({}), toast({ tone: 'success', title: 'Set deleted' })),
                    });
                }}
              />
              <span className="mx-1 h-5 w-px bg-line" />
              <Button
                variant="ghost"
                size="sm"
                icon={<Table2 className="size-3.5" />}
                onClick={() => navigate(`/vocab?set=${set.id}`)}
              >
                Open in bank
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Sparkles className="size-3.5" />}
                onClick={() => navigate(`/batch?source=set`)}
              >
                Batch
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Zap className="size-3.5" />}
                disabled={!lesson}
                title={lesson ? undefined : 'Choose a “Lesson with” student first'}
                onClick={() => navigate(`/review?student=${lesson}&source=set&set=${set.id}&go=0`)}
              >
                Review
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<UserPlus className="size-3.5" />}
                onClick={() => setDialog('assign')}
              >
                Assign set
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loadingRows ? (
                <Spinner className="m-5" />
              ) : !rows.length ? (
                <Empty
                  icon={<Layers />}
                  title="This set is empty"
                  body="Open the vocabulary bank, select words and choose “Add to set”."
                  action={<Button onClick={() => navigate('/vocab')}>Go to the bank</Button>}
                />
              ) : (
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-bg-2/95 text-[11px] uppercase tracking-wider text-muted backdrop-blur">
                    <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                      <th>English</th>
                      <th>Polish</th>
                      <th>Definition</th>
                      <th>CEFR</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.item.id}
                        className="group border-t border-line/60 hover:bg-surface-2 [&>td]:px-4 [&>td]:py-1.5"
                      >
                        <td className="font-semibold">{r.item.english}</td>
                        <td className="text-fg-2">{r.item.polish.join(', ')}</td>
                        <td className="max-w-[360px] truncate text-[12px] text-muted">{r.item.definition}</td>
                        <td>
                          <CefrBadge cefr={r.item.cefr} />
                        </td>
                        <td>
                          <IconButton
                            label="Remove from set"
                            size="xs"
                            icon={<X className="size-3" />}
                            className="opacity-0 group-hover:opacity-100"
                            onClick={() => remove.mutate([r.item.id])}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        ) : (
          !isLoading && <Empty icon={<Layers />} title="Choose a set" />
        )}
      </div>

      <SetDialog
        open={dialog === 'new' || dialog === 'rename'}
        mode={dialog === 'rename' ? 'rename' : 'new'}
        set={dialog === 'rename' ? set : null}
        onClose={() => setDialog(null)}
        onCreated={select}
      />
      {set && (
        <AssignSetDialog
          open={dialog === 'assign'}
          onClose={() => setDialog(null)}
          setName={set.name}
          itemIds={set.itemIds}
        />
      )}
    </div>
  );
}

function SetDialog({
  open,
  mode,
  set,
  onClose,
  onCreated,
}: {
  open: boolean;
  mode: 'new' | 'rename';
  set: { id: string; name: string; description: string | null } | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const toast = useToast();
  useEffect(() => {
    if (open) {
      setName(set?.name ?? '');
      setDesc(set?.description ?? '');
    }
  }, [open, set]);
  const save = useApiMutation(() =>
    mode === 'rename' && set
      ? api.updateSet(set.id, { name, description: desc || null })
      : api.createSet(name, desc || null),
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'new' ? 'New set' : 'Rename set'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            loading={save.isPending}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: (s) => (onCreated(s.id), onClose()),
                onError: (e) => toast({ tone: 'error', title: (e as Error).message }),
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div>
          <label className="label" htmlFor="set-name">
            Name
          </label>
          <input
            id="set-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. A2 Cooking"
          />
        </div>
        <div>
          <label className="label" htmlFor="set-desc">
            Description
          </label>
          <input id="set-desc" className="field" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function AssignSetDialog({
  open,
  onClose,
  setName,
  itemIds,
}: {
  open: boolean;
  onClose: () => void;
  setName: string;
  itemIds: string[];
}) {
  const { data: students } = useStudents();
  const { studentId: lesson } = useCurrentStudent();
  const [sid, setSid] = useState('');
  const toast = useToast();
  const chosen = sid || lesson || '';
  const assign = useApiMutation(() => api.assign(chosen, itemIds));
  const name = useMemo(() => students?.find((s) => s.student.id === chosen)?.student.name, [students, chosen]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Assign “${setName}”`}
      description={`${itemIds.length} words. Words the student already has are skipped.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!chosen}
            loading={assign.isPending}
            onClick={() =>
              assign.mutate(undefined, {
                onSuccess: (r) => {
                  toast({
                    tone: 'success',
                    title: `${r.created} new word(s) assigned to ${name}`,
                    body: r.alreadyAssigned ? `${r.alreadyAssigned} already assigned — skipped` : undefined,
                  });
                  onClose();
                },
              })
            }
          >
            Assign
          </Button>
        </>
      }
    >
      <Select aria-label="Student" value={chosen} onChange={(e) => setSid(e.target.value)}>
        <option value="">Choose a student…</option>
        {students
          ?.filter((s) => s.student.active)
          .map((s) => (
            <option key={s.student.id} value={s.student.id}>
              {s.student.name}
            </option>
          ))}
      </Select>
    </Dialog>
  );
}
