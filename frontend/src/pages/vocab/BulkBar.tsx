/** Actions for the selected rows: assign, add to set, edit fields, copy, archive, delete. */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ClipboardCopy,
  FolderMinus,
  FolderPlus,
  PencilLine,
  Sparkles,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import { api } from '@/api/client';
import { CEFR_LEVELS, PARTS_OF_SPEECH, type Cefr, type VocabItem } from '@/api/types';
import { useApiMutation, useSets, useStudents } from '@/hooks/api';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { Button } from '@/components/ui/Button';
import { Dialog, MenuItem, MenuLabel, MenuSep, Popover } from '@/components/ui/Overlay';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import {
  COPY_FIELDS_LABEL,
  copyText,
  countEmptyForCopy,
  formatCopy,
  type CopyFields,
  type CopyLayout,
} from '@/lib/copyFormats';

/** The bar shown while rows are selected. */
export function BulkBar({
  items,
  onClear,
  setId,
  studentId,
}: {
  items: VocabItem[];
  onClear: () => void;
  setId: string | null;
  studentId: string | null;
}) {
  const ids = items.map((i) => i.id);
  const count = ids.length;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { studentId: lessonStudent } = useCurrentStudent();
  const [dialog, setDialog] = useState<null | 'assign' | 'set' | 'edit'>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [layout, setLayout] = useState<CopyLayout>('lines');
  const archive = useApiMutation((restore: boolean) => (restore ? api.restoreItems(ids) : api.archiveItems(ids)));
  const removeFromSet = useApiMutation(() => api.removeFromSet(setId!, ids));
  const allArchived = items.every((i) => i.archived);
  const target = studentId ?? lessonStudent;

  const doCopy = async (f: CopyFields) => {
    await copyText(formatCopy(items, f, layout));
    setCopyOpen(false);
    const empty = countEmptyForCopy(items, f);
    toast({
      tone: 'success',
      title: `Copied ${layout === 'lines' ? count - empty : count} item(s)`,
      body: [
        COPY_FIELDS_LABEL[f],
        layout === 'lines' ? 'one per line' : 'tab-separated',
        empty > 0 && `nothing to copy for ${empty}${layout === 'lines' ? ' (left out)' : ''}`,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  };

  const handoff = (path: string) => {
    sessionStorage.setItem('lexis.selection', JSON.stringify(ids));
    navigate(path);
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
        <div className="pointer-events-auto flex animate-pop items-center gap-1 rounded-xl border border-line-2 bg-surface-2/95 p-1.5 pl-3 shadow-pop backdrop-blur">
          <span className="mr-2 text-[13px] font-semibold tabular-nums">
            <span className="text-accent">{count}</span> selected
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={<UserPlus className="size-3.5" />}
            onClick={() => setDialog('assign')}
          >
            Assign
          </Button>
          <Button size="sm" variant="ghost" icon={<FolderPlus className="size-3.5" />} onClick={() => setDialog('set')}>
            Add to set
          </Button>
          {setId && (
            <Button
              size="sm"
              variant="ghost"
              icon={<FolderMinus className="size-3.5" />}
              onClick={() =>
                removeFromSet.mutate(undefined, {
                  onSuccess: (k) => (
                    toast({ tone: 'success', title: `Removed ${k} from the set`, body: 'The words stay in the bank.' }),
                    onClear()
                  ),
                })
              }
            >
              Remove from set
            </Button>
          )}
          <Button
            ref={copyRef}
            size="sm"
            variant="ghost"
            icon={<ClipboardCopy className="size-3.5" />}
            onClick={() => setCopyOpen((v) => !v)}
          >
            Copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<PencilLine className="size-3.5" />}
            onClick={() => setDialog('edit')}
          >
            Edit
          </Button>
          <span className="mx-1 h-5 w-px bg-line-2" />
          <Button
            size="sm"
            variant="ghost"
            icon={<Sparkles className="size-3.5 text-accent" />}
            onClick={() => handoff(`/batch?source=selection${target ? `&student=${target}` : ''}`)}
          >
            Revision batch
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Zap className="size-3.5 text-accent" />}
            disabled={!target}
            title={target ? undefined : 'Choose a student first'}
            onClick={() => handoff(`/review?student=${target}&source=selection`)}
          >
            Review
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={allArchived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
            onClick={async () => {
              if (
                !allArchived &&
                !(await confirm({
                  title: `Archive ${count} word(s)?`,
                  body: 'Archived words are hidden from the bank and from new reviews. All student history is kept and you can restore them at any time.',
                  confirmLabel: 'Archive',
                }))
              )
                return;
              archive.mutate(allArchived, {
                onSuccess: (k) => (
                  toast({ tone: 'success', title: `${allArchived ? 'Restored' : 'Archived'} ${k} word(s)` }),
                  onClear()
                ),
              });
            }}
          >
            {allArchived ? 'Restore' : 'Archive'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-7 px-0"
            aria-label="Clear selection (Esc)"
            title="Clear selection (Esc)"
            icon={<X className="size-3.5" />}
            onClick={onClear}
          />
        </div>
      </div>

      <Popover anchor={copyRef.current} open={copyOpen} onClose={() => setCopyOpen(false)} className="w-[270px]">
        <div className="p-1.5">
          <Segmented
            size="sm"
            className="w-full"
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'lines', label: 'One per line' },
              { value: 'tsv', label: 'Table (tabs)' },
            ]}
          />
        </div>
        <MenuSep />
        <MenuLabel>Copy as plain text</MenuLabel>
        {(Object.keys(COPY_FIELDS_LABEL) as CopyFields[]).map((f) => (
          <MenuItem key={f} onClick={() => doCopy(f)}>
            {COPY_FIELDS_LABEL[f]}
          </MenuItem>
        ))}
      </Popover>

      <AssignDialog
        open={dialog === 'assign'}
        onClose={() => setDialog(null)}
        ids={ids}
        defaultStudent={target}
        onDone={onClear}
      />
      <AddToSetDialog open={dialog === 'set'} onClose={() => setDialog(null)} ids={ids} />
      <BulkEditDialog open={dialog === 'edit'} onClose={() => setDialog(null)} ids={ids} />
    </>
  );
}

