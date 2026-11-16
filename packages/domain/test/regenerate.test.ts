import { describe, expect, it } from 'vitest';
import { materialize, occurrenceKey, planRegeneration, toInstant } from '../src/index';
import type { Item, Occurrence, OccurrenceDraft } from '../src/index';

const MONDAY = '2026-11-16';
const DAYS = 5;

function routine(startTime: string, zone = 'Europe/Madrid', o: Partial<Item> = {}): Item {
  return {
    id: 'gym',
    userId: 'user-1',
    kind: 'routine',
    title: 'Gym',
    schedule: { type: 'weekly', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'], startTime, zone },
    durationMinutes: 60,
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

const persisted = (drafts: OccurrenceDraft[]): Occurrence[] =>
  drafts.map((d) => ({ ...d, id: `occ-${d.localDate}` }));

const drafts = (item: Item) => materialize([item], MONDAY, DAYS);
const BEFORE_ALL = toInstant(MONDAY, '06:00', 'Europe/Madrid');
const ids = (list: Occurrence[]) => list.map((o) => o.id);

describe('planRegeneration', () => {
  it('replaces untouched future occurrences when the routine time changes', () => {
    const existing = persisted(drafts(routine('09:00')));
    const next = drafts(routine('10:00'));
    const plan = planRegeneration(existing, next, BEFORE_ALL);
    expect(plan.remove.sort()).toEqual(ids(existing).sort());
    expect(plan.create).toEqual(next);
    expect(plan.keep).toEqual([]);
  });

  it('keeps a user-modified occurrence and does not recreate its day', () => {
    const existing = persisted(drafts(routine('09:00'))).map((o) =>
      o.localDate === '2026-11-18'
        ? { ...o, userModified: true, snoozedUntil: '2026-11-18T09:30:00Z' }
        : o,
    );
    const plan = planRegeneration(existing, drafts(routine('10:00')), BEFORE_ALL);
    expect(plan.keep).toEqual(['occ-2026-11-18']);
    expect(plan.remove).not.toContain('occ-2026-11-18');
    expect(plan.create.map((d) => d.localDate)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-19',
      '2026-11-20',
    ]);
  });

  it('keeps past and non-pending occurrences', () => {
    const now = toInstant('2026-11-17', '12:00', 'Europe/Madrid');
    const existing = persisted(drafts(routine('09:00'))).map((o) =>
      o.localDate === '2026-11-18' ? { ...o, status: 'done' as const } : o,
    );
    const plan = planRegeneration(existing, drafts(routine('10:00')), now);
    expect(plan.keep.sort()).toEqual(['occ-2026-11-16', 'occ-2026-11-17', 'occ-2026-11-18']);
    expect(plan.remove.sort()).toEqual(['occ-2026-11-19', 'occ-2026-11-20']);
    expect(plan.create.map((d) => d.localDate)).toEqual(['2026-11-19', '2026-11-20']);
  });

  it('treats an occurrence starting exactly now as past', () => {
    const existing = persisted(drafts(routine('09:00')));
    const now = toInstant('2026-11-16', '09:00', 'Europe/Madrid');
    expect(planRegeneration(existing, drafts(routine('10:00')), now).keep).toContain(
      'occ-2026-11-16',
    );
  });

  it('is a no-op when regenerating identical drafts', () => {
    const existing = persisted(drafts(routine('09:00')));
    const plan = planRegeneration(existing, drafts(routine('09:00')), BEFORE_ALL);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.keep.sort()).toEqual(ids(existing).sort());
  });

  it('regenerates untouched future occurrences in the new zone after a zone change', () => {
    const existing = persisted(drafts(routine('09:00', 'Europe/Madrid')));
    const next = drafts(routine('09:00', 'America/New_York'));
    const plan = planRegeneration(existing, next, BEFORE_ALL);
    expect(plan.remove).toHaveLength(DAYS);
    expect(plan.create).toHaveLength(DAYS);
    expect(plan.create[0]!.scheduledStart).toBe('2026-11-16T14:00:00Z');
  });

  it('removes only untouched future occurrences when the item is deleted', () => {
    const now = toInstant('2026-11-17', '12:00', 'Europe/Madrid');
    const existing = persisted(drafts(routine('09:00'))).map((o) =>
      o.localDate === '2026-11-19' ? { ...o, userModified: true } : o,
    );
    const deleted = routine('09:00', 'Europe/Madrid', { deletedAt: '2026-11-17T10:00:00Z' });
    const plan = planRegeneration(existing, drafts(deleted), now);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual(['occ-2026-11-18', 'occ-2026-11-20']);
    expect(plan.keep.sort()).toEqual(['occ-2026-11-16', 'occ-2026-11-17', 'occ-2026-11-19']);
  });

  it('matches by occurrence key', () => {
    const existing = persisted(drafts(routine('09:00')));
    expect(occurrenceKey(existing[0]!)).toBe(occurrenceKey(drafts(routine('09:00'))[0]!));
  });
});
