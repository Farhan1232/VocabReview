/**
 * Timezone policy: everything is stored in UTC; "today" means the teacher's local calendar day.
 * "Due today" = due before local midnight tonight (overdue items included).
 * "Overdue"   = due before local midnight this morning.
 */
import type { DueFilter } from '@/api/types';

/** Midnight at the start of today, local time. */
export function startOfLocalDay(now = new Date()): Date {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Midnight at the end of today, local time. */
export function endOfLocalDay(now = new Date()): Date {
  const date = startOfLocalDay(now);
  date.setDate(date.getDate() + 1);
  return date;
}

/** When a card is due, relative to today. */
export type DueBucket = 'overdue' | 'today' | 'soon' | 'later';

/** Sort a due time into its bucket. */
export function dueBucket(dueIso: string, now = new Date(), dueSoonDays = 3): DueBucket {
  const due = new Date(dueIso).getTime();
  if (due < startOfLocalDay(now).getTime()) return 'overdue';
  if (due < endOfLocalDay(now).getTime()) return 'today';
  const soonEnd = endOfLocalDay(now);
  soonEnd.setDate(soonEnd.getDate() + dueSoonDays);
  return due < soonEnd.getTime() ? 'soon' : 'later';
}

/** True if a due time passes the filter. */
export function matchesDue(filter: DueFilter, dueIso: string, now = new Date(), dueSoonDays = 3): boolean {
  if (filter === 'any') return true;
  const bucket = dueBucket(dueIso, now, dueSoonDays);
  switch (filter) {
    case 'overdue':
      return bucket === 'overdue';
    case 'due_today':
      return bucket === 'overdue' || bucket === 'today';
    case 'due_soon':
      return bucket === 'soon';
    case 'not_due':
      return bucket === 'soon' || bucket === 'later';
  }
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "in 3 days", "2 hours ago", "in 10 minutes" */
export function relative(iso: string | null, now = new Date()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const min = 60_000,
    hour = 60 * min,
    day = 24 * hour;
  if (abs < hour) return rtf.format(Math.round(diff / min), 'minute');
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour');
  if (abs < 45 * day) return rtf.format(Math.round(diff / day), 'day');
  if (abs < 365 * day) return rtf.format(Math.round(diff / (30 * day)), 'month');
  return rtf.format(Math.round(diff / (365 * day)), 'year');
}

/** Short interval for rating buttons: "1m", "10m", "2d", "3mo". */
export function shortInterval(fromIso: string, toIso: string): string {
  const diff = Math.max(0, new Date(toIso).getTime() - new Date(fromIso).getTime());
  const min = 60_000,
    hour = 60 * min,
    day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.round(diff / min))}m`;
  if (diff < day) return `${Math.round(diff / hour)}h`;
  if (diff < 30 * day) return `${Math.round(diff / day)}d`;
  if (diff < 365 * day) return `${Math.round(diff / (30 * day))}mo`;
  return `${(diff / (365 * day)).toFixed(1)}y`;
}

const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** Local date and time for display. */
export function formatDateTime(iso: string | null): string {
  return iso ? dtf.format(new Date(iso)) : '—';
}
/** Local date for display. */
export function formatDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : '—';
}