function AssignDialog({
  open,
  onClose,
  ids,
  defaultStudent,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ids: string[];
  defaultStudent: string | null;
  onDone: () => void;
}) {
  const { data: students } = useStudents();
  const [studentId, setStudentId] = useState('');
  const toast = useToast();
  const assign = useApiMutation((sid: string) => api.assign(sid, ids));
  const chosen = studentId || defaultStudent || '';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Assign ${ids.length} word(s)`}
      description="Words the student already has are skipped — no duplicates are created."
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
              assign.mutate(chosen, {
                onSuccess: (r) => {
                  const name = students?.find((s) => s.student.id === chosen)?.student.name;
                  toast({
                    tone: 'success',
                    title: `${r.created} new word(s) assigned to ${name}`,
                    body:
                      [
                        r.alreadyAssigned && `${r.alreadyAssigned} already assigned (skipped)`,
                        r.restored && `${r.restored} restored with their history`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined,
                  });
                  onClose();
                  onDone();
                },
              })
            }
          >
            Assign
          </Button>
        </>
      }
    >
      <label className="label" htmlFor="as-st">
        Student
      </label>
      <Select id="as-st" value={chosen} onChange={(e) => setStudentId(e.target.value)}>
        <option value="">Choose a student…</option>
        {students
          ?.filter((s) => s.student.active)
          .map((s) => (
            <option key={s.student.id} value={s.student.id}>
              {s.student.name} — {s.total} words
            </option>
          ))}
      </Select>
    </Dialog>
  );
}

function AddToSetDialog({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const { data: sets } = useSets();
  const [setId, setSetId] = useState('');
  const [newName, setNewName] = useState('');
  const toast = useToast();
  const add = useApiMutation(async () => {
    if (setId === '__new') {
      const createdSet = await api.createSet(newName, null, ids);
      return { added: createdSet.itemIds.length, already: 0, name: createdSet.name };
    }
    const result = await api.addToSet(setId, ids);
    return { ...result, name: sets?.find((s) => s.id === setId)?.name };
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Add ${ids.length} word(s) to a set`}
      description="A set only points at words — nothing is copied or duplicated."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!setId || (setId === '__new' && !newName.trim())}
            loading={add.isPending}
            onClick={() =>
              add.mutate(undefined, {
                onSuccess: (r) => {
                  toast({
                    tone: 'success',
                    title: `Added ${r.added} to ${r.name}`,
                    body: r.already ? `${r.already} were already in it` : undefined,
                  });
                  onClose();
                  setNewName('');
                },
                onError: (e) => toast({ tone: 'error', title: (e as Error).message }),
              })
            }
          >
            Add
          </Button>
        </>
      }
    >
      <label className="label" htmlFor="set-pick">
        Set
      </label>
      <Select id="set-pick" value={setId} onChange={(e) => setSetId(e.target.value)}>
        <option value="">Choose a set…</option>
        {sets?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.itemIds.length})
          </option>
        ))}
        <option value="__new">+ New set…</option>
      </Select>
      {setId === '__new' && (
        <input
          autoFocus
          className="field mt-2"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New set name, e.g. John's Exam Vocabulary"
        />
      )}
    </Dialog>
  );
}

