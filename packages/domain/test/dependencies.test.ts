import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findCycle, isBlocked } from '../src/index';
import type { Item, Occurrence, OccurrenceStatus } from '../src/index';

const edges = (pairs: Record<string, string[]>) =>
  Object.entries(pairs).map(([id, dependsOn]) => ({ id, dependsOn }));

function occurrence(itemId: string, overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id: `occ-${itemId}`,
    itemId,
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

function item(id: string, dependsOn: string[]): Item {
  return {
    id,
    userId: 'user-1',
    kind: 'oneoff',
    title: id,
    schedule: { type: 'once', date: '2026-11-16', startTime: '08:00', zone: 'Europe/Madrid' },
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

describe('findCycle', () => {
  it('returns the cycle for a -> b -> a', () => {
    expect(findCycle(edges({ a: ['b'], b: ['a'] }))).toEqual(['a', 'b', 'a']);
  });

  it('returns null for a chain a -> b -> c', () => {
    expect(findCycle(edges({ a: ['b'], b: ['c'], c: [] }))).toBeNull();
  });

  it('treats a self-dependency as a cycle', () => {
    expect(findCycle(edges({ a: ['a'] }))).toEqual(['a', 'a']);
  });

  it('returns only the cycle, not the path leading into it', () => {
    expect(findCycle(edges({ a: ['b'], b: ['c'], c: ['b'] }))).toEqual(['b', 'c', 'b']);
  });

  it('ignores dependencies on unknown items', () => {
    expect(findCycle(edges({ a: ['ghost'] }))).toBeNull();
  });

  it('is not fooled by a diamond (shared dependency, no cycle)', () => {
    expect(findCycle(edges({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] }))).toBeNull();
  });

  it('finds no cycle in random acyclic graphs and one after adding a back-edge', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }).chain((n) =>
          fc.record({
            n: fc.constant(n),
            forward: fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 20 }),
          }),
        ),
        ({ n, forward }) => {
          const deps = new Map<number, Set<number>>();
          for (let i = 0; i < n; i++) deps.set(i, new Set());
          // Edges only from higher to lower index: acyclic by construction.
          for (const [x, y] of forward) {
            if (x !== y) deps.get(Math.max(x, y))?.add(Math.min(x, y));
          }
          const build = () =>
            [...deps.entries()].map(([i, set]) => ({
              id: `n${i}`,
              dependsOn: [...set].map((d) => `n${d}`),
            }));
          expect(findCycle(build())).toBeNull();

          // Back-edge: the highest node waits for the lowest and vice versa, closing a loop.
          deps.get(n - 1)?.add(0);
          deps.get(0)?.add(n - 1);
          const graph = build();
          const cycle = findCycle(graph);
          expect(cycle).not.toBeNull();
          if (!cycle) return;
          expect(cycle[0]).toBe(cycle[cycle.length - 1]);
          for (let i = 0; i < cycle.length - 1; i++) {
            const from = graph.find((g) => g.id === cycle[i]);
            expect(from?.dependsOn).toContain(cycle[i + 1]);
          }
        },
      ),
    );
  });
});

describe('isBlocked', () => {
  const b = item('b', ['a']);
  const blockedBy = (status: OccurrenceStatus) =>
    isBlocked(occurrence('b'), b, [occurrence('a', { status }), occurrence('b')]);

  it('blocks while the dependency is pending', () => {
    expect(blockedBy('pending')).toEqual({ blocked: true, waitingOn: ['a'] });
  });

  it('blocks while the dependency is active', () => {
    expect(blockedBy('active').blocked).toBe(true);
  });

  it('is released when the dependency is done', () => {
    expect(blockedBy('done')).toEqual({ blocked: false, waitingOn: [] });
  });

  it('is released when the dependency is skipped', () => {
    expect(blockedBy('skipped')).toEqual({ blocked: false, waitingOn: [] });
  });

  it('ignores a dependency with no occurrence that day', () => {
    expect(isBlocked(occurrence('b'), b, [occurrence('b')])).toEqual({
      blocked: false,
      waitingOn: [],
    });
  });

  it('ignores occurrences of the dependency on other days', () => {
    const other = occurrence('a', { localDate: '2026-11-15' });
    expect(isBlocked(occurrence('b'), b, [other]).blocked).toBe(false);
  });

  it('blocks while any piece of a split dependency is still open', () => {
    const pieces = [
      occurrence('a', { id: 'a1', status: 'done' }),
      occurrence('a', { id: 'a2', sequence: 1, status: 'pending' }),
    ];
    expect(isBlocked(occurrence('b'), b, pieces).blocked).toBe(true);
  });

  it('lists each open dependency once, in dependsOn order', () => {
    const c = item('c', ['b', 'a', 'b']);
    const day = [occurrence('a'), occurrence('b'), occurrence('b', { id: 'b2', sequence: 1 })];
    expect(isBlocked(occurrence('c'), c, day).waitingOn).toEqual(['b', 'a']);
  });
});
