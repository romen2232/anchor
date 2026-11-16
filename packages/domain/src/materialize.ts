import { occursOn } from './recurrence';
import { addDays, addMinutes, toInstant } from './time';
import type { Item, LocalDate, Occurrence, OccurrenceDraft } from './types';

export function occurrenceKey(d: Pick<Occurrence, 'itemId' | 'localDate' | 'sequence'>): string {
  return `${d.itemId}:${d.localDate}:${d.sequence}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byStartThenItemThenDate(a: OccurrenceDraft, b: OccurrenceDraft): number {
  return (
    compare(a.scheduledStart, b.scheduledStart) ||
    compare(a.itemId, b.itemId) ||
    compare(a.localDate, b.localDate)
  );
}

/**
 * Drafts for every non-deleted item on each date in `[from, from + days)`.
 * An occurrence belongs to the local date it starts on, even if it crosses midnight.
 */
export function materialize(items: Item[], from: LocalDate, days: number): OccurrenceDraft[] {
  const drafts: OccurrenceDraft[] = [];
  for (const item of items) {
    if (item.deletedAt !== null) continue;
    for (let offset = 0; offset < days; offset++) {
      const localDate = addDays(from, offset);
      if (!occursOn(item.schedule, localDate)) continue;
      const scheduledStart = toInstant(localDate, item.schedule.startTime, item.schedule.zone);
      drafts.push({
        itemId: item.id,
        localDate,
        sequence: 0,
        scheduledStart,
        scheduledEnd: addMinutes(scheduledStart, item.durationMinutes),
        status: 'pending',
        snoozedUntil: null,
        splitFromOccurrenceId: null,
        userModified: false,
        actualStart: null,
        actualEnd: null,
      });
    }
  }
  return drafts.sort(byStartThenItemThenDate);
}
