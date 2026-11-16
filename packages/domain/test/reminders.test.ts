import { describe, expect, it } from 'vitest';
import { planReminders } from '../src/index';
import type { Item, Occurrence, QuietHours } from '../src/index';

const DATE = '2026-11-16';
const at = (t: string) => `${DATE}T${t}:00Z`;
const EARLY = at('00:00');

function item(o: Partial<Item> = {}): Item {
  return {
    id: 'a',
    userId: 'user-1',
    kind: 'oneoff',
    title: 'a',
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

function occ(start = '09:00', end = '09:30', o: Partial<Occurrence> = {}): Occurrence {
  return {
    id: 'occ-a',
    itemId: 'a',
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

const quiet: QuietHours = { start: '22:00', end: '07:00', zone: 'UTC' };

const base = {
  userPolicy: 'full' as const,
  quiet: null,
  blocked: false,
  releasedAt: null,
  now: EARLY,
};

describe('planReminders', () => {
  it('full policy yields gentle, insistent and one repeat at exact times', () => {
    expect(planReminders({ ...base, occ: occ(), item: item() })).toEqual([
      { key: 'occ-a:gentle', occurrenceId: 'occ-a', level: 'gentle', at: at('08:50') },
      { key: 'occ-a:insistent', occurrenceId: 'occ-a', level: 'insistent', at: at('09:00') },
      { key: 'occ-a:repeat', occurrenceId: 'occ-a', level: 'repeat', at: at('09:05') },
    ]);
  });

  it('gentle lead counts from leave-by when there is travel or prep', () => {
    const jobs = planReminders({
      ...base,
      occ: occ(),
      item: item({ travelMinutes: 20, prepMinutes: 10 }),
    });
    expect(jobs[0]).toMatchObject({ level: 'gentle', at: at('08:20') });
    expect(jobs[1]).toMatchObject({ level: 'insistent', at: at('09:00') });
  });

  it('item override off beats user full', () => {
    expect(planReminders({ ...base, occ: occ(), item: item({ reminderPolicy: 'off' }) })).toEqual(
      [],
    );
  });

  it('falls back to the user policy when the item has none', () => {
    expect(planReminders({ ...base, userPolicy: 'off', occ: occ(), item: item() })).toEqual([]);
  });

  it('gentle policy yields only the gentle job', () => {
    const jobs = planReminders({ ...base, occ: occ(), item: item({ reminderPolicy: 'gentle' }) });
    expect(jobs.map((j) => j.level)).toEqual(['gentle']);
  });

  it('blocked yields nothing', () => {
    expect(planReminders({ ...base, blocked: true, occ: occ(), item: item() })).toEqual([]);
  });

  it('released after the start yields a single ready job at release time', () => {
    const jobs = planReminders({
      ...base,
      releasedAt: at('09:40'),
      now: at('09:40'),
      occ: occ(),
      item: item(),
    });
    expect(jobs).toEqual([
      { key: 'occ-a:ready', occurrenceId: 'occ-a', level: 'ready', at: at('09:40') },
    ]);
  });

  it('released before the start keeps the normal chain', () => {
    const jobs = planReminders({ ...base, releasedAt: at('08:00'), occ: occ(), item: item() });
    expect(jobs.map((j) => j.level)).toEqual(['gentle', 'insistent', 'repeat']);
  });

  it('quiet hours wrapping midnight drop a non-essential 06:30 item entirely', () => {
    const o = occ('06:30', '07:00');
    expect(planReminders({ ...base, quiet, occ: o, item: item() })).toEqual([]);
  });

  it('quiet hours drop only gentle for an essential item', () => {
    const o = occ('06:30', '07:00');
    const jobs = planReminders({ ...base, quiet, occ: o, item: item({ essential: true }) });
    expect(jobs.map((j) => j.level)).toEqual(['insistent', 'repeat']);
  });

  it('quiet hours do not affect items outside the window', () => {
    const jobs = planReminders({ ...base, quiet, occ: occ(), item: item() });
    expect(jobs).toHaveLength(3);
  });

  it('drops jobs already in the past', () => {
    const jobs = planReminders({ ...base, now: at('08:55'), occ: occ(), item: item() });
    expect(jobs.map((j) => j.level)).toEqual(['insistent', 'repeat']);
  });

  it('plans from the snoozed time when snoozed', () => {
    const jobs = planReminders({
      ...base,
      occ: occ('09:00', '09:30', { snoozedUntil: at('09:30') }),
      item: item(),
    });
    expect(jobs.map((j) => j.at)).toEqual([at('09:20'), at('09:30'), at('09:35')]);
  });
});
