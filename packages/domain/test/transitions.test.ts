import { describe, expect, it } from 'vitest';
import { leaveBy, transitionWarnings } from '../src/index';
import type { Item, Occurrence } from '../src/index';

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    userId: 'user-1',
    kind: 'oneoff',
    title: 'Go to the administrations',
    schedule: { type: 'once', date: '2026-11-19', startTime: '11:00', zone: 'Europe/Madrid' },
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

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id: 'occ-1',
    itemId: 'item-1',
    localDate: '2026-11-19',
    sequence: 0,
    scheduledStart: '2026-11-19T10:00:00Z',
    scheduledEnd: '2026-11-19T11:00:00Z',
    status: 'pending',
    snoozedUntil: null,
    splitFromOccurrenceId: null,
    userModified: false,
    actualStart: null,
    actualEnd: null,
    ...overrides,
  };
}

describe('leaveBy', () => {
  it('subtracts travel and prep from the start', () => {
    expect(leaveBy(occurrence(), item({ travelMinutes: 20, prepMinutes: 10 }))).toBe(
      '2026-11-19T09:30:00Z',
    );
  });

  it('is the start itself when there is nothing to get ready for', () => {
    expect(leaveBy(occurrence(), item())).toBe('2026-11-19T10:00:00Z');
  });
});

describe('transitionWarnings', () => {
  it('warns 15 minutes before leave-by', () => {
    const warnings = transitionWarnings(occurrence(), item({ travelMinutes: 20, prepMinutes: 10 }));
    expect(warnings[0]).toEqual({
      kind: 'leave',
      at: '2026-11-19T09:15:00Z',
      occurrenceId: 'occ-1',
      message: 'Leave in 15 min',
    });
  });

  it('has no leave warning without travel or prep', () => {
    expect(transitionWarnings(occurrence(), item()).map((w) => w.kind)).toEqual(['wrapUp']);
  });

  it('warns 5 minutes before the end', () => {
    const warnings = transitionWarnings(occurrence(), item());
    expect(warnings).toEqual([
      {
        kind: 'wrapUp',
        at: '2026-11-19T10:55:00Z',
        occurrenceId: 'occ-1',
        message: 'Wrap up in 5',
      },
    ]);
  });

  it('omits wrap-up for a 5-minute occurrence', () => {
    const short = occurrence({ scheduledEnd: '2026-11-19T10:05:00Z' });
    expect(transitionWarnings(short, item({ durationMinutes: 5 }))).toEqual([]);
  });

  it('uses the occurrence span, not the item duration, for wrap-up', () => {
    const short = occurrence({ scheduledEnd: '2026-11-19T10:05:00Z' });
    expect(transitionWarnings(short, item({ durationMinutes: 60 }))).toEqual([]);
    const long = occurrence({ scheduledEnd: '2026-11-19T10:30:00Z' });
    expect(transitionWarnings(long, item({ durationMinutes: 5 })).map((w) => w.at)).toEqual([
      '2026-11-19T10:25:00Z',
    ]);
  });

  it('returns warnings in chronological order', () => {
    const warnings = transitionWarnings(occurrence(), item({ travelMinutes: 20 }));
    expect(warnings.map((w) => w.kind)).toEqual(['leave', 'wrapUp']);
  });

  it('wraps up a 6-minute occurrence 5 minutes before its end', () => {
    const six = occurrence({ scheduledEnd: '2026-11-19T10:06:00Z' });
    expect(transitionWarnings(six, item()).map((w) => w.at)).toEqual(['2026-11-19T10:01:00Z']);
  });

  it('never uses shaming words in any message', () => {
    const warnings = transitionWarnings(occurrence(), item({ travelMinutes: 20, prepMinutes: 10 }));
    expect(warnings.map((w) => w.kind)).toEqual(['leave', 'wrapUp']);
    for (const { message } of warnings) {
      expect(message).not.toMatch(/overdue|failed|missed|streak/i);
    }
  });
});
