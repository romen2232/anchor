import { Given, Then, When } from 'quickpickle';
import { expect } from 'vitest';
import { materialize, weekdayOf } from '../../src/index';
import type {
  Item,
  LocalDate,
  LocalTime,
  OccurrenceDraft,
  Schedule,
  Weekday,
} from '../../src/index';
import type { DomainWorld } from './world';

const WEEKDAYS: Record<string, Weekday> = {
  Monday: 'MO',
  Tuesday: 'TU',
  Wednesday: 'WE',
  Thursday: 'TH',
  Friday: 'FR',
  Saturday: 'SA',
  Sunday: 'SU',
};

const MONTHS: Record<string, string> = { Nov: '11' };

interface PlanningWorld extends DomainWorld {
  planned?: OccurrenceDraft[];
}

function weekdayCode(name: string): Weekday {
  const code = WEEKDAYS[name];
  if (!code) throw new Error(`Unknown weekday ${name}`);
  return code;
}

function dateOf(day: number, month: string): LocalDate {
  const mm = MONTHS[month];
  if (!mm) throw new Error(`Unknown month ${month}`);
  return `2026-${mm}-${String(day).padStart(2, '0')}`;
}

function addItem(
  world: PlanningWorld,
  title: string,
  schedule: Schedule,
  durationMinutes: number,
): void {
  const item: Item = {
    id: `item-${world.items.length + 1}`,
    userId: 'user-1',
    kind: schedule.type === 'weekly' ? 'routine' : 'oneoff',
    title,
    schedule,
    durationMinutes,
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn: [],
    reminderPolicy: null,
    deletedAt: null,
  };
  world.items.push(item);
}

function itemIdOf(world: PlanningWorld, title: string): string {
  const item = world.items.find((i) => i.title === title);
  if (!item) throw new Error(`No task named "${title}" was set up in this scenario`);
  return item.id;
}

Given(
  'a routine {string} on {word} and {word}',
  async (world: PlanningWorld, title: string, first: string, second: string) => {
    addItem(
      world,
      title,
      {
        type: 'weekly',
        byDay: [weekdayCode(first), weekdayCode(second)],
        startTime: '09:00' as LocalTime,
        zone: world.zone,
      },
      60,
    );
  },
);

Given(
  'a routine {string} on {word} at {word} for {int} minutes',
  async (world: PlanningWorld, title: string, day: string, time: string, minutes: number) => {
    addItem(
      world,
      title,
      { type: 'weekly', byDay: [weekdayCode(day)], startTime: time, zone: world.zone },
      minutes,
    );
  },
);

Given(
  'a one-time task {string} on {word} {int} {word} at {word}',
  async (
    world: PlanningWorld,
    title: string,
    weekday: string,
    day: number,
    month: string,
    time: string,
  ) => {
    const date = dateOf(day, month);
    if (weekdayOf(date) !== weekdayCode(weekday)) {
      throw new Error(`${date} is not a ${weekday}`);
    }
    addItem(world, title, { type: 'once', date, startTime: time, zone: world.zone }, 30);
  },
);

When(
  'the week of {int} {word} is planned',
  async (world: PlanningWorld, day: number, month: string) => {
    world.planned = materialize(world.items, dateOf(day, month), 7);
  },
);

function plannedOf(world: PlanningWorld): OccurrenceDraft[] {
  if (!world.planned) throw new Error('The week has not been planned yet in this scenario');
  return world.planned;
}

Then('I see {int} tasks in that week', async (world: PlanningWorld, count: number) => {
  expect(plannedOf(world)).toHaveLength(count);
});

Then(
  '{string} appears on {word} {int} {word}',
  async (world: PlanningWorld, title: string, weekday: string, day: number, month: string) => {
    const date = dateOf(day, month);
    expect(weekdayOf(date)).toBe(weekdayCode(weekday));
    const id = itemIdOf(world, title);
    const dates = plannedOf(world)
      .filter((o) => o.itemId === id)
      .map((o) => o.localDate);
    expect(dates).toContain(date);
  },
);
