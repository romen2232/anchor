import { Given, Then, When } from 'quickpickle';
import { expect } from 'vitest';
import { toInstant } from '../../src/index';
import type { IanaZone, LocalDate, LocalTime } from '../../src/index';
import type { DomainWorld } from './world';

const MONTHS: Record<string, string> = {
  Mar: '03',
  Nov: '11',
};

interface TimeWorld extends DomainWorld {
  routines: Map<string, LocalTime>;
  day?: LocalDate;
}

Given(
  'I live in {word} and have {string} at {word}',
  async (world: TimeWorld, zone: string, name: string, time: string) => {
    world.zone = zone as IanaZone;
    world.routines = new Map([[name, time as LocalTime]]);
  },
);

When(
  'it is {int} {word} {int}',
  async (world: TimeWorld, day: number, month: string, year: number) => {
    const mm = MONTHS[month];
    if (!mm) throw new Error(`Unknown month ${month}`);
    world.day = `${year}-${mm}-${String(day).padStart(2, '0')}` as LocalDate;
  },
);

Then(
  '{string} starts at {word} UTC',
  async (world: TimeWorld, name: string, utc: string) => {
    const instant = toInstant(world.day!, world.routines.get(name)!, world.zone);
    expect(instant.slice(11, 16)).toBe(utc);
  },
);

Then(
  '{string} happens at {word} local time',
  async (world: TimeWorld, name: string, local: string) => {
    const instant = toInstant(world.day!, world.routines.get(name)!, world.zone);
    const wall = new Intl.DateTimeFormat('en-GB', {
      timeZone: world.zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(instant));
    expect(wall).toBe(local);
  },
);
