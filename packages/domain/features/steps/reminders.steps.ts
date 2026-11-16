import { Given, Then } from 'quickpickle';
import { expect } from 'vitest';
import { planReminders, toInstant } from '../../src/index';
import type {
  Item,
  LocalDate,
  LocalTime,
  Occurrence,
  QuietHours,
  ReminderJob,
} from '../../src/index';
import type { DomainWorld } from './world';

const TODAY: LocalDate = '2026-11-17';
const DURATION = 30;

interface ReminderWorld extends DomainWorld {
  quiet: QuietHours | null;
  jobs?: ReminderJob[];
}

const hhmm = (h: number, m: number): LocalTime =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function plan(world: ReminderWorld, item: Item, occ: Occurrence): ReminderJob[] {
  return planReminders({
    occ,
    item,
    userPolicy: 'full',
    quiet: world.quiet ?? null,
    blocked: false,
    releasedAt: null,
    // Well before every scenario so no job counts as already past.
    now: toInstant(TODAY, '00:00', world.zone),
  });
}

function addTask(
  world: ReminderWorld,
  title: string,
  start: LocalTime,
  o: Partial<Item>,
): { item: Item; occ: Occurrence } {
  const scheduledStart = toInstant(TODAY, start, world.zone);
  const item: Item = {
    id: `item-${world.items.length + 1}`,
    userId: 'user-1',
    kind: 'oneoff',
    title,
    schedule: { type: 'once', date: TODAY, startTime: start, zone: world.zone },
    durationMinutes: DURATION,
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn: [],
    reminderPolicy: null,
    deletedAt: null,
    ...o,
  };
  const occ: Occurrence = {
    id: `occ-${world.occurrences.length + 1}`,
    itemId: item.id,
    localDate: TODAY,
    sequence: 0,
    scheduledStart,
    scheduledEnd: toInstant(TODAY, start, world.zone),
    status: 'pending',
    snoozedUntil: null,
    splitFromOccurrenceId: null,
    userModified: false,
    actualStart: null,
    actualEnd: null,
  };
  occ.scheduledEnd = new Date(Date.parse(scheduledStart) + DURATION * 60_000)
    .toISOString()
    .replace('.000Z', 'Z');
  world.items.push(item);
  world.occurrences.push(occ);
  return { item, occ };
}

Given(
  '{string} at {int}:{int} with full reminders',
  async (world: ReminderWorld, title: string, h: number, m: number) => {
    const { item, occ } = addTask(world, title, hhmm(h, m), { reminderPolicy: 'full' });
    world.jobs = plan(world, item, occ);
  },
);

Given('quiet hours {int}:{int}-{int}:{int}', async (world: ReminderWorld, ...t: number[]) => {
  world.quiet = { start: hhmm(t[0]!, t[1]!), end: hhmm(t[2]!, t[3]!), zone: world.zone };
});

Given(
  'a non-essential {string} at {int}:{int}',
  async (world: ReminderWorld, title: string, h: number, m: number) => {
    const { item, occ } = addTask(world, title, hhmm(h, m), { essential: false });
    world.jobs = plan(world, item, occ);
  },
);

const jobAt = (world: ReminderWorld, level: string) =>
  world.jobs?.find((j) => j.level === level)?.at;

Then(
  'I get a gentle reminder at {int}:{int}',
  async (world: ReminderWorld, h: number, m: number) => {
    expect(jobAt(world, 'gentle')).toBe(toInstant(TODAY, hhmm(h, m), world.zone));
  },
);

Then(
  'I get an insistent one at {int}:{int}',
  async (world: ReminderWorld, h: number, m: number) => {
    expect(jobAt(world, 'insistent')).toBe(toInstant(TODAY, hhmm(h, m), world.zone));
  },
);

Then('I get one repeat at {int}:{int}', async (world: ReminderWorld, h: number, m: number) => {
  expect(jobAt(world, 'repeat')).toBe(toInstant(TODAY, hhmm(h, m), world.zone));
});

Then('I get nothing more', async (world: ReminderWorld) => {
  expect(world.jobs?.map((j) => j.level)).toEqual(['gentle', 'insistent', 'repeat']);
});

Then('I get no reminders for {string}', async (world: ReminderWorld) => {
  expect(world.jobs).toEqual([]);
});
