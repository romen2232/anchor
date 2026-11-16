import { Given, Then, When } from 'quickpickle';
import { expect } from 'vitest';
import { addMinutes, diffMinutes, shiftLaterToday, split, toInstant } from '../../src/index';
import type {
  Existing,
  Item,
  LocalDate,
  LocalTime,
  Occurrence,
  OccurrenceDraft,
  RescheduleContext,
} from '../../src/index';
import type { DomainWorld } from './world';

const TODAY: LocalDate = '2026-11-17';
const TOMORROW: LocalDate = '2026-11-18';
const DAY_START: LocalTime = '08:00';
const DAY_END: LocalTime = '23:59';

interface RescheduleWorld extends DomainWorld {
  moved?: Occurrence;
  parts?: [Occurrence, OccurrenceDraft];
}

const hhmm = (h: number, m: number): LocalTime =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function addTask(
  world: RescheduleWorld,
  title: string,
  scheduledStart: string,
  scheduledEnd: string,
  start: LocalTime,
): void {
  const item: Item = {
    id: `item-${world.items.length + 1}`,
    userId: 'user-1',
    kind: 'oneoff',
    title,
    schedule: { type: 'once', date: TODAY, startTime: start, zone: world.zone },
    durationMinutes: diffMinutes(scheduledStart, scheduledEnd),
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn: [],
    reminderPolicy: null,
    deletedAt: null,
  };
  world.items.push(item);
  world.occurrences.push({
    id: `occ-${world.occurrences.length + 1}`,
    itemId: item.id,
    localDate: TODAY,
    sequence: 0,
    scheduledStart,
    scheduledEnd,
    status: 'pending',
    snoozedUntil: null,
    splitFromOccurrenceId: null,
    userModified: false,
    actualStart: null,
    actualEnd: null,
  });
}

function titled(world: RescheduleWorld, title: string): { occ: Occurrence; item: Item } {
  const item = world.items.find((i) => i.title === title);
  const occ = world.occurrences.find((o) => o.itemId === item?.id);
  if (!item || !occ) throw new Error(`No task titled "${title}"`);
  return { occ, item };
}

function context(world: RescheduleWorld, now: string, exclude: Occurrence): RescheduleContext {
  const existingToday: Existing[] = world.occurrences
    .filter((o) => o.id !== exclude.id)
    .map((occ) => ({ occ, item: world.items.find((i) => i.id === occ.itemId)! }));
  return {
    now,
    dayEnd: toInstant(TODAY, DAY_END, world.zone),
    nextDayStart: toInstant(TOMORROW, DAY_START, world.zone),
    nextDayEnd: toInstant(TOMORROW, DAY_END, world.zone),
    existingToday,
    existingTomorrow: [],
  };
}

Given(
  '{string} at {int}:{int} for {int} minutes',
  async (world: RescheduleWorld, title: string, h: number, m: number, minutes: number) => {
    const start = toInstant(TODAY, hhmm(h, m), world.zone);
    addTask(world, title, start, addMinutes(start, minutes), hhmm(h, m));
  },
);

Given('my day is full until 23:59', async (world: RescheduleWorld) => {
  addTask(
    world,
    'Busy',
    toInstant(TODAY, '10:00', world.zone),
    toInstant(TODAY, DAY_END, world.zone),
    '10:00',
  );
});

When(
  'I move {string} to later today at {int}:{int}',
  async (world: RescheduleWorld, title: string, h: number, m: number) => {
    const { occ, item } = titled(world, title);
    const now = toInstant(TODAY, hhmm(h, m), world.zone);
    world.moved = shiftLaterToday(occ, item, context(world, now, occ));
  },
);

Then("{string} moves to tomorrow's first free slot", async (world: RescheduleWorld) => {
  expect(world.moved?.localDate).toBe(TOMORROW);
  expect(world.moved?.scheduledStart).toBe(toInstant(TOMORROW, DAY_START, world.zone));
});

When('I split it', async (world: RescheduleWorld) => {
  const occ = world.occurrences[0]!;
  const item = world.items[0]!;
  world.parts = split(occ, item, context(world, occ.scheduledStart, occ));
});

Then('I have two {int} minute parts', async (world: RescheduleWorld, minutes: number) => {
  const [first, second] = world.parts!;
  expect(diffMinutes(first.scheduledStart, first.scheduledEnd)).toBe(minutes);
  expect(diffMinutes(second.scheduledStart, second.scheduledEnd)).toBe(minutes);
  expect(second.splitFromOccurrenceId).toBe(first.id);
});
