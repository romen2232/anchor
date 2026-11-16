import { describe, expect, it } from 'vitest';
import { buildTodayView } from '../src/index';
import type { Item, Occurrence } from '../src/index';

const DATE = '2026-11-16';

function item(id: string, dependsOn: string[] = []): Item {
  return {
    id,
    userId: 'user-1',
    kind: 'oneoff',
    title: id,
    schedule: { type: 'once', date: DATE, startTime: '08:00', zone: 'Europe/Madrid' },
    durationMinutes: 30,
    prepMinutes: 0,
    travelMinutes: 0,
    bufferAfterMinutes: 0,
    essential: false,
    dependsOn,
    reminderPolicy: null,
    deletedAt: null,
  };
}

/** Times are UTC "HH:MM" on the test date. */
function occ(itemId: string, start: string, end: string, o: Partial<Occurrence> = {}): Occurrence {
  return {
    id: `occ-${itemId}`,
    itemId,
    localDate: DATE,
    sequence: 0,
    scheduledStart: `${DATE}T${start}:00Z`,
    scheduledEnd: `${DATE}T${end}:00Z`,
    status: 'pending',
    snoozedUntil: null,
    splitFromOccurrenceId: null,
    userModified: false,
    actualStart: null,
    actualEnd: null,
    ...o,
  };
}

const at = (time: string) => `${DATE}T${time}:00Z`;
const ids = (entries: { item: Item }[]) => entries.map((e) => e.item.id);

describe('buildTodayView', () => {
  it('returns nothing for an empty day', () => {
    expect(buildTodayView([], [], DATE, at('09:00'))).toEqual({
      now: null,
      next: null,
      later: [],
      timeline: [],
    });
  });

  it('picks the pending occurrence whose window contains now', () => {
    const view = buildTodayView(
      [item('a'), item('b')],
      [occ('a', '08:00', '09:00'), occ('b', '10:00', '11:00')],
      DATE,
      at('08:30'),
    );
    expect(view.now?.item.id).toBe('a');
    expect(view.next?.item.id).toBe('b');
    expect(view.later).toEqual([]);
  });

  it('treats the end of the window as exclusive', () => {
    const view = buildTodayView([item('a')], [occ('a', '08:00', '09:00')], DATE, at('09:00'));
    expect(view.now).toBeNull();
    expect(ids(view.later)).toEqual(['a']);
  });

  it('lets an active occurrence win now even if another overlaps', () => {
    const view = buildTodayView(
      [item('a'), item('b')],
      [occ('a', '08:00', '09:00'), occ('b', '08:30', '09:30', { status: 'active' })],
      DATE,
      at('08:45'),
    );
    expect(view.now?.item.id).toBe('b');
  });

  it('picks the earliest start when several windows contain now', () => {
    const view = buildTodayView(
      [item('a'), item('b')],
      [occ('b', '08:10', '09:30'), occ('a', '08:00', '09:00')],
      DATE,
      at('08:45'),
    );
    expect(view.now?.item.id).toBe('a');
  });

  it('never makes a blocked occurrence now or next, and lists it in later with waitingOn', () => {
    const view = buildTodayView(
      [item('a'), item('b', ['a'])],
      [occ('a', '12:00', '13:00'), occ('b', '08:00', '09:00')],
      DATE,
      at('08:30'),
    );
    expect(view.now).toBeNull();
    expect(view.next?.item.id).toBe('a');
    const blocked = view.later.find((e) => e.item.id === 'b');
    expect(blocked?.blocked).toBe(true);
    expect(blocked?.waitingOn).toEqual(['a']);
  });

  it('skips a blocked entry when choosing next', () => {
    const view = buildTodayView(
      [item('a'), item('b', ['a']), item('c')],
      [occ('a', '15:00', '16:00'), occ('b', '10:00', '11:00'), occ('c', '12:00', '13:00')],
      DATE,
      at('09:00'),
    );
    expect(view.next?.item.id).toBe('c');
    expect(ids(view.later)).toEqual(['b', 'a']);
  });

  it('lets an active occurrence be now even when it is blocked', () => {
    const view = buildTodayView(
      [item('a'), item('b', ['a'])],
      [occ('a', '12:00', '13:00'), occ('b', '08:00', '09:00', { status: 'active' })],
      DATE,
      at('08:30'),
    );
    expect(view.now?.item.id).toBe('b');
    expect(view.now?.blocked).toBe(true);
  });

  it('uses snoozedUntil to order and pick next', () => {
    const view = buildTodayView(
      [item('a'), item('b')],
      [occ('a', '10:00', '11:00', { snoozedUntil: at('14:00') }), occ('b', '12:00', '13:00')],
      DATE,
      at('09:00'),
    );
    expect(view.next?.item.id).toBe('b');
    expect(ids(view.later)).toEqual(['a']);
    expect(ids(view.timeline)).toEqual(['b', 'a']);
  });

  it('keeps past-due pending entries in later, never filtered out', () => {
    const view = buildTodayView(
      [item('a'), item('b')],
      [occ('a', '07:00', '08:00'), occ('b', '09:00', '10:00')],
      DATE,
      at('09:15'),
    );
    expect(view.now?.item.id).toBe('b');
    expect(ids(view.later)).toEqual(['a']);
  });

  it('keeps done and skipped entries in the timeline only', () => {
    const view = buildTodayView(
      [item('a'), item('b'), item('c')],
      [
        occ('a', '07:00', '08:00', { status: 'done' }),
        occ('b', '08:00', '08:30', { status: 'skipped' }),
        occ('c', '12:00', '13:00'),
      ],
      DATE,
      at('09:00'),
    );
    expect(ids(view.timeline)).toEqual(['a', 'b', 'c']);
    expect(view.next?.item.id).toBe('c');
    expect(view.later).toEqual([]);
  });

  it('ignores other dates and occurrences of missing or deleted items', () => {
    const view = buildTodayView(
      [item('a'), { ...item('b'), deletedAt: at('01:00') }],
      [
        occ('a', '10:00', '11:00', { localDate: '2026-11-17' }),
        occ('b', '10:00', '11:00'),
        occ('ghost', '10:00', '11:00'),
      ],
      DATE,
      at('09:00'),
    );
    expect(view.timeline).toEqual([]);
  });

  it('computes leaveBy from travel and prep', () => {
    const a = { ...item('a'), travelMinutes: 20, prepMinutes: 10 };
    const view = buildTodayView([a], [occ('a', '10:00', '11:00')], DATE, at('08:00'));
    expect(view.next?.leaveBy).toBe(at('09:30'));
  });

  it('breaks ties by item id in the timeline', () => {
    const view = buildTodayView(
      [item('b'), item('a')],
      [occ('b', '10:00', '11:00'), occ('a', '10:00', '11:00')],
      DATE,
      at('08:00'),
    );
    expect(ids(view.timeline)).toEqual(['a', 'b']);
  });
});