function BulkEditDialog({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const [cefr, setCefr] = useState<string>('keep');
  const [pos, setPos] = useState<string>('keep');
  const [addTopic, setAddTopic] = useState('');
  const [removeTopic, setRemoveTopic] = useState('');
  const toast = useToast();
  const edit = useApiMutation(() =>
    api.bulkUpdate(ids, {
      ...(cefr !== 'keep' ? { cefr: cefr === 'none' ? null : (cefr as Cefr) } : {}),
      ...(pos !== 'keep' ? { partOfSpeech: pos === 'none' ? null : pos } : {}),
      addTopics: addTopic
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      removeTopics: removeTopic
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }),
  );
  const changes = [
    cefr !== 'keep' && 'CEFR',
    pos !== 'keep' && 'part of speech',
    addTopic.trim() && 'add topic',
    removeTopic.trim() && 'remove topic',
  ].filter(Boolean);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit ${ids.length} word(s)`}
      description="Only the fields you change are written. Text fields (English, Polish, definition) are never bulk-edited."
      footer={
        <>
          <span className="mr-auto text-[12px] text-muted">
            {changes.length ? `Will change: ${changes.join(', ')} on ${ids.length} word(s)` : 'No changes yet'}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!changes.length}
            loading={edit.isPending}
            onClick={() =>
              edit.mutate(undefined, {
                onSuccess: (k) => (toast({ tone: 'success', title: `Updated ${k} word(s)` }), onClose()),
              })
            }
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="be-cefr">
            CEFR level
          </label>
          <Select id="be-cefr" value={cefr} onChange={(e) => setCefr(e.target.value)}>
            <option value="keep">Keep as is</option>
            {CEFR_LEVELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="none">Clear</option>
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="be-pos">
            Part of speech
          </label>
          <Select id="be-pos" value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="keep">Keep as is</option>
            {PARTS_OF_SPEECH.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="none">Clear</option>
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="be-add">
            Add topic(s)
          </label>
          <input
            id="be-add"
            className="field"
            value={addTopic}
            onChange={(e) => setAddTopic(e.target.value)}
            placeholder="Exam, Cooking"
          />
        </div>
        <div>
          <label className="label" htmlFor="be-rm">
            Remove topic(s)
          </label>
          <input id="be-rm" className="field" value={removeTopic} onChange={(e) => setRemoveTopic(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
