import { Given, Then } from 'quickpickle';
import { expect } from 'vitest';
import { occursOn, weekdayOf } from '../../src/index';
import type { LocalDate, LocalTime, Schedule, Weekday } from '../../src/index';
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
  schedules?: Map<string, Schedule>;
}

Given(
  '{string} repeats every {word} and {word}',
  async (world: WeeklyWorld, name: string, first: string, second: string) => {
    const byDay = [first, second].map((d) => {
      const code = WEEKDAYS[d];
      if (!code) throw new Error(`Unknown weekday ${d}`);
      return code;
    });
    const schedule: Schedule = {
      type: 'weekly',
      byDay,
      startTime: '09:00' as LocalTime,
      zone: world.zone,
    };
    world.schedules ??= new Map();
    world.schedules.set(name, schedule);
  },
);

function dateOf(day: number, month: string): LocalDate {
  const mm = MONTHS[month];
  if (!mm) throw new Error(`Unknown month ${month}`);
  return `2026-${mm}-${String(day).padStart(2, '0')}` as LocalDate;
}

function scheduleOf(world: WeeklyWorld, name: string): Schedule {
  const schedule = world.schedules?.get(name);
  if (!schedule) throw new Error(`No routine named "${name}" was set up in this scenario`);
  return schedule;
}

function nameOf(code: Weekday): string {
  const entry = Object.entries(WEEKDAYS).find(([, c]) => c === code);
  if (!entry) throw new Error(`Unknown weekday code ${code}`);
  return entry[0];
}

function checkedDateOf(weekday: string, day: number, month: string): LocalDate {
  const expected = WEEKDAYS[weekday];
  if (!expected) throw new Error(`Unknown weekday ${weekday}`);
  const date = dateOf(day, month);
  const actual = weekdayOf(date);
  if (actual !== expected) {
    throw new Error(`Expected ${weekday}, but ${date} is a ${nameOf(actual)}`);
  }
  return date;
}

Then(
  '{string} is planned on {word} {int} {word}',
  async (world: WeeklyWorld, name: string, weekday: string, day: number, month: string) => {
    expect(occursOn(scheduleOf(world, name), checkedDateOf(weekday, day, month))).toBe(true);
  },
);

Then(
  '{string} is not planned on {word} {int} {word}',
  async (world: WeeklyWorld, name: string, weekday: string, day: number, month: string) => {
    expect(occursOn(scheduleOf(world, name), checkedDateOf(weekday, day, month))).toBe(false);
  },
);
