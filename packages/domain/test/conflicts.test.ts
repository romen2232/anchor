import { describe, expect, it } from 'vitest';
import { findConflicts, nearestFreeSlot, occupiedWindow } from '../src/index';
import type { Item, Occurrence } from '../src/index';

const DATE = '2026-11-16';
const at = (t: string) => `${DATE}T${t}:00Z`;

function item(id: string, o: Partial<Item> = {}): Item {
  return {
    id,
    userId: 'user-1',
    kind: 'oneoff',
    title: id,
    schedule: { type: 'once', date: DATE, startTime: '08:00', zone: 'UTC' },
    durationMinutes: 30,
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn: [],
    reminderPolicy: null,
    deletedAt: null,
    ...o,
  };
}

function occ(itemId: string, start: string, end: string, o: Partial<Occurrence> = {}): Occurrence {
  return {
    id: `occ-${itemId}`,
    itemId,
    localDate: DATE,
    sequence: 0,
    scheduledStart: at(start),
    scheduledEnd: at(end),
    status: 'pending',
    snoozedUntil: null,
    splitFromOccurrenceId: null,
    userModified: false,
    actualStart: null,
    actualEnd: null,
    ...o,
  };
}

const lunch = { occ: occ('lunch', '13:00', '14:00'), item: item('lunch', { kind: 'protected' }) };

describe('occupiedWindow', () => {
  it('spans leaveBy to scheduledEnd, excluding buffers', () => {
    const i = item('a', { travelMinutes: 10, prepMinutes: 5, bufferAfterMinutes: 20 });
    expect(occupiedWindow(occ('a', '09:00', '10:00'), i)).toEqual({
      start: at('08:45'),
      end: at('10:00'),
    });
  });
});

describe('findConflicts', () => {
  it('flags overlap with protected lunch as protected', () => {
    expect(findConflicts({ start: at('13:15'), end: at('13:45') }, [lunch])).toEqual([
      { occurrenceId: 'occ-lunch', protected: true },
    ]);
  });

  it('counts overlap with the travel window only', () => {
    const trip = { occ: occ('trip', '10:00', '11:00'), item: item('trip', { travelMinutes: 30 }) };
    expect(findConflicts({ start: at('09:40'), end: at('09:50') }, [trip])).toEqual([
      { occurrenceId: 'occ-trip', protected: false },
    ]);
  });

  it('does not count touching edges', () => {
    expect(findConflicts({ start: at('14:00'), end: at('14:30') }, [lunch])).toEqual([]);
    expect(findConflicts({ start: at('12:30'), end: at('13:00') }, [lunch])).toEqual([]);
  });

  it('ignores done and skipped occurrences', () => {
    for (const status of ['done', 'skipped'] as const) {
      const e = { occ: occ('x', '13:00', '14:00', { status }), item: item('x') };
      expect(findConflicts({ start: at('13:15'), end: at('13:45') }, [e])).toEqual([]);
    }
  });
});

describe('nearestFreeSlot', () => {
  it('returns after when nothing is in the way', () => {
    expect(nearestFreeSlot(30, at('09:00'), at('18:00'), [lunch])).toBe(at('09:00'));
  });

  it('skips past lunch to lunch end', () => {
    expect(nearestFreeSlot(30, at('13:15'), at('18:00'), [lunch])).toBe(at('14:00'));
  });

  it('returns null when the day is full', () => {
    expect(nearestFreeSlot(30, at('13:15'), at('14:15'), [lunch])).toBeNull();
  });

  it('allows ending exactly at dayEnd', () => {
    expect(nearestFreeSlot(30, at('13:15'), at('14:30'), [lunch])).toBe(at('14:00'));
  });
});
