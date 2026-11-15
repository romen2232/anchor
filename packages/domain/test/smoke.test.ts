import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../src/index';

describe('DEFAULTS', () => {
  it('exposes the documented defaults', () => {
    expect(DEFAULTS.bufferMinutes).toBe(10);
    expect(DEFAULTS.materializeDays).toBe(7);
  });
});
