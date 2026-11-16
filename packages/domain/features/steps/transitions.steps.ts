import { Given, Then, When } from 'quickpickle';
import { expect } from 'vitest';
import { materialize, toInstant, transitionWarnings, weekdayOf } from '../../src/index';
import type { Item, LocalDate, Occurrence, Warning, Weekday } from '../../src/index';
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

interface TransitionsWorld extends DomainWorld {
  warnings?: Warning[];
  warnedOccurrence?: Occurrence;
}

function dateOf(day: number, month: string): LocalDate {
  const mm = MONTHS[month];
  if (!mm) throw new Error(`Unknown month ${month}`);
  return `2026-${mm}-${String(day).padStart(2, '0')}`;
}

Given(
  'a one-time task {string} on {word} {int} {word} at {word} with {int} minutes travel and {int} minutes prep',
  async (
    world: TransitionsWorld,
    title: string,
    weekday: string,
    day: number,
    month: string,
    time: string,
    travelMinutes: number,
    prepMinutes: number,
  ) => {
    const date = dateOf(day, month);
    if (weekdayOf(date) !== WEEKDAYS[weekday]) throw new Error(`${date} is not a ${weekday}`);
    const item: Item = {
      id: `item-${world.items.length + 1}`,
      userId: 'user-1',
      kind: 'oneoff',
      title,
      schedule: { type: 'once', date, startTime: time, zone: world.zone },
      durationMinutes: 30,
      prepMinutes,
      travelMinutes,
      bufferAfterMinutes: 0,
      essential: false,
      dependsOn: [],
      reminderPolicy: null,
      deletedAt: null,
    };
    world.items.push(item);
  },
);

When('I check my heads-ups for {string}', async (world: TransitionsWorld, title: string) => {
  const item = world.items.find((i) => i.title === title);
  if (!item) throw new Error(`No task named "${title}" was set up in this scenario`);
  const [draft] = materialize([item], '2026-11-16', 7);
  if (!draft) throw new Error(`"${title}" does not come up in the week of 16 Nov`);
  const occurrence: Occurrence = { ...draft, id: 'occurrence-1' };
  world.warnedOccurrence = occurrence;
  world.warnings = transitionWarnings(occurrence, item);
});

function warningsOf(world: TransitionsWorld): Warning[] {
  if (!world.warnings) throw new Error('No heads-ups were checked yet in this scenario');
  return world.warnings;
}

Then(
  'I am told {string} at {word}',
  async (world: TransitionsWorld, message: string, time: string) => {
    const warnings = warningsOf(world);
    const warning = warnings.find((w) => w.message === message);
    if (!warning) throw new Error(`I was never told "${message}"`);
    const occurrence = world.warnedOccurrence;
    if (!occurrence) throw new Error('The checked task is missing from this scenario');
    expect(warning.at).toBe(toInstant(occurrence.localDate, time, world.zone));
  },
);

Then('I am not told {string}', async (world: TransitionsWorld, message: string) => {
  expect(warningsOf(world).map((w) => w.message)).not.toContain(message);
});
