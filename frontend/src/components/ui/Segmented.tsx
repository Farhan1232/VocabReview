/** Row of mutually exclusive options. */
import type { ReactNode } from 'react';
import { cn } from './cn';

/** One option. `hint` is the tooltip. */
export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: string;
}

/** The control itself. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-md border border-line bg-bg-2 p-0.5', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-[5px] font-medium transition-all',
              size === 'sm' && 'h-6 px-2 text-[11px]',
              size === 'md' && 'h-7 px-3 text-[12px]',
              size === 'lg' && 'h-9 px-4 text-[13px]',
              active
                ? 'bg-surface-3 text-fg shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_0_0_1px_var(--color-line-2)]'
                : 'text-muted hover:text-fg-2',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
