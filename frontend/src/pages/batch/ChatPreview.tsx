/** Right column of the Revision batch page: the copy buttons and a preview of exactly what will be pasted. */
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  KeyRound,
  ListOrdered,
  MessageSquareText,
  RefreshCw,
  X,
} from 'lucide-react';
import type { VocabItem } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Empty, Spinner } from '@/components/ui/misc';
import type { BatchFormatOptions, BatchLine } from '@/lib/batchFormat';

/** What was just copied: the lines for the chat, or the teacher's answer key. */
export type CopyTarget = 'batch' | 'key';

interface ChatPreviewProps {
  loading: boolean;
  items: VocabItem[];
  lines: BatchLine[];
  /** Final text of each line, in the same order as `lines`. */
  textLines: string[];
  options: BatchFormatOptions;
  studentName: string | undefined;
  /** True while no student is chosen but the current source needs one. */
  needsStudentChoice: boolean;
  removedCount: number;
  copied: CopyTarget | null;
  onCopy: (target: CopyTarget) => void;
  onRemove: (itemId: string) => void;
  onPutBack: () => void;
}

/** Copy buttons and the preview bubble. */
export function ChatPreview({
  loading,
  items,
  lines,
  textLines,
  options,
  studentName,
  needsStudentChoice,
  removedCount,
  copied,
  onCopy,
  onRemove,
  onPutBack,
}: ChatPreviewProps) {
  const missingCount = lines.filter((line) => line.missingHint).length;
  const otherFieldCount = lines.filter((line) => line.otherField).length;

  return (
    <div className="grid-bg flex min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-bg/70 px-5 py-2.5 backdrop-blur">
        <MessageSquareText className="size-4 text-muted" />
        <span className="text-[13px] font-semibold">Chat preview</span>
        <span className="text-[12px] text-muted">exactly what will be pasted</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={copied === 'key' ? <Check className="size-3.5 text-accent" /> : <KeyRound className="size-3.5" />}
            disabled={!items.length}
            onClick={() => onCopy('key')}
          >
            Copy answer key
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={copied === 'batch' ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
            disabled={!items.length}
            onClick={() => onCopy('batch')}
            kbd="Ctrl ⇧ C"
          >
            {copied === 'batch' ? 'Copied!' : 'Copy to clipboard'}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        ) : !items.length ? (
          <Empty
            icon={<ListOrdered />}
            title="No words in this batch"
            body={
              needsStudentChoice
                ? 'Choose a student to start.'
                : 'Pick another source, or assign more words to this student.'
            }
          />
        ) : (
          <div className="mx-auto max-w-[620px]">
            {missingCount > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[12px] text-warn">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {missingCount} word{missingCount === 1 ? ' has' : 's have'} no Polish translation or definition —{' '}
                  {options.show === 'polish'
                    ? 'the English word is shown instead'
                    : 'only the English blanks are shown'}
                  . Fill them in the bank or remove them below.
                </span>
              </div>
            )}
            {otherFieldCount > 0 && (
              <div className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] text-muted">
                {otherFieldCount} word{otherFieldCount === 1 ? ' has' : 's have'} no{' '}
                {options.hint === 'polish'
                  ? 'Polish translation, so the definition is'
                  : 'definition, so the Polish is'}{' '}
                shown instead.
              </div>
            )}
            {/* Styled like a chat message so the teacher sees how it will look in Zoom. */}
            <div className="rounded-2xl rounded-tl-sm border border-line-2 bg-surface shadow-pop">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-[11px] text-muted">
                <span className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-ink">
                  T
                </span>
                <span className="font-semibold text-fg-2">Teacher</span> to {studentName ?? 'Everyone'}
                <span className="ml-auto font-mono">{items.length} lines</span>
              </div>
              <ol className="py-1.5">
                {lines.map((line, index) => (
                  <li key={line.itemId} className="group flex items-center gap-2 px-4 py-[3px] hover:bg-surface-2">
                    <span
                      className={cn(
                        'flex-1 whitespace-pre font-mono text-[14px] leading-6',
                        line.missingHint ? 'text-warn' : 'text-fg',
                      )}
                    >
                      {textLines[index]}
                    </span>
                    <span className="hidden truncate text-[11px] text-faint group-hover:inline">
                      {items[index].english}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${items[index].english} from batch`}
                      onClick={() => onRemove(line.itemId)}
                      className="grid size-5 place-items-center rounded text-faint opacity-0 hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-faint">
              <span>Hover a line to see the answer · × removes it from this batch only</span>
              {removedCount > 0 && (
                <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={onPutBack}>
                  <RefreshCw className="size-3" /> Put back {removedCount}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
