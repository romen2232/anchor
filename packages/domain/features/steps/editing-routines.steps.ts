import { Given, Then, When } from 'quickpickle';
import { expect } from 'vitest';
import {
  materialize,
  occurrenceKey,
  planRegeneration,
  shiftLaterToday,
  snooze,
  toInstant,
} from '../../src/index';
import type {
  Item,
  LocalDate,
  LocalTime,
  Occurrence,
  OccurrenceDraft,
  RegenerationPlan,
} from '../../src/index';
import type { DomainWorld } from './world';

const MONDAY: LocalDate = '2026-11-16';
const TUESDAY: LocalDate = '2026-11-17';
const WEDNESDAY: LocalDate = '2026-11-18';
const WEEKDAYS = 5;

interface RoutineWorld extends DomainWorld {
  plan?: RegenerationPlan;
}

const hhmm = (h: number, m: number): LocalTime =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function gym(world: RoutineWorld, title: string, startTime: LocalTime): Item {
  return {
    id: 'item-1',
    userId: 'user-1',
    kind: 'routine',
    title,
    schedule: {
      type: 'weekly',
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      startTime,
      zone: world.zone,
    },
    durationMinutes: 60,
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn: [],
    reminderPolicy: null,
    deletedAt: null,
  };
}

const asOccurrence = (d: OccurrenceDraft): Occurrence => ({ ...d, id: `occ-${occurrenceKey(d)}` });

Given(
  "{string} at {int}:{int} every weekday and I snoozed Wednesday's {string}",
  async (world: RoutineWorld, title: string, h: number, m: number) => {
    const item = gym(world, title, hhmm(h, m));
    world.items = [item];
    world.now = toInstant(MONDAY, '07:00', world.zone);
    world.occurrences = materialize([item], MONDAY, WEEKDAYS)
      .map(asOccurrence)
      .map((o) => (o.localDate === WEDNESDAY ? snooze(o, 30, world.now) : o));
  },
);

When(
  'I change {string} to {int}:{int}',
  async (world: RoutineWorld, _t: string, h: number, m: number) => {
    const edited = gym(world, world.items[0]!.title, hhmm(h, m));
    const drafts = materialize([edited], MONDAY, WEEKDAYS);
    world.plan = planRegeneration(world.occurrences, drafts, world.now);
  },
);

Then(
  'the other upcoming days move to {int}:{int}',
  async (world: RoutineWorld, h: number, m: number) => {
    const plan = world.plan!;
    const others = world.occurrences.filter((o) => o.localDate !== WEDNESDAY);
    expect(plan.remove.sort()).toEqual(others.map((o) => o.id).sort());
    expect(plan.create).toHaveLength(others.length);
    for (const draft of plan.create) {
      expect(draft.scheduledStart).toBe(toInstant(draft.localDate, hhmm(h, m), world.zone));
    }
  },
);

Then('Wednesday stays as I left it', async (world: RoutineWorld) => {
  const wednesday = world.occurrences.find((o) => o.localDate === WEDNESDAY)!;
  expect(world.plan!.keep).toContain(wednesday.id);
  expect(world.plan!.remove).not.toContain(wednesday.id);
  expect(world.plan!.create.some((d) => d.localDate === WEDNESDAY)).toBe(false);
});

Given(
  "{string} at {int}:{int} every weekday and I moved Tuesday's {string} to tomorrow",
  async (world: RoutineWorld, title: string, h: number, m: number) => {
    const item = gym(world, title, hhmm(h, m));
    world.items = [item];
    world.now = toInstant(MONDAY, '07:00', world.zone);
    const all = materialize([item], MONDAY, WEEKDAYS).map(asOccurrence);
    const tuesday = all.find((o) => o.localDate === TUESDAY)!;
    const wednesday = all.filter((o) => o.localDate === WEDNESDAY).map((occ) => ({ occ, item }));
    // Tuesday has no room left, so the shift lands on Wednesday morning.
    const moved = shiftLaterToday(tuesday, item, {
      now: tuesday.scheduledStart,
      dayEnd: tuesday.scheduledEnd,
      nextDayStart: toInstant(WEDNESDAY, '08:00', world.zone),
      nextDayEnd: toInstant(WEDNESDAY, '23:59', world.zone),
      existingToday: [],
      existingTomorrow: wednesday,
    });
    world.occurrences = all.map((o) => (o.id === tuesday.id ? moved : o));
  },
);

Then('Tuesday gets no new {string}', async (world: RoutineWorld) => {
  expect(world.plan!.create.some((d) => d.localDate === TUESDAY)).toBe(false);
});

Then('the moved {string} stays where I put it', async (world: RoutineWorld) => {
  const moved = world.occurrences.find((o) => o.movedFrom)!;
  expect(moved.localDate).toBe(WEDNESDAY);
  expect(world.plan!.keep).toContain(moved.id);
  expect(world.plan!.remove).not.toContain(moved.id);
});
