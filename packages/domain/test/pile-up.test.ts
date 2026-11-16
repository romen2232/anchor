import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addMinutes, collapsePileUp, diffMinutes } from '../src/index';
import type { Occurrence, OccurrenceStatus } from '../src/index';

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id: 'occ-1',
    itemId: 'water',
    localDate: '2026-11-16',
    sequence: 0,
    scheduledStart: '2026-11-16T08:00:00Z',
    scheduledEnd: '2026-11-16T08:30:00Z',
    status: 'pending',
    snoozedUntil: null,
    splitFromOccurrenceId: null,
    userModified: false,
    actualStart: null,
    actualEnd: null,
    ...overrides,
  };
}

const MON = { id: 'mon', localDate: '2026-11-16', scheduledStart: '2026-11-16T08:00:00Z' };
const TUE = { id: 'tue', localDate: '2026-11-17', scheduledStart: '2026-11-17T08:00:00Z' };
const WED = { id: 'wed', localDate: '2026-11-18', scheduledStart: '2026-11-18T08:00:00Z' };
const WED_NOON = '2026-11-18T11:00:00Z';

describe('collapsePileUp', () => {
  it('keeps the latest started occurrence and returns the older ids', () => {
    const occs = [occurrence(MON), occurrence(TUE), occurrence(WED)];
    expect(collapsePileUp(occs, WED_NOON)).toEqual(['mon', 'tue']);
  });

  it('never returns done or skipped occurrences', () => {
    const occs = [
      occurrence({ ...MON, status: 'done' }),
      occurrence({ ...TUE, status: 'skipped' }),
      occurrence(WED),
    ];
    expect(collapsePileUp(occs, WED_NOON)).toEqual([]);
  });

  it('ignores finished occurrences when choosing the latest', () => {
    const occs = [occurrence(MON), occurrence(TUE), occurrence({ ...WED, status: 'done' })];
    expect(collapsePileUp(occs, WED_NOON)).toEqual(['mon']);
  });

  it('never returns future occurrences, nor lets them count as latest', () => {
    const occs = [occurrence(MON), occurrence(TUE), occurrence(WED)];
    expect(collapsePileUp(occs, '2026-11-17T12:00:00Z')).toEqual(['mon']);
  });

  it('treats an occurrence starting exactly now as started', () => {
    const occs = [occurrence(MON), occurrence(TUE)];
    expect(collapsePileUp(occs, TUE.scheduledStart)).toEqual(['mon']);
  });

  it('collapses active occurrences too', () => {
    const occs = [occurrence({ ...MON, status: 'active' }), occurrence(TUE)];
    expect(collapsePileUp(occs, WED_NOON)).toEqual(['mon']);
  });

  it('does not let different items interfere', () => {
    const occs = [
      occurrence(MON),
      occurrence({ ...TUE, itemId: 'water' }),
      occurrence({ ...MON, id: 'dishes-mon', itemId: 'dishes' }),
    ];
    expect(collapsePileUp(occs, WED_NOON)).toEqual(['mon']);
  });

  it('never collapses a single occurrence', () => {
    expect(collapsePileUp([occurrence(MON)], WED_NOON)).toEqual([]);
  });

  it('breaks start ties by local date, then sequence', () => {
    const sameStart = '2026-11-16T08:00:00Z';
    const occs = [
      occurrence({ id: 'a', localDate: '2026-11-16', sequence: 0, scheduledStart: sameStart }),
      occurrence({ id: 'b', localDate: '2026-11-16', sequence: 1, scheduledStart: sameStart }),
      occurrence({ id: 'c', localDate: '2026-11-17', sequence: 0, scheduledStart: sameStart }),
    ];
    expect(collapsePileUp(occs, WED_NOON)).toEqual(['a', 'b']);
  });

  it('compares instants chronologically, not as strings', () => {
    const occs = [
      occurrence({ id: 'later', scheduledStart: '2026-11-16T08:00:00Z' }),
      occurrence({ id: 'earlier', scheduledStart: '2026-11-16T09:30:00+02:00' }),
    ];
    expect(collapsePileUp(occs, WED_NOON)).toEqual(['earlier']);
  });

  it('returns ids in chronological order regardless of input order', () => {
    const occs = [occurrence(TUE), occurrence(WED), occurrence(MON)];
    expect(collapsePileUp(occs, WED_NOON)).toEqual(['mon', 'tue']);
  });

  it('ignores snoozing: only the scheduled start matters', () => {
    const occs = [occurrence({ ...MON, snoozedUntil: '2026-11-19T08:00:00Z' }), occurrence(TUE)];
    expect(collapsePileUp(occs, WED_NOON)).toEqual(['mon']);
  });

  it('does not mutate its input', () => {
    const occs = [occurrence(TUE), occurrence(MON)];
    collapsePileUp(occs, WED_NOON);
    expect(occs.map((o) => o.id)).toEqual(['tue', 'mon']);
  });

  it('property: result is only started unfinished ones, and each item keeps at most one', () => {
    const NOW = '2026-11-18T12:00:00Z';
    const statusArb = fc.constantFrom<OccurrenceStatus>('pending', 'active', 'done', 'skipped');
    const occArb = fc.record({
      itemId: fc.constantFrom('a', 'b', 'c'),
      offsetHours: fc.integer({ min: -100, max: 100 }),
      sequence: fc.integer({ min: 0, max: 2 }),
      status: statusArb,
    });
    fc.assert(
      fc.property(fc.array(occArb, { maxLength: 25 }), (specs) => {
        const occs = specs.map((s, i) => {
          const start = addMinutes(NOW, s.offsetHours * 60);
          return occurrence({
            id: `o${i}`,
            itemId: s.itemId,
            localDate: start.slice(0, 10),
            sequence: s.sequence,
            scheduledStart: start,
            scheduledEnd: addMinutes(start, 30),
            status: s.status,
          });
        });
        const returned = new Set(collapsePileUp(occs, NOW));
        const isStartedUnfinished = (o: Occurrence) =>
          (o.status === 'pending' || o.status === 'active') &&
          diffMinutes(o.scheduledStart, NOW) >= 0;

        for (const o of occs) {
          if (returned.has(o.id)) expect(isStartedUnfinished(o)).toBe(true);
        }
        const remaining = new Map<string, number>();
        for (const o of occs) {
          if (returned.has(o.id) || !isStartedUnfinished(o)) continue;
          remaining.set(o.itemId, (remaining.get(o.itemId) ?? 0) + 1);
        }
        for (const count of remaining.values()) expect(count).toBeLessThanOrEqual(1);
      }),
    );
  });
});
