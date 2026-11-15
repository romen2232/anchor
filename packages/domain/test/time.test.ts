import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { addDays, addMinutes, diffMinutes, toInstant, toLocalDate, weekdayOf } from '../src/index';
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
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = (h: number, m: number) => `${pad(h)}:${pad(m)}` as LocalTime;

  it('toLocalDate(toInstant(d,t,z), z) === d', () => {
    const zones: IanaZone[] = ['Europe/Madrid', 'America/New_York', 'Asia/Kolkata', 'UTC'];
    const anyDate = fc
      .integer({ min: 0, max: 364 })
      .map((n) => Temporal.PlainDate.from('2026-01-01').add({ days: n }).toString() as LocalDate);
    const dstDate = fc.constantFrom<LocalDate>(
      '2026-03-29',
      '2026-10-25',
      '2026-03-08',
      '2026-11-01',
    );
    const anyTime = fc
      .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
      .map(([h, m]) => time(h, m));
    const dstTime = fc
      .tuple(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 0, max: 59 }))
      .map(([h, m]) => time(h, m));
    const dateTime = fc.oneof(fc.tuple(anyDate, anyTime), fc.tuple(dstDate, dstTime));
    fc.assert(
      fc.property(dateTime, fc.constantFrom(...zones), ([d, t], z) => {
        expect(toLocalDate(toInstant(d, t, z), z)).toBe(d);
      }),
    );
  });
});

describe('arithmetic across the Madrid 2026-03-29 transition', () => {
  it('addMinutes counts absolute minutes', () => {
    expect(addMinutes('2026-03-29T00:30:00Z', 60)).toBe('2026-03-29T01:30:00Z');
  });
  it('addDays steps calendar days', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});
