import { diffMinutes } from './time';
import type { Instant, Occurrence } from './types';

function isUnfinished(o: Occurrence): boolean {
  return o.status === 'pending' || o.status === 'active';
}

/** Chronological order by start; ties go to the later local date, then the higher sequence. */
function compareOccurrences(a: Occurrence, b: Occurrence): number {
  const byStart = diffMinutes(b.scheduledStart, a.scheduledStart);
  if (byStart !== 0) return byStart;
  if (a.localDate !== b.localDate) return a.localDate < b.localDate ? -1 : 1;
  return a.sequence - b.sequence;
}

/**
 * Ids of occurrences to close as `skipped`, silently: per item, among unfinished
 * occurrences that have already started, only the latest stays visible.
 */
export function collapsePileUp(occurrences: Occurrence[], now: Instant): string[] {
  const startedByItem = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    if (!isUnfinished(o) || diffMinutes(o.scheduledStart, now) < 0) continue;
    const group = startedByItem.get(o.itemId);
    if (group) group.push(o);
    else startedByItem.set(o.itemId, [o]);
  }

  const superseded: Occurrence[] = [];
  for (const group of startedByItem.values()) {
    superseded.push(...[...group].sort(compareOccurrences).slice(0, -1));
  }
  return superseded.sort(compareOccurrences).map((o) => o.id);
}
