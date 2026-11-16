import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, materialize, occurrenceKey, occursOn } from '../src/index';
import type { Item, LocalDate, Schedule, Weekday } from '../src/index';

const ALL_DAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function item(overrides: Partial<Item> & Pick<Item, 'schedule'>): Item {
  return {
    id: 'item-1',
    userId: 'user-1',
    kind: 'routine',
    title: 'Gym',
    durationMinutes: 60,
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn: [],
    reminderPolicy: null,
    deletedAt: null,
    ...overrides,
  };
}

const weekly = (byDay: Weekday[], startTime: string): Schedule => ({
  type: 'weekly',
  byDay,
  startTime,
  zone: 'Europe/Madrid',
});

const once = (date: LocalDate, startTime: string): Schedule => ({
  type: 'once',
  date,
  startTime,
  zone: 'Europe/Madrid',
});

describe('materialize', () => {
  it('creates a draft for each matching day in the window', () => {
    const drafts = materialize(
      [item({ schedule: weekly(['MO', 'WE'], '09:00') })],
      '2026-11-16',
      7,
    );
    expect(drafts.map((d) => d.scheduledStart)).toEqual([
      '2026-11-16T08:00:00Z',
      '2026-11-18T08:00:00Z',
    ]);
  });

  it('fills drafts with pending defaults and an end from the duration', () => {
    const [draft] = materialize([item({ schedule: weekly(['MO'], '09:00') })], '2026-11-16', 1);
    expect(draft).toEqual({
      itemId: 'item-1',
      localDate: '2026-11-16',
      sequence: 0,
      scheduledStart: '2026-11-16T08:00:00Z',
      scheduledEnd: '2026-11-16T09:00:00Z',
      status: 'pending',
      snoozedUntil: null,
      splitFromOccurrenceId: null,
      userModified: false,
      actualStart: null,
      actualEnd: null,
    });
  });

  it('includes a one-time item inside the window', () => {
    const drafts = materialize([item({ schedule: once('2026-11-19', '10:00') })], '2026-11-16', 7);
    expect(drafts).toHaveLength(1);
  });

  it('excludes a one-time item outside the window', () => {
    const drafts = materialize([item({ schedule: once('2026-11-23', '10:00') })], '2026-11-16', 7);
    expect(drafts).toHaveLength(0);
  });

  it('includes the last day of the window', () => {
    const drafts = materialize([item({ schedule: once('2026-11-23', '10:00') })], '2026-11-16', 8);
    expect(drafts).toHaveLength(1);
  });

  it('skips deleted items', () => {
    const deleted = item({
      schedule: weekly(['MO'], '09:00'),
      deletedAt: '2026-11-10T08:00:00Z',
    });
    expect(materialize([deleted], '2026-11-16', 7)).toHaveLength(0);
  });

  it('keeps a task that crosses midnight on the day it starts', () => {
    const [draft] = materialize(
      [item({ schedule: once('2026-11-17', '23:30'), durationMinutes: 60 })],
      '2026-11-16',
      7,
    );
    expect(draft).toMatchObject({
      localDate: '2026-11-17',
      scheduledStart: '2026-11-17T22:30:00Z',
      scheduledEnd: '2026-11-17T23:30:00Z',
    });
  });

  it('shifts a nonexistent spring-forward time to the first valid instant', () => {
    const drafts = materialize([item({ schedule: weekly(ALL_DAYS, '02:30') })], '2026-03-27', 7);
    expect(drafts).toHaveLength(7);
    const dst = drafts.find((d) => d.localDate === '2026-03-29');
    expect(dst?.scheduledStart).toBe('2026-03-29T01:30:00Z');
  });

  it('picks the earlier instant for an ambiguous autumn time', () => {
    const drafts = materialize([item({ schedule: weekly(ALL_DAYS, '02:30') })], '2026-10-23', 7);
    expect(drafts).toHaveLength(7);
    const dst = drafts.find((d) => d.localDate === '2026-10-25');
    expect(dst?.scheduledStart).toBe('2026-10-25T00:30:00Z');
  });

  it('sorts by start, then item id, then date', () => {
    const b = item({ id: 'b', schedule: once('2026-11-16', '09:00') });
    const a = item({ id: 'a', schedule: once('2026-11-16', '09:00') });
    const early = item({ id: 'c', schedule: once('2026-11-16', '08:00') });
    const ids = materialize([b, a, early], '2026-11-16', 1).map((d) => d.itemId);
    expect(ids).toEqual(['c', 'a', 'b']);
  });

  it('is deterministic regardless of input order', () => {
    const items = [
      item({ id: 'x', schedule: weekly(['MO', 'TU'], '09:00') }),
      item({ id: 'y', schedule: weekly(['MO', 'TU'], '09:00') }),
    ];
    expect(materialize([...items].reverse(), '2026-11-16', 7)).toEqual(
      materialize(items, '2026-11-16', 7),
    );
  });

  it('produces unique occurrence keys across random item sets', () => {
    const scheduleArb = fc.oneof(
      fc.record({
        type: fc.constant('weekly' as const),
        byDay: fc.subarray(ALL_DAYS, { minLength: 1 }),
        startTime: fc.constantFrom('00:00', '02:30', '09:00', '23:30'),
        zone: fc.constant('Europe/Madrid'),
      }),
      fc.record({
        type: fc.constant('once' as const),
        date: fc.integer({ min: 0, max: 40 }).map((n) => addDays('2026-03-20', n)),
        startTime: fc.constantFrom('00:00', '02:30', '09:00', '23:30'),
        zone: fc.constant('Europe/Madrid'),
      }),
    );
    fc.assert(
      fc.property(
        fc.array(fc.record({ schedule: scheduleArb, deleted: fc.boolean() }), { maxLength: 8 }),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 14 }),
        (specs, offset, days) => {
          const items = specs.map(({ schedule, deleted }, i) =>
            item({
              id: `item-${i}`,
              schedule,
              deletedAt: deleted ? '2026-03-01T00:00:00Z' : null,
            }),
          );
          const from = addDays('2026-03-20', offset);
          let expected = 0;
          for (const it of items) {
            if (it.deletedAt !== null) continue;
            for (let d = 0; d < days; d++) {
              if (occursOn(it.schedule, addDays(from, d))) expected++;
            }
          }
          const keys = materialize(items, from, days).map(occurrenceKey);
          expect(keys).toHaveLength(expected);
          expect(new Set(keys).size).toBe(keys.length);
        },
      ),
    );
  });
});

describe('occurrenceKey', () => {
  it('joins item, local date and sequence', () => {
    expect(occurrenceKey({ itemId: 'item-1', localDate: '2026-11-16', sequence: 0 })).toBe(
      'item-1:2026-11-16:0',
    );
  });
});
