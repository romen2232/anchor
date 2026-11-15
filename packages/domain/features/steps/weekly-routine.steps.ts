import { Given, Then } from 'quickpickle';
import { expect } from 'vitest';
import { occursOn, toRRule, parseRRule } from '../../src/index';
import type { LocalDate, Schedule, Weekday } from '../../src/index';
import type { DomainWorld } from './world';

const WEEKDAYS: Record<string, Weekday> = {
  Monday: 'MO',
  Tuesday: 'TU',
  Wednesday: 'WE',
  Thursday: 'TH',
  Friday: 'FR',
  Saturday: 'SA',
  Sunday: 'SU',
};

const MONTHS: Record<string, string> = { Nov: '11' };

interface WeeklyWorld extends DomainWorld {
  schedules: Map<string, Schedule>;
}

Given(
  '{string} repeats every {word} and {word}',
  async (world: WeeklyWorld, name: string, first: string, second: string) => {
    const byDay = [first, second].map((d) => {
      const code = WEEKDAYS[d];
      if (!code) throw new Error(`Unknown weekday ${d}`);
      return code;
    });
    world.schedules = new Map([
      [
        name,
        {
          type: 'weekly',
          byDay: parseRRule(toRRule(byDay)),
          startTime: '09:00',
          zone: world.zone,
        } as Schedule,
      ],
    ]);
  },
);

function dateOf(day: number, month: string): LocalDate {
  const mm = MONTHS[month];
  if (!mm) throw new Error(`Unknown month ${month}`);
  return `2026-${mm}-${String(day).padStart(2, '0')}` as LocalDate;
}

Then(
  '{string} is planned on {word} {int} {word}',
  async (world: WeeklyWorld, name: string, _weekday: string, day: number, month: string) => {
    expect(occursOn(world.schedules.get(name)!, dateOf(day, month))).toBe(true);
  },
);

Then(
  '{string} is not planned on {word} {int} {word}',
  async (world: WeeklyWorld, name: string, _weekday: string, day: number, month: string) => {
    expect(occursOn(world.schedules.get(name)!, dateOf(day, month))).toBe(false);
  },
);
