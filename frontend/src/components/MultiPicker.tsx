/** Searchable multi-select used by the vocabulary filters. */
import { forwardRef, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Popover } from './ui/Overlay';
import { Checkbox } from './ui/Checkbox';
import { cn } from './ui/cn';

/** One choice, with an optional count. */
export interface PickOption {
  value: string;
  label: ReactNode;
  count?: number;
}

/** Compact filter "pill" that opens a searchable multi-select list. */
export function MultiPicker({
  label,
  options,
  value,
  onChange,
  searchable = true,
  icon,
}: {
  label: string;
  options: PickOption[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const shown = options.filter((o) => !query || String(o.label).toLowerCase().includes(query.toLowerCase()));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary =
    value.length === 0
      ? null
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${value.length} selected`;

  return (
    <>
      <FilterPill ref={ref} active={value.length > 0} onClick={() => setOpen((v) => !v)} icon={icon}>
        {label}
        {summary && <span className="text-accent">: {summary}</span>}
        <ChevronDown className="size-3 opacity-60" />
      </FilterPill>
      <Popover anchor={ref.current} open={open} onClose={() => (setOpen(false), setQuery(''))} className="w-[240px]">
        {searchable && options.length > 7 && (
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Find ${label.toLowerCase()}…`}
              className="field h-7 pl-7 text-[12px]"
            />
          </div>
        )}
        <div className="max-h-[280px] overflow-y-auto">
          {shown.map((o) => (
            <div
              key={o.value}
              role="option"
              aria-selected={value.includes(o.value)}
              tabIndex={0}
              onClick={() => toggle(o.value)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(o.value))}
              className="flex h-7 cursor-pointer items-center gap-2 rounded px-2 text-[12px] text-fg-2 outline-none hover:bg-surface-3 focus-visible:bg-surface-3"
            >
              <Checkbox checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="flex-1 truncate">{o.label}</span>
              {o.count !== undefined && <span className="tabular-nums text-faint">{o.count}</span>}
            </div>
          ))}
          {shown.length === 0 && <div className="px-2 py-3 text-center text-[12px] text-muted">Nothing found</div>}
        </div>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 h-7 w-full rounded border-t border-line text-[12px] text-muted hover:text-fg"
          >
            Clear
          </button>
        )}
      </Popover>
    </>
  );
}

/** The small button that opens a filter and shows how many values are chosen. */
export const FilterPill = forwardRef<
  HTMLButtonElement,
  { active?: boolean; children: ReactNode; onClick?: () => void; icon?: ReactNode; title?: string }
>(function FilterPill({ active, children, onClick, icon, title }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12px] font-medium transition-colors [&>svg]:size-3.5',
        active
          ? 'border-accent/40 bg-accent-soft text-fg'
          : 'border-line bg-surface text-fg-2 hover:border-line-2 hover:text-fg',
      )}
    >
      {icon}
      {children}
    </button>
  );
});
