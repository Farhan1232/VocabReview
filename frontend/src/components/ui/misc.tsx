/** Small shared pieces: spinner, empty state, page header, stat tile, key cap. */
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

/** Loading indicator. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-muted', className)} />;
}

/** Placeholder for a page or list with nothing to show. */
export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div className="mb-3 grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-muted [&>svg]:size-5">
          {icon}
        </div>
      )}
      <div className="font-display text-[14px] font-semibold text-fg">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[12px] text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Title row at the top of a page. */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="flex min-h-14 items-center gap-3 border-b border-line bg-bg/80 px-5 py-2.5 backdrop-blur">
      {icon && (
        <div className="grid size-8 place-items-center rounded-lg border border-line bg-surface-2 text-accent [&>svg]:size-4">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[16px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="truncate text-[12px] text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A labelled number. */
export function Stat({
  label,
  value,
  tone,
  hint,
  onClick,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  hint?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={hint}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-line bg-surface px-3 py-2.5 text-left',
        onClick && 'transition-colors hover:border-line-2 hover:bg-surface-2',
      )}
    >
      {tone && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone }} />}
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 font-display text-[22px] font-semibold tabular-nums leading-tight text-fg">{value}</div>
    </Tag>
  );
}

/** A key cap. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** Readable name for a key, such as → for ArrowRight. */
export function keyLabel(key: string): string {
  const map: Record<string, string> = {
    ' ': 'Space',
    ArrowRight: '→',
    ArrowLeft: '←',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Enter: '↵',
    Escape: 'Esc',
  };
  return map[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}
