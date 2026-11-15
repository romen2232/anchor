import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMinutes,
  diffMinutes,
  toInstant,
  toLocalDate,
  weekdayOf,
} from '../src/index';
import type { IanaZone, LocalDate, LocalTime } from '../src/index';

describe('toInstant', () => {
  it('converts local time to UTC', () => {
    expect(toInstant('2026-11-17', '09:00', 'Europe/Madrid')).toBe('2026-11-17T08:00:00Z');
  });
  it('shifts forward through a DST gap', () => {
    expect(toInstant('2026-03-29', '02:30', 'Europe/Madrid')).toBe('2026-03-29T01:30:00Z');
  });
  it('picks the earlier instant in a DST overlap', () => {
    expect(toInstant('2026-10-25', '02:30', 'Europe/Madrid')).toBe('2026-10-25T00:30:00Z');
  });
});

describe('toLocalDate', () => {
  it('uses the zone calendar day', () => {
    expect(toLocalDate('2026-11-17T23:30:00Z', 'Europe/Madrid')).toBe('2026-11-18');
  });
});

describe('weekdayOf', () => {
  it('returns the weekday code', () => {
    expect(weekdayOf('2026-11-17')).toBe('TU');
    expect(weekdayOf('2026-11-15')).toBe('SU');
    expect(weekdayOf('2026-11-16')).toBe('MO');
  });
});

describe('arithmetic', () => {
  it('adds minutes', () => {
    expect(addMinutes('2026-11-17T08:00:00Z', 90)).toBe('2026-11-17T09:30:00Z');
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('diffs minutes as b - a', () => {
    expect(diffMinutes('2026-11-17T08:00:00Z', '2026-11-17T09:30:00Z')).toBe(90);
    expect(diffMinutes('2026-11-17T09:30:00Z', '2026-11-17T08:00:00Z')).toBe(-90);
  });
});

describe('round trip property', () => {
  it('toLocalDate(toInstant(d,t,z), z) === d', () => {
    const zones: IanaZone[] = ['Europe/Madrid', 'America/New_York', 'Asia/Kolkata', 'UTC'];
    const dateArb = fc
      .integer({ min: 0, max: 364 })
      .map((n) => addDays('2026-01-01', n) as LocalDate);
    const timeArb = fc
      .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
      .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` as LocalTime);
    fc.assert(
      fc.property(dateArb, timeArb, fc.constantFrom(...zones), (d, t, z) => {
        expect(toLocalDate(toInstant(d, t, z), z)).toBe(d);
      }),
    );
  });
});
