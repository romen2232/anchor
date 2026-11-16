import { occurrenceKey } from './materialize';
import type { Instant, Occurrence, OccurrenceDraft } from './types';

export interface RegenerationPlan {
  create: OccurrenceDraft[];
  /** Ids of existing occurrences to delete. */
  remove: string[];
  /** Ids of existing occurrences that stay as they are. */
  keep: string[];
}

const ms = (instant: Instant): number => Date.parse(instant);

/** What the user (or time) already touched is never rewritten by a routine edit. */
function isProtected(occ: Occurrence, now: Instant): boolean {
  return occ.userModified || occ.status !== 'pending' || ms(occ.scheduledStart) <= ms(now);
}

/**
 * Diff between persisted occurrences and freshly materialized drafts after an item edit.
 * Protected occurrences are kept (and their drafts skipped); other existing ones are kept only
 * when a draft reproduces them exactly, otherwise they are removed and their drafts created.
 */
export function planRegeneration(
  existing: Occurrence[],
  drafts: OccurrenceDraft[],
  now: Instant,
): RegenerationPlan {
  const draftsByKey = new Map(drafts.map((d) => [occurrenceKey(d), d]));
  const keptKeys = new Set<string>();
  const keep: string[] = [];
  const remove: string[] = [];

  for (const occ of existing) {
    const key = occurrenceKey(occ);
    const draft = draftsByKey.get(key);
    const unchanged =
      draft !== undefined &&
      draft.scheduledStart === occ.scheduledStart &&
      draft.scheduledEnd === occ.scheduledEnd;
    if (isProtected(occ, now) || unchanged) {
      keep.push(occ.id);
      keptKeys.add(key);
    } else {
      remove.push(occ.id);
    }
  }

  return { create: drafts.filter((d) => !keptKeys.has(occurrenceKey(d))), remove, keep };
}
