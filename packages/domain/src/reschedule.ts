import { nearestFreeSlot } from './conflicts';
import type { Existing } from './conflicts';
import { addMinutes, diffMinutes, toLocalDate } from './time';
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

const withoutSelf = (existing: Existing[], occ: Occurrence): Existing[] =>
  existing.filter((e) => e.occ.id !== occ.id);

/** "Later today": next free slot today, or tomorrow's first free slot when today is full. */
export function shiftLaterToday(occ: Occurrence, item: Item, ctx: RescheduleContext): Occurrence {
  const duration = diffMinutes(occ.scheduledStart, occ.scheduledEnd);
  const placed = place(
    item,
    duration,
    ctx.now,
    occ.localDate,
    ctx,
    withoutSelf(ctx.existingToday, occ),
  );
  return {
    ...occ,
    localDate: placed.localDate,
    scheduledStart: placed.start,
    scheduledEnd: placed.end,
    snoozedUntil: null,
    userModified: true,
  };
}

/**
 * Splits what is left of an occurrence in two. The first part keeps the start and gets the
 * smaller half; the second is placed after it, using the same rule as `shiftLaterToday`.
 */
export function split(
  occ: Occurrence,
  item: Item,
  ctx: RescheduleContext,
): [Occurrence, OccurrenceDraft] {
  const from = ms(ctx.now) > ms(occ.scheduledStart) ? ctx.now : occ.scheduledStart;
  const remaining = diffMinutes(from, occ.scheduledEnd);
  const firstMinutes = Math.floor(remaining / 2);
  if (firstMinutes < 1) throw new RangeError('Too short to split');

  const first: Occurrence = {
    ...occ,
    scheduledEnd: addMinutes(occ.scheduledStart, firstMinutes),
    userModified: true,
  };
  const after = ms(first.scheduledEnd) > ms(ctx.now) ? first.scheduledEnd : ctx.now;
  const existing = [...withoutSelf(ctx.existingToday, occ), { occ: first, item }];
  const placed = place(item, remaining - firstMinutes, after, occ.localDate, ctx, existing);

  const second: OccurrenceDraft = {
    itemId: occ.itemId,
    localDate: placed.localDate,
    sequence: occ.sequence + 1,
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
