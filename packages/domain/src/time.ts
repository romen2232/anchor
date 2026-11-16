import { Temporal } from 'temporal-polyfill';
import type { IanaZone, Instant, LocalDate, LocalTime, Weekday } from './types';

const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Normalizes to `YYYY-MM-DDTHH:MM:SSZ` (no fractional seconds). */
function formatInstant(i: Temporal.Instant): Instant {
  return i.toString({ smallestUnit: 'second' }) as Instant;
}

export function toInstant(date: LocalDate, time: LocalTime, zone: IanaZone): Instant {
  const zoned = Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(zone, {
    disambiguation: 'compatible',
  });
  return formatInstant(zoned.toInstant());
}

export function toLocalDate(instant: Instant, zone: IanaZone): LocalDate {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString() as LocalDate;
}

export function weekdayOf(date: LocalDate): Weekday {
  return WEEKDAYS[Temporal.PlainDate.from(date).dayOfWeek - 1]!;
}

export function addMinutes(instant: Instant, minutes: number): Instant {
  return formatInstant(Temporal.Instant.from(instant).add({ minutes }));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return Temporal.PlainDate.from(date).add({ days }).toString() as LocalDate;
}

/** Minutes from `a` to `b` (b - a); fractional when the gap is not a whole number of minutes. */
export function diffMinutes(a: Instant, b: Instant): number {
  return (
    (Temporal.Instant.from(b).epochMilliseconds - Temporal.Instant.from(a).epochMilliseconds) /
    60000
  );
}

export function toLocalTime(instant: Instant, zone: IanaZone): LocalTime {
  const t = Temporal.Instant.from(instant).toZonedDateTimeISO(zone);
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

/** Rounds up to the next whole minute; whole minutes are returned unchanged. */
export function ceilToMinute(instant: Instant): Instant {
  const t = Temporal.Instant.from(instant);
  const remainder = t.epochMilliseconds % 60000;
  return formatInstant(remainder === 0 ? t : t.add({ milliseconds: 60000 - remainder }));
}
