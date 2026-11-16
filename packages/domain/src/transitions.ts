import { addMinutes, diffMinutes } from './time';
import { DEFAULTS } from './types';
import type { Instant, Item, Occurrence } from './types';

export type Warning = {
  kind: 'leave' | 'wrapUp';
  at: Instant;
  occurrenceId: string;
  message: string;
};

/** The moment to start heading out: start minus travel and prep. */
export function leaveBy(occ: Occurrence, item: Item): Instant {
  return addMinutes(occ.scheduledStart, -(item.travelMinutes + item.prepMinutes));
}

/** Gentle heads-ups for one occurrence, in chronological order. */
export function transitionWarnings(occ: Occurrence, item: Item): Warning[] {
  const warnings: Warning[] = [];
  if (item.travelMinutes + item.prepMinutes > 0) {
    warnings.push({
      kind: 'leave',
      at: addMinutes(leaveBy(occ, item), -DEFAULTS.leaveWarningMinutes),
      occurrenceId: occ.id,
      message: `Leave in ${DEFAULTS.leaveWarningMinutes} min`,
    });
  }
  if (diffMinutes(occ.scheduledStart, occ.scheduledEnd) > DEFAULTS.wrapUpWarningMinutes) {
    warnings.push({
      kind: 'wrapUp',
      at: addMinutes(occ.scheduledEnd, -DEFAULTS.wrapUpWarningMinutes),
      occurrenceId: occ.id,
      message: `Wrap up in ${DEFAULTS.wrapUpWarningMinutes}`,
    });
  }
  return warnings;
}
