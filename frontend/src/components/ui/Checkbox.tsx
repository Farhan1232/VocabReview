/** Checkbox that supports a third, "some selected" state. */
import { Check, Minus } from 'lucide-react';
import { cn } from './cn';

/** Accessible checkbox. */
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean, e: React.MouseEvent | React.KeyboardEvent) => void;
  label?: string;
  className?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked, e);
      }}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors',
        on ? 'border-accent bg-accent text-accent-ink' : 'border-line-2 bg-bg-2 hover:border-faint',
        className,
      )}
    >
      {indeterminate ? (
        <Minus className="size-3" strokeWidth={3} />
      ) : checked ? (
        <Check className="size-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}
