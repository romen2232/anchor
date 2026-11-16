import { describe, expect, it } from 'vitest';
import { shiftLaterToday, snooze, split } from '../src/index';
import type { Existing, Item, Occurrence, RescheduleContext } from '../src/index';

const DATE = '2026-11-16';
const NEXT = '2026-11-17';
const at = (t: string, d = DATE) => `${d}T${t}:00Z`;

function item(id = 'a', o: Partial<Item> = {}): Item {
  return {
    id,
    userId: 'user-1',
    kind: 'oneoff',
    title: id,
    schedule: { type: 'once', date: DATE, startTime: '09:00', zone: 'UTC' },
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

function ctx(now: string, o: Partial<RescheduleContext> = {}): RescheduleContext {
  return {
    now: at(now),
    dayEnd: at('18:00'),
    nextDayStart: at('08:00', NEXT),
    nextDayEnd: at('18:00', NEXT),
    existingToday: [],
    existingTomorrow: [],
    ...o,
  };
}

const lunch: Existing = {
  occ: occ('lunch', '13:00', '14:00'),
  item: item('lunch', { kind: 'protected' }),
};
const tomorrowBusy = (id: string, start: string, end: string): Existing => ({
  occ: occ(id, start, end, { scheduledStart: at(start, NEXT), scheduledEnd: at(end, NEXT) }),
  item: item(id),
});
const wholeDay = (id: string, start: string, end: string): Existing => ({
  occ: occ(id, start, end),
  item: item(id),
});

describe('snooze', () => {
  it('sets the exact snoozedUntil and marks the occurrence user-modified', () => {
    const original = occ('a', '09:00', '09:30');
    const result = snooze(original, 10, at('09:05'));
    expect(result.snoozedUntil).toBe(at('09:15'));
    expect(result.userModified).toBe(true);
    expect(result.scheduledStart).toBe(original.scheduledStart);
    expect(original.snoozedUntil).toBeNull();
  });

  it('supports 30 minutes', () => {
    expect(snooze(occ('a', '09:00', '09:30'), 30, at('09:05')).snoozedUntil).toBe(at('09:35'));
  });
});

describe('shiftLaterToday', () => {
  it('skips past a protected lunch', () => {
    const result = shiftLaterToday(
      occ('a', '09:00', '09:30'),
      item(),
      ctx('13:15', { existingToday: [lunch] }),
    );
    expect(result).toMatchObject({
      scheduledStart: at('14:00'),
      scheduledEnd: at('14:30'),
      localDate: DATE,
      userModified: true,
      snoozedUntil: null,
    });
  });

  it('is never blocked by its own old slot and never moves earlier', () => {
    const self = occ('a', '09:00', '09:30');
    const result = shiftLaterToday(
      self,
      item(),
      ctx('08:00', { existingToday: [{ occ: self, item: item() }] }),
    );
    expect(result.scheduledStart).toBe(at('09:30'));
  });

  it('searches from now when that is later than the current slot', () => {
    const result = shiftLaterToday(occ('a', '09:00', '09:30'), item(), ctx('11:10'));
    expect(result.scheduledStart).toBe(at('11:10'));
  });

  it('tolerates start and end instants with seconds', () => {
    const result = shiftLaterToday(
      occ('a', '09:00', '09:30', { scheduledEnd: '2026-11-16T09:30:20Z' }),
      item(),
      ctx('11:00'),
    );
    expect(result.scheduledStart).toBe(at('11:00'));
  });

  it('remembers where a task moved from when it changes day', () => {
    const result = shiftLaterToday(occ('a', '09:00', '09:30'), item(), ctx('17:45'));
    expect(result.movedFrom).toEqual({ localDate: DATE, sequence: 0 });
  });

  it('does not record a move when the task stays on the same day', () => {
    const result = shiftLaterToday(occ('a', '09:00', '09:30'), item(), ctx('11:00'));
    expect(result.movedFrom ?? null).toBeNull();
  });

  it('keeps the original slot when a moved task moves again', () => {
    const moved = occ('a', '09:00', '09:30', {
      localDate: NEXT,
      sequence: 1,
      scheduledStart: at('09:00', NEXT),
      scheduledEnd: at('09:30', NEXT),
      movedFrom: { localDate: DATE, sequence: 0 },
    });
    const result = shiftLaterToday(moved, item(), {
      ...ctx('17:45'),
      now: at('17:45', NEXT),
      dayEnd: at('18:00', NEXT),
      nextDayStart: at('08:00', '2026-11-18'),
      nextDayEnd: at('18:00', '2026-11-18'),
    });
    expect(result.localDate).toBe('2026-11-18');
    expect(result.movedFrom).toEqual({ localDate: DATE, sequence: 0 });
  });

  it('gives a task moved to tomorrow a sequence that is free there', () => {
    const result = shiftLaterToday(
      occ('a', '09:00', '09:30'),
      item(),
      ctx('17:45', {
        existingTomorrow: [
          {
            occ: occ('a', '09:00', '09:30', {
              id: 'occ-a-tomorrow',
              localDate: NEXT,
              scheduledStart: at('09:00', NEXT),
              scheduledEnd: at('09:30', NEXT),
            }),
            item: item(),
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      localDate: NEXT,
      sequence: 1,
      scheduledStart: at('08:00', NEXT),
    });
  });

  it('leaves room for travel and prep before the start', () => {
    const result = shiftLaterToday(
      occ('a', '09:00', '09:30'),
      item('a', { travelMinutes: 10, prepMinutes: 5 }),
      ctx('13:00'),
    );
    expect(result.scheduledStart).toBe(at('13:15'));
    expect(result.scheduledEnd).toBe(at('13:45'));
  });

  it('moves to tomorrow first free slot when today has no room', () => {
    const result = shiftLaterToday(
      occ('a', '09:00', '09:30'),
      item(),
      ctx('23:00', {
        dayEnd: at('23:59'),
        existingToday: [wholeDay('busy', '10:00', '23:59')],
      }),
    );
    expect(result).toMatchObject({
      localDate: NEXT,
      scheduledStart: at('08:00', NEXT),
      scheduledEnd: at('08:30', NEXT),
      userModified: true,
    });
  });

  it('skips tomorrow commitments too', () => {
    const result = shiftLaterToday(
      occ('a', '09:00', '09:30'),
      item(),
      ctx('17:45', {
        existingTomorrow: [tomorrowBusy('t', '08:00', '09:00')],
      }),
    );
    expect(result).toMatchObject({ localDate: NEXT, scheduledStart: at('09:00', NEXT) });
  });

  it('throws when neither today nor tomorrow has room', () => {
    expect(() =>
      shiftLaterToday(
        occ('a', '09:00', '09:30'),
        item(),
        ctx('17:45', {
          existingTomorrow: [tomorrowBusy('t', '08:00', '18:00')],
        }),
      ),
    ).toThrow();
  });
});

describe('split', () => {
  it('splits 60 minutes at the start into 30 + 30', () => {
    const original = occ('a', '09:00', '10:00');
    const [first, second] = split(original, item(), ctx('09:00'));
    expect([first.scheduledStart, first.scheduledEnd]).toEqual([at('09:00'), at('09:30')]);
    expect([second.scheduledStart, second.scheduledEnd]).toEqual([at('09:30'), at('10:00')]);
    expect(second).toMatchObject({
      itemId: 'a',
      sequence: 1,
      splitFromOccurrenceId: 'occ-a',
      status: 'pending',
      userModified: true,
      localDate: DATE,
    });
    expect(first.userModified).toBe(true);
  });

  it('splits 45 minutes into 22 + 23', () => {
    const [first, second] = split(occ('a', '09:00', '09:45'), item(), ctx('09:00'));
    expect(first.scheduledEnd).toBe(at('09:22'));
    expect([second.scheduledStart, second.scheduledEnd]).toEqual([at('09:22'), at('09:45')]);
  });

  it('places the second part after the next free gap', () => {
    const [, second] = split(
      occ('a', '09:00', '10:00'),
      item(),
      ctx('09:00', { existingToday: [wholeDay('b', '09:30', '10:00')] }),
    );
    expect(second.scheduledStart).toBe(at('10:00'));
  });

  it('keeps the elapsed time in the first part when already started', () => {
    const [first, second] = split(occ('a', '09:00', '10:00'), item(), ctx('09:30'));
    expect([first.scheduledStart, first.scheduledEnd]).toEqual([at('09:00'), at('09:45')]);
    expect([second.scheduledStart, second.scheduledEnd]).toEqual([at('09:45'), at('10:00')]);
  });

  it('splits a task that started mid-minute without throwing', () => {
    const [first, second] = split(occ('a', '09:00', '10:00'), item(), {
      ...ctx('09:30'),
      now: '2026-11-16T09:30:30Z',
    });
    expect(first.scheduledEnd).toBe(at('09:45'));
    expect([second.scheduledStart, second.scheduledEnd]).toEqual([at('09:45'), at('10:00')]);
  });

  it('numbers a repeated split after the parts that already exist', () => {
    const earlier = occ('a', '10:00', '10:30', { id: 'occ-a-1', sequence: 1 });
    const [, second] = split(
      occ('a', '09:00', '10:00'),
      item(),
      ctx('09:00', { existingToday: [{ occ: earlier, item: item() }] }),
    );
    expect(second.sequence).toBe(2);
  });

  it('moves the second part to tomorrow when today is full', () => {
    const [, second] = split(
      occ('a', '17:00', '18:00'),
      item(),
      ctx('17:00', { existingToday: [wholeDay('b', '17:30', '18:00')] }),
    );
    expect(second).toMatchObject({ localDate: NEXT, scheduledStart: at('08:00', NEXT) });
  });

  it('refuses to split what is too short to halve', () => {
    expect(() => split(occ('a', '09:00', '09:01'), item(), ctx('09:00'))).toThrow(RangeError);
  });
});
