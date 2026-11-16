import { Given, Then, When } from 'quickpickle';
import { expect } from 'vitest';
import { addMinutes, findConflicts, nearestFreeSlot, toInstant } from '../../src/index';
import type { Conflict, Instant, Item, LocalDate, LocalTime, Occurrence } from '../../src/index';
import type { DomainWorld } from './world';

const TODAY: LocalDate = '2026-11-17';
const DAY_END: LocalTime = '22:00';

interface ProtectedWorld extends DomainWorld {
  conflicts?: Conflict[];
  offered?: Instant | null;
}

const hhmm = (h: number, m: number): LocalTime =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

Given(
  'a protected {string} {int}:{int}-{int}:{int}',
  async (world: ProtectedWorld, title: string, h1: number, m1: number, h2: number, m2: number) => {
    const scheduledStart = toInstant(TODAY, hhmm(h1, m1), world.zone);
    const scheduledEnd = toInstant(TODAY, hhmm(h2, m2), world.zone);
    const item: Item = {
      id: `item-${world.items.length + 1}`,
      userId: 'user-1',
      kind: 'protected',
      title,
      schedule: { type: 'once', date: TODAY, startTime: hhmm(h1, m1), zone: world.zone },
      durationMinutes: (Date.parse(scheduledEnd) - Date.parse(scheduledStart)) / 60_000,
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
  },
);

When(
  'I try to place a {int} minute task at {int}:{int}',
  async (world: ProtectedWorld, minutes: number, h: number, m: number) => {
    const start = toInstant(TODAY, hhmm(h, m), world.zone);
    const existing = world.occurrences.map((occ) => ({
      occ,
      item: world.items.find((i) => i.id === occ.itemId)!,
    }));
    world.conflicts = findConflicts({ start, end: addMinutes(start, minutes) }, existing);
    world.offered = nearestFreeSlot(
      minutes,
      start,
      toInstant(TODAY, DAY_END, world.zone),
      existing,
    );
  },
);

Then('I am warned', async (world: ProtectedWorld) => {
  expect(world.conflicts?.some((c) => c.protected)).toBe(true);
});

Then('I am offered {int}:{int}', async (world: ProtectedWorld, h: number, m: number) => {
  expect(world.offered).toBe(toInstant(TODAY, hhmm(h, m), world.zone));
});
