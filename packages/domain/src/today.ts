import { leaveBy } from './transitions';
import { isBlocked } from './dependencies';
import type { Instant, Item, LocalDate, Occurrence } from './types';

export interface TodayEntry {
  occurrence: Occurrence;
  item: Item;
  blocked: boolean;
  waitingOn: string[];
  leaveBy: Instant;
}

export interface TodayView {
  now: TodayEntry | null;
  next: TodayEntry | null;
  later: TodayEntry[];
  timeline: TodayEntry[];
}

const ms = (instant: Instant): number => Date.parse(instant);
const effectiveStart = (e: TodayEntry): number =>
  ms(e.occurrence.snoozedUntil ?? e.occurrence.scheduledStart);

function byEffectiveStart(a: TodayEntry, b: TodayEntry): number {
  return (
    effectiveStart(a) - effectiveStart(b) ||
    (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0)
  );
}

function byScheduledStart(a: TodayEntry, b: TodayEntry): number {
  return (
    ms(a.occurrence.scheduledStart) - ms(b.occurrence.scheduledStart) ||
    (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0)
  );
}

/**
 * One thing at a time: what is happening now, what comes next, and everything
 * else still open. Open entries that are past their time stay in `later`.
 */
export function buildTodayView(
  items: Item[],
  occurrences: Occurrence[],
  date: LocalDate,
  now: Instant,
): TodayView {
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const today = occurrences.filter((o) => o.localDate === date);
  const entries: TodayEntry[] = [];
  for (const occurrence of today) {
    const item = itemsById.get(occurrence.itemId);
    if (!item || item.deletedAt !== null) continue;
    const { blocked, waitingOn } = isBlocked(occurrence, item, today);
    entries.push({ occurrence, item, blocked, waitingOn, leaveBy: leaveBy(occurrence, item) });
  }

  const timeline = [...entries].sort(byEffectiveStart);
  const open = timeline.filter(
    (e) => e.occurrence.status === 'pending' || e.occurrence.status === 'active',
  );
  const nowMs = ms(now);

  const active = open.filter((e) => e.occurrence.status === 'active').sort(byScheduledStart);
  const inWindow = open
    .filter(
      (e) =>
        e.occurrence.status === 'pending' &&
        !e.blocked &&
        ms(e.occurrence.scheduledStart) <= nowMs &&
        nowMs < ms(e.occurrence.scheduledEnd),
    )
    .sort(byScheduledStart);
  const current = active[0] ?? inWindow[0] ?? null;

  const next =
    open.find(
      (e) =>
        e !== current &&
        e.occurrence.status === 'pending' &&
        !e.blocked &&
        effectiveStart(e) > nowMs,
    ) ?? null;

  const later = open.filter((e) => e !== current && e !== next);
  return { now: current, next, later, timeline };
}
