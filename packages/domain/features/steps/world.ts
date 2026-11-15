import { QuickPickleWorld, setWorldConstructor } from 'quickpickle';
import type { IanaZone, Instant, Item, Occurrence } from '../../src/index';

export class DomainWorld extends QuickPickleWorld {
  items: Item[] = [];
  occurrences: Occurrence[] = [];
  zone: IanaZone = 'Europe/Madrid';
  now: Instant = '2026-11-17T08:00:00Z';
}

setWorldConstructor(DomainWorld);
