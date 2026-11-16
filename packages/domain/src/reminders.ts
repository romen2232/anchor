import { addMinutes, toLocalTime } from './time';
import { leaveBy } from './transitions';
import { DEFAULTS } from './types';
import type { IanaZone, Instant, Item, LocalTime, Occurrence, ReminderPolicy } from './types';

export type ReminderLevel = 'gentle' | 'insistent' | 'repeat' | 'ready';

export interface ReminderJob {
  key: string;
  occurrenceId: string;
  level: ReminderLevel;
  at: Instant;
}

/** May wrap midnight (e.g. 22:00-07:00). */
export interface QuietHours {
  start: LocalTime;
  end: LocalTime;
  zone: IanaZone;
}

export interface PlanRemindersInput {
  occ: Occurrence;
  item: Item;
  userPolicy: ReminderPolicy;
  quiet: QuietHours | null;
  blocked: boolean;
  releasedAt: Instant | null;
  now: Instant;
}

const ms = (instant: Instant): number => Date.parse(instant);

// "HH:MM" strings compare correctly as text.
function isQuiet(instant: Instant, quiet: QuietHours): boolean {
  const t = toLocalTime(instant, quiet.zone);
  return quiet.start <= quiet.end
    ? t >= quiet.start && t < quiet.end
    : t >= quiet.start || t < quiet.end;
}

const job = (occ: Occurrence, level: ReminderLevel, at: Instant): ReminderJob => ({
  key: `${occ.id}:${level}`,
  occurrenceId: occ.id,
  level,
  at,
});

/**
 * Layered reminder jobs for one occurrence: gentle, then insistent, then a single repeat.
 * Held (blocked) occurrences get nothing; once released after their start they get one "ready".
 */
export function planReminders(input: PlanRemindersInput): ReminderJob[] {
  const { occ, item, userPolicy, quiet, blocked, releasedAt, now } = input;
  const policy = item.reminderPolicy ?? userPolicy;
  if (policy === 'off' || blocked) return [];

  const start = occ.snoozedUntil ?? occ.scheduledStart;
  const quietAtStart = quiet !== null && isQuiet(start, quiet);
  if (quietAtStart && !item.essential) return [];

  let jobs: ReminderJob[];
  if (releasedAt !== null && ms(start) < ms(releasedAt)) {
    jobs = [job(occ, 'ready', releasedAt)];
  } else {
    const lead = leaveBy({ ...occ, scheduledStart: start }, item);
    jobs = [
      job(occ, 'gentle', addMinutes(lead, -DEFAULTS.gentleLeadMinutes)),
      ...(policy === 'full'
        ? [
            job(occ, 'insistent', start),
            job(occ, 'repeat', addMinutes(start, DEFAULTS.repeatAfterMinutes)),
          ]
        : []),
    ];
  }

  return jobs
    .filter((j) => !(quietAtStart && j.level === 'gentle'))
    .filter((j) => ms(j.at) >= ms(now));
}
