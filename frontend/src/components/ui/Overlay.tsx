/** Floating layers: modal dialog, side drawer, popover menu. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './Button';

function useModalBehaviour(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // Parents often pass a new onClose on every render. Reading it through a ref keeps the effect below
  // from running again, which would pull keyboard focus back to the first field while typing.
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(
      '[data-autofocus], input, textarea, select, button:not([data-close])',
    );
    (first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        latestOnClose.current();
      }
      if (e.key === 'Tab' && node) {
        const focusable = [
          ...node.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])',
          ),
        ];
        if (!focusable.length) return;
        const [first, last] = [focusable[0], focusable[focusable.length - 1]];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open]);
  return ref;
}

/** Modal dialog that keeps keyboard focus inside. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useModalBehaviour(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 animate-in bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{ width }}
        className="relative max-h-[calc(100vh-2rem)] max-w-full animate-pop overflow-auto rounded-xl border border-line-2 bg-surface shadow-pop outline-none"
      >
        <div className="flex items-start gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-semibold text-fg">{title}</h2>
            {description && <p className="mt-0.5 text-[12px] text-muted">{description}</p>}
          </div>
          <IconButton
            data-close
            label="Close"
            icon={<X className="size-4" />}
            onClick={onClose}
            className="-mr-2 -mt-1"
          />
        </div>
        {children && <div className="px-5 py-3">{children}</div>}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-bg-2/50 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Panel that slides in from the side. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useModalBehaviour(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 animate-in bg-black/40" onClick={onClose} />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{ width }}
        className="absolute bottom-0 right-0 top-0 flex max-w-full animate-slide flex-col border-l border-line-2 bg-surface shadow-pop outline-none"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[15px] font-semibold">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[12px] text-muted">{subtitle}</div>}
          </div>
          <IconButton
            data-close
            label="Close (Esc)"
            icon={<X className="size-4" />}
            onClick={onClose}
            className="-mr-2"
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center gap-2 border-t border-line bg-bg-2/60 px-5 py-3">{footer}</footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}

/** Lightweight anchored popover used for menus and pickers. */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = 'start',
  className,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = ref.current?.offsetWidth ?? 220;
      const height = ref.current?.offsetHeight ?? 200;
      let left = align === 'end' ? rect.right - width : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = rect.bottom + 6;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose(), anchor?.focus());
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={cn(
        'fixed z-[60] min-w-[200px] animate-pop rounded-lg border border-line-2 bg-surface-2 p-1 shadow-pop',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

/** A row in a popover menu. */
export function MenuItem({
  icon,
  children,
  onClick,
  hint,
  danger,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  hint?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors disabled:opacity-40',
        danger ? 'text-danger hover:bg-danger/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg',
      )}
    >
      <span className="grid size-4 place-items-center text-muted [&>svg]:size-3.5">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </button>
  );
}

/** A small heading in a popover menu. */
export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">{children}</div>
);
/** A divider in a popover menu. */
export const MenuSep = () => <div className="my-1 h-px bg-line" />;
