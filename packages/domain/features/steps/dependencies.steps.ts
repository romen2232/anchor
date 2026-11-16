import { Given, Then, When } from 'quickpickle';
import { expect } from 'vitest';
import { addMinutes, findCycle, isBlocked, toInstant } from '../../src/index';
import type { Item, LocalDate, LocalTime, Occurrence, OccurrenceStatus } from '../../src/index';
import type { DomainWorld } from './world';

const TASK_DATE: LocalDate = '2026-11-17';
const TASK_START: LocalTime = '09:00';
const TASK_MINUTES = 30;

interface DependenciesWorld extends DomainWorld {
  cycle?: string[] | null;
}

function taskItem(world: DependenciesWorld, title: string): Item {
  return {
    id: `item-${world.items.length + 1}`,
    userId: 'user-1',
    kind: 'oneoff',
    title,
    schedule: { type: 'once', date: TASK_DATE, startTime: TASK_START, zone: world.zone },
    durationMinutes: TASK_MINUTES,
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn: [],
    reminderPolicy: null,
    deletedAt: null,
  };
}

function taskOccurrence(
  world: DependenciesWorld,
  item: Item,
  status: OccurrenceStatus,
): Occurrence {
  const scheduledStart = toInstant(TASK_DATE, TASK_START, world.zone);
  return {
    id: `occ-${world.occurrences.length + 1}`,
    itemId: item.id,
    localDate: TASK_DATE,
    sequence: 0,
    scheduledStart,
    scheduledEnd: addMinutes(scheduledStart, TASK_MINUTES),
    status,
    snoozedUntil: null,
    splitFromOccurrenceId: null,
    userModified: false,
    actualStart: null,
    actualEnd: null,
  };
}

function findOrCreateTask(world: DependenciesWorld, title: string): Item {
  const existing = world.items.find((i) => i.title === title);
  if (existing) return existing;
  const item = taskItem(world, title);
  world.items.push(item);
  return item;
}

function itemOf(world: DependenciesWorld, title: string): Item {
  const item = world.items.find((i) => i.title === title);
  if (!item) throw new Error(`No task named "${title}" was set up in this scenario`);
  return item;
}

function titleOf(world: DependenciesWorld, itemId: string): string {
  const item = world.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No task with id ${itemId} was set up in this scenario`);
  return item.title;
}

function makeWait(world: DependenciesWorld, waiter: string, waitedOn: string): void {
  const item = findOrCreateTask(world, waiter);
  const dependency = findOrCreateTask(world, waitedOn);
  item.dependsOn.push(dependency.id);
}

/** Puts both tasks on the same day, with the dependency in the given state. */
function setUpDay(world: DependenciesWorld, dependencyTitle: string, status: OccurrenceStatus) {
  const dependency = itemOf(world, dependencyTitle);
  const waiting = world.items.filter((i) => i.dependsOn.includes(dependency.id));
  world.occurrences = [
    taskOccurrence(world, dependency, status),
    ...waiting.map((item) => taskOccurrence(world, item, 'pending')),
  ];
}

function blockageOf(world: DependenciesWorld, title: string) {
  const item = itemOf(world, title);
  const occurrence = world.occurrences.find((o) => o.itemId === item.id);
  if (!occurrence) throw new Error(`"${title}" has nothing planned for today`);
  return isBlocked(occurrence, item, world.occurrences);
}

Given('{string} waits for {string}', async (world: DependenciesWorld, a: string, b: string) => {
  makeWait(world, a, b);
});

When('{string} is still open', async (world: DependenciesWorld, title: string) => {
  setUpDay(world, title, 'pending');
});

When('{string} is skipped', async (world: DependenciesWorld, title: string) => {
  setUpDay(world, title, 'skipped');
});

When(
  'I make {string} wait for {string}',
  async (world: DependenciesWorld, a: string, b: string) => {
    makeWait(world, a, b);
    world.cycle = findCycle(world.items);
  },
);

Then(
  '{string} is waiting on {string}',
  async (world: DependenciesWorld, title: string, waitedOn: string) => {
    const { blocked, waitingOn } = blockageOf(world, title);
    expect(blocked).toBe(true);
    expect(waitingOn.map((id) => titleOf(world, id))).toEqual([waitedOn]);
  },
);

Then('{string} is ready', async (world: DependenciesWorld, title: string) => {
  expect(blockageOf(world, title).blocked).toBe(false);
});

Then('I am told the tasks would wait for each other forever', async (world: DependenciesWorld) => {
  if (world.cycle === undefined)
    throw new Error('Nothing was checked yet: say "I make <task> wait for <task>" first');
  expect(world.cycle).not.toBeNull();
});
