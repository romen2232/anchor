import { Given, Then, When } from 'quickpickle';
import { expect } from 'vitest';
import { addMinutes, collapsePileUp, diffMinutes, toInstant } from '../../src/index';
import type { Item, LocalDate, LocalTime, Occurrence } from '../../src/index';
import type { DomainWorld } from './world';

/** Dates of the week of 16 Nov 2026 (Monday to Wednesday). */
const WEEK_DATES: Record<string, LocalDate> = {
  Monday: '2026-11-16',
  Tuesday: '2026-11-17',
  Wednesday: '2026-11-18',
};

const ROUTINE_START: LocalTime = '09:00';
const ROUTINE_MINUTES = 30;

interface PileUpWorld extends DomainWorld {
  collapsed?: string[];
}

function dateOfWeekday(name: string): LocalDate {
  const date = WEEK_DATES[name];
  if (!date) throw new Error(`Unknown weekday ${name} for this week`);
  return date;
}

function routineItem(world: PileUpWorld, title: string): Item {
  return {
    id: `item-${world.items.length + 1}`,
    userId: 'user-1',
    kind: 'routine',
    title,
    schedule: {
      type: 'weekly',
      byDay: ['MO', 'TU', 'WE'],
      startTime: ROUTINE_START,
      zone: world.zone,
    },
    durationMinutes: ROUTINE_MINUTES,
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn: [],
    reminderPolicy: null,
    deletedAt: null,
  };
}

function openOccurrence(world: PileUpWorld, item: Item, localDate: LocalDate): Occurrence {
  const scheduledStart = toInstant(localDate, ROUTINE_START, world.zone);
  return {
    id: `occ-${world.occurrences.length + 1}`,
    itemId: item.id,
    localDate,
    sequence: 0,
    scheduledStart,
    scheduledEnd: addMinutes(scheduledStart, ROUTINE_MINUTES),
    status: 'pending',
    snoozedUntil: null,
    splitFromOccurrenceId: null,
    userModified: false,
    actualStart: null,
    actualEnd: null,
  };
}

function itemOf(world: PileUpWorld, title: string): Item {
  const item = world.items.find((i) => i.title === title);
  if (!item) throw new Error(`No task named "${title}" was set up in this scenario`);
  return item;
}

Given(
  '{string} was left open on {word} and {word}',
  async (world: PileUpWorld, title: string, first: string, second: string) => {
    const item = routineItem(world, title);
    world.items.push(item);
    for (const day of [first, second]) {
      world.occurrences.push(openOccurrence(world, item, dateOfWeekday(day)));
    }
  },
);

When('it is {word} at {word}', async (world: PileUpWorld, weekday: string, time: string) => {
  world.now = toInstant(dateOfWeekday(weekday), time, world.zone);
  world.collapsed = collapsePileUp(world.occurrences, world.now);
});

Then('I see {string} only once', async (world: PileUpWorld, title: string) => {
  if (!world.collapsed)
    throw new Error('Nothing was checked yet: say "it is <day> at <time>" first');
  const collapsed = world.collapsed;
  const item = itemOf(world, title);
  const visible = world.occurrences.filter(
    (o) =>
      o.itemId === item.id &&
      (o.status === 'pending' || o.status === 'active') &&
      diffMinutes(o.scheduledStart, world.now) >= 0 &&
      !collapsed.includes(o.id),
  );
  expect(visible).toHaveLength(1);
});
