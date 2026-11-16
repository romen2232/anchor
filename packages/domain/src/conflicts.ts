import { addMinutes } from './time';
import { leaveBy } from './transitions';
import type { Instant, Item, Occurrence } from './types';

export type Conflict = { occurrenceId: string; protected: boolean };
export type Window = { start: Instant; end: Instant };
export type Existing = { occ: Occurrence; item: Item };

const ms = (instant: Instant): number => Date.parse(instant);

/** The span an occurrence blocks: [leaveBy, scheduledEnd). Buffers are excluded. */
export function occupiedWindow(occ: Occurrence, item: Item): Window {
  return { start: leaveBy(occ, item), end: occ.scheduledEnd };
}

const isActive = ({ occ }: Existing): boolean =>
  occ.status === 'pending' || occ.status === 'active';

const overlaps = (a: Window, b: Window): boolean =>
  ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);

/** Open occurrences whose window overlaps the candidate. Touching edges do not conflict. */
export function findConflicts(candidate: Window, existing: Existing[]): Conflict[] {
  return existing
    .filter(isActive)
    .filter(({ occ, item }) => overlaps(candidate, occupiedWindow(occ, item)))
    .map(({ occ, item }) => ({ occurrenceId: occ.id, protected: item.kind === 'protected' }));
}

/**
 * First start >= `after` that fits `durationMinutes` without conflict and ends by `dayEnd`.
 * Candidates are `after` and the end of each existing window, which is enough because a
 * free slot can only begin at `after` or right when something else ends.
 */
export function nearestFreeSlot(
  durationMinutes: number,
  after: Instant,
  dayEnd: Instant,
  existing: Existing[],
): Instant | null {
  const candidates = [
    after,
    ...existing.filter(isActive).map((e) => occupiedWindow(e.occ, e.item).end),
  ]
    .filter((start) => ms(start) >= ms(after))
    .sort((a, b) => ms(a) - ms(b));

  for (const start of candidates) {
    const end = addMinutes(start, durationMinutes);
    if (ms(end) > ms(dayEnd)) return null;
    if (findConflicts({ start, end }, existing).length === 0) return start;
  }
  return null;
}
