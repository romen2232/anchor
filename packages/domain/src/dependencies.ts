import type { Item, Occurrence } from './types';

type Node = Pick<Item, 'id' | 'dependsOn'>;

/**
 * Finds a dependency cycle, if any. Deterministic DFS in input order.
 * Returns only the cycle itself, e.g. ['a', 'b', 'a'], or null when there is none.
 * Dependencies on ids that are not in the list are ignored.
 */
export function findCycle(items: Node[]): string[] | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  const finished = new Set<string>();
  const path: string[] = [];

  function visit(id: string): string[] | null {
    const onPath = path.indexOf(id);
    if (onPath !== -1) return [...path.slice(onPath), id];
    if (finished.has(id)) return null;
    path.push(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue;
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    path.pop();
    finished.add(id);
    return null;
  }

  for (const item of items) {
    const cycle = visit(item.id);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * An occurrence waits while any same-day occurrence of a dependency is still
 * open. Dependencies with no occurrence that day are ignored, and done or
 * skipped occurrences release the wait.
 */
export function isBlocked(
  occ: Occurrence,
  item: Item,
  sameDay: Occurrence[],
): { blocked: boolean; waitingOn: string[] } {
  const openItemIds = new Set(
    sameDay
      .filter((o) => o.localDate === occ.localDate)
      .filter((o) => o.status !== 'done' && o.status !== 'skipped')
      .map((o) => o.itemId),
  );
  const waitingOn = [...new Set(item.dependsOn)].filter((id) => openItemIds.has(id));
  return { blocked: waitingOn.length > 0, waitingOn };
}
