import { nearestFreeSlot } from './conflicts';
import type { Existing } from './conflicts';
import { addMinutes, ceilToMinute, diffMinutes, toLocalDate } from './time';
import type { Instant, Item, LocalDate, Occurrence, OccurrenceDraft } from './types';

export interface RescheduleContext {
  now: Instant;
  dayEnd: Instant;
  nextDayStart: Instant;
  nextDayEnd: Instant;
  existingToday: Existing[];
  existingTomorrow: Existing[];
}

const ms = (instant: Instant): number => Date.parse(instant);
const later = (a: Instant, b: Instant): Instant => (ms(a) >= ms(b) ? a : b);

/** Postpones the occurrence a few minutes without changing its schedule. */
export function snooze(occ: Occurrence, minutes: 10 | 30, now: Instant): Occurrence {
  return { ...occ, snoozedUntil: addMinutes(now, minutes), userModified: true };
}

interface Placement {
  start: Instant;
  end: Instant;
  localDate: LocalDate;
}

/**
 * Finds a slot today at or after `after`, else the first free one tomorrow.
 * Travel and prep are part of what the slot must hold, so the occurrence starts after them.
 */
function place(
  item: Item,
  durationMinutes: number,
  after: Instant,
  fallbackDate: LocalDate,
  ctx: RescheduleContext,
  existingToday: Existing[],
): Placement {
  const lead = item.travelMinutes + item.prepMinutes;
  const needed = lead + durationMinutes;

  const today = nearestFreeSlot(needed, after, ctx.dayEnd, existingToday);
  if (today !== null) {
    const start = addMinutes(today, lead);
    return { start, end: addMinutes(start, durationMinutes), localDate: fallbackDate };
  }

  const tomorrow = nearestFreeSlot(needed, ctx.nextDayStart, ctx.nextDayEnd, ctx.existingTomorrow);
  if (tomorrow === null) throw new Error('No free slot today or tomorrow');
  const start = addMinutes(tomorrow, lead);
  return {
    start,
    end: addMinutes(start, durationMinutes),
    localDate: toLocalDate(start, item.schedule.zone),
  };
}

/** A sequence for `itemId` on `localDate` that no known occurrence uses; `preferred` if free. */
function freeSequence(
  itemId: string,
  localDate: LocalDate,
  known: Occurrence[],
  preferred: number | null,
): number {
  const used = known
    .filter((o) => o.itemId === itemId && o.localDate === localDate)
    .map((o) => o.sequence);
  if (preferred !== null && !used.includes(preferred)) return preferred;
  return used.length === 0 ? 0 : Math.max(...used) + 1;
}

const knownOccurrences = (ctx: RescheduleContext, extra: Occurrence[] = []): Occurrence[] => [
  ...ctx.existingToday.map((e) => e.occ),
  ...ctx.existingTomorrow.map((e) => e.occ),
  ...extra,
];

const withoutSelf = (existing: Existing[], occ: Occurrence): Existing[] =>
  existing.filter((e) => e.occ.id !== occ.id);

/**
 * "Later today": the next free slot today after both now and the current slot, or tomorrow's
 * first free slot when today is full. It never moves a task earlier.
 */
export function shiftLaterToday(occ: Occurrence, item: Item, ctx: RescheduleContext): Occurrence {
  const duration = Math.round(diffMinutes(occ.scheduledStart, occ.scheduledEnd));
  const after = later(ctx.now, occ.scheduledEnd);
  const others = withoutSelf(ctx.existingToday, occ);
  const placed = place(item, duration, after, occ.localDate, ctx, others);
  const sequence =
    placed.localDate === occ.localDate
      ? occ.sequence
      : freeSequence(
          occ.itemId,
          placed.localDate,
          knownOccurrences(ctx).filter((o) => o.id !== occ.id),
          occ.sequence,
        );
  return {
    ...occ,
    localDate: placed.localDate,
    sequence,
    scheduledStart: placed.start,
    scheduledEnd: placed.end,
    snoozedUntil: null,
    userModified: true,
    movedFrom:
      placed.localDate === occ.localDate
        ? (occ.movedFrom ?? null)
        : (occ.movedFrom ?? { localDate: occ.localDate, sequence: occ.sequence }),
  };
}

/**
 * Splits what is left of an occurrence in two. The first part keeps the start and runs through
 * the time already elapsed plus the smaller half of what remains; the second part gets the rest
 * and is placed after it, using the same rule as `shiftLaterToday`.
 */
export function split(
  occ: Occurrence,
  item: Item,
  ctx: RescheduleContext,
): [Occurrence, OccurrenceDraft] {
  const from = ceilToMinute(later(ctx.now, occ.scheduledStart));
  const remaining = Math.floor(diffMinutes(from, occ.scheduledEnd));
  const firstMinutes = Math.floor(remaining / 2);
  if (firstMinutes < 1) throw new RangeError('Too short to split');

  const first: Occurrence = {
    ...occ,
    scheduledEnd: addMinutes(from, firstMinutes),
    userModified: true,
  };
  const after = later(ctx.now, first.scheduledEnd);
  const existing = [...withoutSelf(ctx.existingToday, occ), { occ: first, item }];
  const placed = place(item, remaining - firstMinutes, after, occ.localDate, ctx, existing);

  const second: OccurrenceDraft = {
    itemId: occ.itemId,
    localDate: placed.localDate,
    sequence: freeSequence(occ.itemId, placed.localDate, knownOccurrences(ctx, [occ, first]), null),
    scheduledStart: placed.start,
    scheduledEnd: placed.end,
    status: 'pending',
    snoozedUntil: null,
    splitFromOccurrenceId: occ.id,
    userModified: true,
    actualStart: null,
    actualEnd: null,
  };
  return [first, second];
}
