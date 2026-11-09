/** Settings: FSRS display thresholds, shortcuts, backup and restore, exports, data location. */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArchiveRestore,
  Brain,
  HardDrive,
  DatabaseBackup,
  Download,
  HardDriveDownload,
  Keyboard,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { api } from '@/api/client';
import type { Settings, ShortcutAction } from '@/api/types';
import { useApiMutation, useBackups, useSettings, queryKeys } from '@/hooks/api';
import { downloadText } from '@/hooks/download';
import { DEFAULT_SETTINGS } from '@/api/mock/mockApi';
import { Button } from '@/components/ui/Button';
import { PageHeader, Spinner, keyLabel } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { cn } from '@/components/ui/cn';
import { formatDateTime } from '@/lib/dates';
import { DEFAULT_RETENTION, describeRetention, MAX_RETENTION, MIN_RETENTION } from '@/lib/retention';

const SHORTCUTS: { action: ShortcutAction; label: string }[] = [
  { action: 'again', label: 'Rate Again' },
  { action: 'hard', label: 'Rate Hard' },
  { action: 'good', label: 'Rate Good' },
  { action: 'easy', label: 'Rate Easy' },
  { action: 'next', label: 'Next word' },
  { action: 'previous', label: 'Previous word' },
  { action: 'reveal', label: 'Reveal / hide all' },
  { action: 'revealPolish', label: 'Reveal Polish' },
  { action: 'revealDefinition', label: 'Reveal definition' },
  { action: 'revealExample', label: 'Reveal example' },
];

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Settings page. */
export function SettingsPage() {
  const { data: saved } = useSettings();
  const [draft, setDraft] = useState<Settings | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  useEffect(() => saved && setDraft(saved), [saved]);
  const save = useApiMutation((v: Settings) => api.saveSettings(v));
  const { data: backups = [] } = useBackups();
  const backup = useApiMutation(() => api.createBackup());
  const restoreRef = useRef<HTMLInputElement>(null);
  const { data: sys } = useQuery({ queryKey: ['system'], queryFn: api.system });

  if (!draft)
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    );
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const keys = Object.values(draft.shortcuts);
  const clash = (k: string) => keys.filter((x) => x.toLowerCase() === k.toLowerCase()).length > 1;

  const persist = () =>
    save.mutate(draft, {
      onSuccess: (v) => {
        queryClient.setQueryData(queryKeys.settings, v);
        queryClient.removeQueries({ queryKey: ['preview'] });
        toast({ tone: 'success', title: 'Settings saved' });
      },
    });

  const restore = async (f: File) => {
    if (
      !(await confirm({
        title: `Restore “${f.name}”?`,
        body: 'Everything in the app will be replaced by this backup. A safety backup of the current data is saved first, so this can be undone.',
        confirmLabel: 'Restore',
        danger: true,
      }))
    )
      return;
    try {
      const result = await api.restoreBackup(f);
      await queryClient.invalidateQueries();
      toast({
        tone: 'success',
        title: 'Backup restored',
        body: result.safetyBackup ? `Previous data saved as ${result.safetyBackup}` : undefined,
      });
    } catch (e) {
      toast({ tone: 'error', title: 'Restore failed — nothing was changed', body: (e as Error).message });
    } finally {
      if (restoreRef.current) restoreRef.current.value = '';
    }
  };

  const download = (b: { fileName: string; url?: string; content?: string }) => {
    if (b.url) {
      const link = document.createElement('a');
      link.href = b.url;
      link.download = b.fileName;
      link.click();
    } else if (b.content) downloadText(b.fileName, b.content, 'application/json');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={<Settings2 />}
        title="Settings"
        subtitle="Shortcuts, scheduling labels, backup and export"
        actions={
          <>
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(saved!)}>
                Discard
              </Button>
            )}
            <Button variant="primary" size="sm" disabled={!dirty} loading={save.isPending} onClick={persist}>
              Save changes
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1080px] gap-5 px-6 py-6 lg:grid-cols-2">
          <Card
            icon={<Keyboard />}
            title="Review keyboard shortcuts"
            desc="Click a box, then press the key you want. Shortcuts never fire while you are typing in a field."
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {SHORTCUTS.map(({ action, label }) => (
                <div key={action} className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-fg-2">{label}</span>
                  <KeyCapture
                    value={draft.shortcuts[action]}
                    clash={clash(draft.shortcuts[action])}
                    onChange={(k) => setDraft({ ...draft, shortcuts: { ...draft.shortcuts, [action]: k } })}
                  />
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="mt-3"
              icon={<RotateCcw className="size-3" />}
              onClick={() => setDraft({ ...draft, shortcuts: DEFAULT_SETTINGS.shortcuts })}
            >
              Restore defaults
            </Button>
          </Card>

          <Card
            icon={<Brain />}
            title="FSRS scheduling"
            desc="Stock FSRS: the algorithm is never modified. Review frequency uses FSRS's own setting. The four boxes at the bottom only change labels and filters, never the schedule."
          >
            <dl className="mb-4 grid grid-cols-[130px_1fr] gap-y-1.5 text-[12px]">
              <dt className="text-muted">Library</dt>
              <dd>
                {api.mode === 'http' ? `py-fsrs ${sys?.fsrsVersion ?? ''}` : 'ts-fsrs 6 (demo preview)'} — stock,
                unmodified
              </dd>
              <dt className="text-muted">Ratings</dt>
              <dd>Again = 1 · Hard = 2 · Good = 3 · Easy = 4</dd>
              <dt className="text-muted">Time zone</dt>
              <dd>Stored in UTC · shown in {TIME_ZONE}</dd>
              <dt className="text-muted">“Due today”</dt>
              <dd>Due before local midnight tonight</dd>
            </dl>
            <ReviewFrequency
              value={draft.desiredRetention}
              unsaved={draft.desiredRetention !== saved?.desiredRetention}
              onChange={(desiredRetention) => setDraft({ ...draft, desiredRetention })}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Mastered at stability ≥ (days)"
                value={draft.masteredStabilityDays}
                min={1}
                max={3650}
                onChange={(v) => setDraft({ ...draft, masteredStabilityDays: v })}
              />
              <NumberField
                label="Due soon = within (days)"
                value={draft.dueSoonDays}
                min={1}
                max={30}
                onChange={(v) => setDraft({ ...draft, dueSoonDays: v })}
              />
              <NumberField
                label="Difficult at lapses ≥"
                value={draft.difficultLapses}
                min={1}
                max={50}
                onChange={(v) => setDraft({ ...draft, difficultLapses: v })}
              />
              <NumberField
                label="…or FSRS difficulty ≥ (1–10)"
                value={draft.difficultDifficulty}
                min={1}
                max={10}
                step={0.5}
                onChange={(v) => setDraft({ ...draft, difficultDifficulty: v })}
              />
            </div>
          </Card>

          <Card
            icon={<DatabaseBackup />}
            title="Backup & restore"
            desc={`Lexis backs up automatically every time it starts and before every update, keeping the last ${draft.autoBackupKeep}. “Back up now” also downloads a copy you can keep anywhere — a USB stick or a cloud folder.`}
          >
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon={<HardDriveDownload className="size-3.5" />}
                loading={backup.isPending}
                onClick={() =>
                  backup.mutate(undefined, {
                    onSuccess: (b) => (
                      download(b),
                      toast({
                        tone: 'success',
                        title: 'Backup saved',
                        body: `${b.fileName} — kept in the backups folder and downloaded`,
                      })
                    ),
                  })
                }
              >
                Back up now
              </Button>
              <Button
                variant="outline"
                icon={<ArchiveRestore className="size-3.5" />}
                onClick={() => restoreRef.current?.click()}
              >
                Restore from file…
              </Button>
              <input
                ref={restoreRef}
                type="file"
                accept={api.mode === 'http' ? '.db' : '.json,application/json'}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
              />
            </div>
            <div className="mt-4 max-h-[180px] overflow-y-auto rounded-md border border-line">
              {backups.length ? (
                backups.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 border-b border-line/60 px-3 py-1.5 text-[12px] last:border-0"
                  >
                    <span className="truncate font-mono text-fg-2">{b.fileName}</span>
                    <span className="rounded bg-surface-3 px-1.5 text-[10px] text-muted">{b.reason}</span>
                    <span className="ml-auto text-muted">{formatDateTime(b.at)}</span>
                    <span className="w-14 text-right text-faint">{(b.sizeBytes / 1024).toFixed(0)} KB</span>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-[12px] text-muted">No backups yet</div>
              )}
            </div>
            <div className="mt-2 text-[11px] text-faint">Keeps the last {draft.autoBackupKeep} automatic backups.</div>
          </Card>

          <Card
            icon={<Download />}
            title="Export to CSV"
            desc="For portability and inspection. Opens in Excel; UTF-8 with Polish letters intact."
          >
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['vocabulary', 'Vocabulary bank'],
                  ['students', 'Students'],
                  ['cards', 'Assignments & FSRS state'],
                  ['history', 'Review history'],
                ] as const
              ).map(([k, l]) => (
                <Button
                  key={k}
                  variant="outline"
                  className="justify-start"
                  icon={<Download className="size-3.5" />}
                  onClick={async () => {
                    const exported = await api.exportCsv(k);
                    downloadText(exported.fileName, exported.content, 'text/csv;charset=utf-8');
                  }}
                >
                  {l}
                </Button>
              ))}
            </div>
          </Card>

          <Card icon={<ShieldCheck />} title="Privacy" desc="">
            <ul className="grid gap-1.5 text-[12px] text-fg-2">
              <li>• Runs only on this computer at 127.0.0.1 — not reachable from Wi-Fi or the internet.</li>
              <li>• No accounts, no cloud, no AI or paid services. Works offline.</li>
              <li>• The database lives in your Windows user folder.</li>
            </ul>
          </Card>

          {api.mode === 'mock' ? (
            <Card
              icon={<RotateCcw />}
              title="Demo data"
              desc="This preview runs on sample data stored in the browser. The real app uses the local database."
            >
              <Button
                variant="danger"
                size="sm"
                icon={<Upload className="size-3.5 rotate-180" />}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: 'Reset all demo data?',
                      body: 'All words, students and reviews in this preview go back to the sample data.',
                      confirmLabel: 'Reset',
                      danger: true,
                    }))
                  )
                    return;
                  await api.resetDemoData();
                  await queryClient.invalidateQueries();
                  toast({ tone: 'success', title: 'Demo data reset' });
                }}
              >
                Reset demo data
              </Button>
            </Card>
          ) : (
            <Card icon={<HardDrive />} title="Data & version" desc="Where your data lives on this computer.">
              <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[12px]">
                <dt className="text-muted">Database</dt>
                <dd className="break-all font-mono text-[11px]">{sys?.dbPath ?? '…'}</dd>
                <dt className="text-muted">Backups</dt>
                <dd className="break-all font-mono text-[11px]">
                  {sys ? `${sys.dataDir}${sys.dataDir.includes('\\') ? '\\' : '/'}backups` : '…'}
                </dd>
                <dt className="text-muted">Version</dt>
                <dd>
                  Lexis {sys?.version} · schema {sys?.schemaRevision}
                </dd>
                <dt className="text-muted">Contents</dt>
                <dd>
                  {sys?.items ?? 0} words · {sys?.students ?? 0} students
                </dd>
              </dl>
              {sys && sys.items === 0 && sys.students === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={async () => {
                    try {
                      await api.loadSampleData();
                      await queryClient.invalidateQueries();
                      toast({
                        tone: 'success',
                        title: 'Sample data loaded',
                        body: '71 words, 3 sets and 2 students to try the app with.',
                      });
                    } catch (e) {
                      toast({ tone: 'error', title: (e as Error).message });
                    }
                  }}
                >
                  Load sample data to try the app
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-accent [&>svg]:size-4">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-[14px] font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 text-[12px] text-muted">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** How often words come back: FSRS's desired retention as a slider, with a reset to the default. */
function ReviewFrequency({
  value,
  unsaved,
  onChange,
}: {
  value: number;
  unsaved: boolean;
  onChange: (retention: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <div className="mb-4 rounded-md border border-line bg-bg-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="review-frequency" className="text-[13px] font-semibold">
          Review frequency
        </label>
        <span className="font-mono text-[12px] tabular-nums text-fg-2">
          {percent}% retention{value === DEFAULT_RETENTION ? ' (default)' : ''}
        </span>
      </div>
      <input
        id="review-frequency"
        type="range"
        className="mt-2 w-full accent-[var(--color-accent)]"
        min={MIN_RETENTION * 100}
        max={MAX_RETENTION * 100}
        step={1}
        value={percent}
        aria-valuetext={`${percent}% retention`}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <div className="flex justify-between text-[11px] text-faint">
        <span>Less often</span>
        <span>More often</span>
      </div>
      <p className="mt-2 text-[12px] text-fg-2">{describeRetention(value)}</p>
      <p className="mt-1 text-[11px] text-muted">
        The chance a student still remembers a word when it comes due. Applies to all students from each word's next
        rating; due dates already set do not move.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Button
          variant="ghost"
          size="xs"
          icon={<RotateCcw className="size-3" />}
          disabled={value === DEFAULT_RETENTION}
          onClick={() => onChange(DEFAULT_RETENTION)}
        >
          Reset to default ({DEFAULT_RETENTION * 100}%)
        </Button>
        {unsaved && <span className="text-[11px] text-warn">Press Save changes to apply</span>}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="label normal-case tracking-normal">{label}</span>
      <input
        type="number"
        className="field tabular-nums"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (Number.isFinite(value)) onChange(Math.min(max, Math.max(min, value)));
        }}
      />
    </label>
  );
}

function KeyCapture({ value, onChange, clash }: { value: string; onChange: (k: string) => void; clash: boolean }) {
  const [listening, setListening] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setListening(true)}
      onBlur={() => setListening(false)}
      onKeyDown={(e) => {
        if (!listening) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') return setListening(false);
        if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
        onChange(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        setListening(false);
      }}
      title={clash ? 'This key is used twice' : 'Click, then press a key'}
      className={cn(
        'h-7 min-w-[86px] rounded-md border px-2 font-mono text-[12px] transition-colors',
        listening
          ? 'animate-pulse border-accent bg-accent-soft text-accent'
          : clash
            ? 'border-danger/60 text-danger'
            : 'border-line-2 bg-bg-2 text-fg hover:border-faint',
      )}
    >
      {listening ? 'press a key…' : keyLabel(value)}
    </button>
  );
}
