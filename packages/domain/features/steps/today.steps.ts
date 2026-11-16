import { Given, Then, When } from 'quickpickle';
import { expect } from 'vitest';
import { addMinutes, buildTodayView, toInstant } from '../../src/index';
import type { Item, LocalDate, LocalTime, Occurrence, TodayView } from '../../src/index';
import type { DomainWorld } from './world';

const TODAY: LocalDate = '2026-11-17';
const DEFAULT_MINUTES = 30;

interface TodayWorld extends DomainWorld {
  view?: TodayView;
}

function addTask(world: TodayWorld, title: string, start: LocalTime, end: LocalTime | null) {
  const scheduledStart = toInstant(TODAY, start, world.zone);
  const scheduledEnd = end
    ? toInstant(TODAY, end, world.zone)
    : addMinutes(scheduledStart, DEFAULT_MINUTES);
  const item: Item = {
    id: `item-${world.items.length + 1}`,
    userId: 'user-1',
    kind: 'oneoff',
    title,
    schedule: { type: 'once', date: TODAY, startTime: start, zone: world.zone },
    durationMinutes: DEFAULT_MINUTES,
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn: [],
    reminderPolicy: null,
    deletedAt: null,
  };
  const occurrence: Occurrence = {
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
  };
  world.items.push(item);
  world.occurrences.push(occurrence);
}

function viewOf(world: TodayWorld): TodayView {
  if (!world.view) throw new Error('Say what time it is first: "it is HH:MM"');
  return world.view;
}

Given(
  '{string} {int}:{int}-{int}:{int}, {string} {int}:{int}-{int}:{int} and {string} {int}:{int}',
  async (
    world: TodayWorld,
    a: string,
    ah1: number,
    am1: number,
    ah2: number,
    am2: number,
    b: string,
    bh1: number,
    bm1: number,
    bh2: number,
    bm2: number,
    c: string,
    ch: number,
    cm: number,
  ) => {
    const t = (h: number, m: number) =>
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    addTask(world, a, t(ah1, am1), t(ah2, am2));
    addTask(world, b, t(bh1, bm1), t(bh2, bm2));
    addTask(world, c, t(ch, cm), null);
  },
);

Given(
  '{string} {int}:{int}-{int}:{int} is still open',
  async (world: TodayWorld, title: string, h1: number, m1: number, h2: number, m2: number) => {
    const t = (h: number, m: number) =>
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    addTask(world, title, t(h1, m1), t(h2, m2));
  },
);

When('it is {int}:{int}', async (world: TodayWorld, h: number, m: number) => {
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  world.now = toInstant(TODAY, time, world.zone);
  world.view = buildTodayView(world.items, world.occurrences, TODAY, world.now);
});

const titleOf = (world: TodayWorld, entry: { item: Item } | null) => entry?.item.title ?? null;

Then('Now is {string}', async (world: TodayWorld, title: string) => {
  expect(titleOf(world, viewOf(world).now)).toBe(title);
});

Then('Next is {string}', async (world: TodayWorld, title: string) => {
  expect(titleOf(world, viewOf(world).next)).toBe(title);
});

Then('the timeline shows all three', async (world: TodayWorld) => {
  expect(viewOf(world).timeline.map((e) => e.item.title)).toEqual(world.items.map((i) => i.title));
  expect(world.items).toHaveLength(3);
});

Then('{string} is in Later', async (world: TodayWorld, title: string) => {
  expect(viewOf(world).later.map((e) => e.item.title)).toContain(title);
});

Then('nothing calls it overdue', async (world: TodayWorld) => {
  const text = JSON.stringify(viewOf(world)).toLowerCase();
  for (const word of ['overdue', 'failed', 'missed', 'streak']) {
    expect(text).not.toContain(word);
  }
});
