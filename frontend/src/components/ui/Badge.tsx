/** Small colored labels for learning state, CEFR level, rating and topic. */
import type { ReactNode } from 'react';
import type { Cefr, LearningState, Rating } from '@/api/types';
import { RATING_LABEL } from '@/api/types';
import { cn } from './cn';

/** Generic colored label. */
export function Badge({ children, className, dot }: { children: ReactNode; className?: string; dot?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] font-medium leading-none',
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

/** Label and color of each learning state. */
export const STATE_META: Record<LearningState, { label: string; color: string }> = {
  new: { label: 'New', color: 'var(--color-st-new)' },
  learning: { label: 'Learning', color: 'var(--color-st-learning)' },
  review: { label: 'Review', color: 'var(--color-st-review)' },
  mastered: { label: 'Mastered', color: 'var(--color-st-mastered)' },
};

/** Learning state label. */
export function StateBadge({ state }: { state: LearningState }) {
  const meta = STATE_META[state];
  return (
    <Badge className="bg-white/[0.04] text-fg-2 ring-1 ring-inset ring-white/[0.06]" dot={meta.color}>
      {meta.label}
    </Badge>
  );
}

const CEFR_TONE: Record<Cefr, string> = {
  A1: 'text-[#7dd3fc] bg-[#7dd3fc]/10',
  A2: 'text-[#60a5fa] bg-[#60a5fa]/10',
  B1: 'text-[#a3e635] bg-[#a3e635]/10',
  B2: 'text-[#4ade80] bg-[#4ade80]/10',
  C1: 'text-[#f0abfc] bg-[#f0abfc]/10',
  C2: 'text-[#c084fc] bg-[#c084fc]/10',
};

/** CEFR level label. */
export function CefrBadge({ cefr }: { cefr: Cefr | null }) {
  if (!cefr) return <span className="text-faint">—</span>;
  return <Badge className={cn('font-mono font-semibold tracking-tight', CEFR_TONE[cefr])}>{cefr}</Badge>;
}

/** Color of each rating. */
export const RATING_COLOR: Record<Rating, string> = {
  1: 'var(--color-r-again)',
  2: 'var(--color-r-hard)',
  3: 'var(--color-r-good)',
  4: 'var(--color-r-easy)',
};

/** Rating label. */
export function RatingBadge({ rating }: { rating: Rating | null }) {
  if (!rating) return <span className="text-faint">—</span>;
  return (
    <Badge className="bg-white/[0.04] text-fg-2" dot={RATING_COLOR[rating]}>
      {RATING_LABEL[rating]}
    </Badge>
  );
}

/** Topic label. */
export function TopicChip({ name, onClick, active }: { name: string; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex h-[18px] items-center rounded-sm border px-1.5 text-[11px] leading-none transition-colors',
        active ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line bg-surface-2 text-fg-2',
        onClick && 'hover:border-line-2 hover:text-fg',
      )}
    >
      {name}
    </Tag>
  );
}
