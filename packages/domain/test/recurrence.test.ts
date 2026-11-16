import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { InvalidRecurrenceError, occursOn, parseRRule, toRRule } from '../src/index';
import type { LocalDate, LocalTime, Schedule, Weekday } from '../src/index';

const ORDER: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

describe('parseRRule', () => {
  it('parses a weekly BYDAY list', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE')).toEqual(['MO', 'WE']);
  });

  it('rejects non-weekly rules', () => {
    expect(() => parseRRule('FREQ=DAILY')).toThrow(InvalidRecurrenceError);
  });

  it('rejects an empty BYDAY', () => {
    expect(() => parseRRule('FREQ=WEEKLY;BYDAY=')).toThrow(InvalidRecurrenceError);
  });

  it('deduplicates repeated days', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,MO')).toEqual(['MO']);
  });

  it('returns days in canonical MO..SU order', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=TU,MO')).toEqual(['MO', 'TU']);
  });

  it.each([
    ['lowercase', 'freq=weekly;byday=mo'],
    ['an extra part', 'FREQ=WEEKLY;BYDAY=MO;COUNT=3'],
    ['surrounding whitespace', ' FREQ=WEEKLY;BYDAY=MO '],
    ['inner whitespace', 'FREQ=WEEKLY; BYDAY=MO'],
    ['whitespace inside the day list', 'FREQ=WEEKLY;BYDAY=MO, TU'],
  ])('rejects %s', (_label, rule) => {
    expect(() => parseRRule(rule)).toThrow(InvalidRecurrenceError);
  });
});

describe('toRRule', () => {
  it('orders MO..SU and deduplicates', () => {
    expect(toRRule(['WE', 'MO', 'WE'])).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
  });

  it('rejects an empty day list', () => {
    expect(() => toRRule([])).toThrow(InvalidRecurrenceError);
  });

  it('round-trips any non-empty subset', () => {
    fc.assert(
      fc.property(fc.subarray(ORDER, { minLength: 1 }), fc.boolean(), (days, reverse) => {
        const input = reverse ? [...days].reverse() : days;
        const expected = ORDER.filter((d) => days.includes(d));
        expect(parseRRule(toRRule(input))).toEqual(expected);
      }),
    );
  });
});

describe('occursOn', () => {
  const weekly: Schedule = {
    type: 'weekly',
    byDay: ['MO', 'WE'],
    startTime: '09:00' as LocalTime,
    zone: 'Europe/Madrid',
  };

  it('is true on a chosen weekday', () => {
    expect(occursOn(weekly, '2026-11-16' as LocalDate)).toBe(true);
  });

  it('is false on another weekday', () => {
    expect(occursOn(weekly, '2026-11-17' as LocalDate)).toBe(false);
  });

  it('once schedule occurs only on its date', () => {
    const once: Schedule = {
      type: 'once',
      date: '2026-11-16' as LocalDate,
      startTime: '09:00' as LocalTime,
      zone: 'Europe/Madrid',
    };
    expect(occursOn(once, '2026-11-16' as LocalDate)).toBe(true);
    expect(occursOn(once, '2026-11-17' as LocalDate)).toBe(false);
  });
});
