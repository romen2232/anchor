export type Instant = string; // ISO-8601 UTC, e.g. "2026-11-17T08:00:00Z"
export type LocalDate = string; // "YYYY-MM-DD"
export type LocalTime = string; // "HH:MM"
export type IanaZone = string; // "Europe/Madrid"
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type ItemKind = 'routine' | 'oneoff' | 'protected' | 'slack';
export type ReminderPolicy = 'off' | 'gentle' | 'full';

export type Schedule =
  | { type: 'weekly'; byDay: Weekday[]; startTime: LocalTime; zone: IanaZone }
  | { type: 'once'; date: LocalDate; startTime: LocalTime; zone: IanaZone };

export interface Item {
  id: string;
  userId: string;
  kind: ItemKind;
  title: string;
  schedule: Schedule;
  durationMinutes: number;
  prepMinutes: number;
  travelMinutes: number;
  bufferAfterMinutes: number;
  essential: boolean;
  dependsOn: string[];
  reminderPolicy: ReminderPolicy | null;
  deletedAt: Instant | null;
}

export type OccurrenceStatus = 'pending' | 'active' | 'done' | 'skipped';

export interface Occurrence {
  id: string;
  itemId: string;
  localDate: LocalDate;
  sequence: number;
  scheduledStart: Instant;
  scheduledEnd: Instant;
  status: OccurrenceStatus;
  snoozedUntil: Instant | null;
  splitFromOccurrenceId: string | null;
  userModified: boolean;
  actualStart: Instant | null;
  actualEnd: Instant | null;
  /**
   * Set when the user moved this occurrence to another day. It still claims the slot it came
   * from, so regenerating the routine does not bring that day's occurrence back.
   */
  movedFrom?: { localDate: LocalDate; sequence: number } | null;
}

export type OccurrenceDraft = Omit<Occurrence, 'id'>; // id assigned by persistence

export const DEFAULTS = {
  bufferMinutes: 10,
  gentleLeadMinutes: 10,
  leaveWarningMinutes: 15,
  wrapUpWarningMinutes: 5,
  repeatAfterMinutes: 5,
  materializeDays: 7,
} as const;
