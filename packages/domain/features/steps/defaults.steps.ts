import { Given, Then } from 'quickpickle';
import { expect } from 'vitest';
import { DEFAULTS } from '../../src/index';
import type { DomainWorld } from './world';

Given('I am a new user', async (world: DomainWorld) => {
  world.items = [];
  world.occurrences = [];
});

Then(
  'each task is followed by a {int} minute buffer',
  async (_world: DomainWorld, minutes: number) => {
    expect(DEFAULTS.bufferMinutes).toBe(minutes);
  },
);
