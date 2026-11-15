import { weekdayOf } from './time';
import type { LocalDate, Schedule, Weekday } from './types';

export class InvalidRecurrenceError extends Error {
  override name = 'InvalidRecurrenceError';
}

const ORDER: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function isWeekday(value: string): value is Weekday {
  return (ORDER as readonly string[]).includes(value);
}

export function parseRRule(rrule: string): Weekday[] {
  const match = /^FREQ=WEEKLY;BYDAY=(.*)$/.exec(rrule);
  if (!match) throw new InvalidRecurrenceError(`Unsupported recurrence rule: ${rrule}`);
  const days = match[1]!.split(',');
  const parsed: Weekday[] = [];
  for (const day of days) {
    if (!isWeekday(day)) throw new InvalidRecurrenceError(`Invalid weekday "${day}" in: ${rrule}`);
    parsed.push(day);
  }
  return parsed;
}

export function toRRule(byDay: Weekday[]): string {
  const days = ORDER.filter((d) => byDay.includes(d));
  return `FREQ=WEEKLY;BYDAY=${days.join(',')}`;
}

export function occursOn(schedule: Schedule, date: LocalDate): boolean {
  if (schedule.type === 'once') return schedule.date === date;
  return schedule.byDay.includes(weekdayOf(date));
}
