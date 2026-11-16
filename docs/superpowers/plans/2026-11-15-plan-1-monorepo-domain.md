# Plan 1 — Monorepo + Domain Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the pnpm monorepo and a pure, fully tested TypeScript `domain` package containing every scheduling rule of v1.

**Architecture:** `packages/domain` is pure functions over plain serializable types (ISO strings in, ISO strings out). No I/O, no framework, no `Date.now()` — every function that needs the current time takes `now: Instant`. Time-zone math uses the Temporal API via polyfill. Later plans (API, web, mobile) consume only the exports listed in each task's **Produces** block.

**Tech Stack:** Node 22 LTS, pnpm 9 workspaces, TypeScript 5 (strict), Vitest, `quickpickle` ^1.11 (Gherkin `.feature` files run by Vitest), fast-check (property tests), `temporal-polyfill`, ESLint + Prettier, GitHub Actions.

**Testing approach (author decided): BDD outer loop + TDD inner loop, both visible in the repo.**

- **BDD:** each spec rule gets 1–3 Gherkin scenarios in `packages/domain/features/*.feature`, written in user language (no code terms), as living documentation.
- **TDD:** edge cases live in fast Vitest unit/property tests in `packages/domain/test/*.test.ts`.
- Git history shows red → green per task (see Task Loop).

**Spec:** `docs/superpowers/specs/2026-11-15-anchor-design.md`

**Follow-up plans (not in this document):** Plan 2 API + worker (`apps/api`, `packages/contracts`), Plan 3 web (`apps/web`, `packages/design-tokens`), Plan 4 Android (`apps/mobile`).

## Global Constraints

- Strict TDD: every behaviour gets a failing test first.
- `packages/domain` imports nothing except `temporal-polyfill`. No `Date.now()`, no `new Date()` without an argument, no I/O.
- All instants are ISO-8601 UTC strings (`Instant`); local dates are `YYYY-MM-DD`; local times are `HH:MM` (24 h).
- DST: non-existent local time → shift forward to the first valid instant; ambiguous local time → earlier instant (Temporal `disambiguation: 'compatible'`).
- Default buffer 10 min; transition warnings at 15 min ("leave in 15 min") and 5 min ("wrap up in 5"); gentle reminder lead time 10 min.
- Escalation capped at: gentle → insistent → one repeat after 5 min.
- User-facing strings produced by the domain never contain "overdue", "failed", "missed" or "streak".
- Commits: Conventional Commits, **no Co-Authored-By or AI attribution lines** (author's rule).
- Scenarios use the user's vocabulary ("task", "routine", "later today"), never function names. Gentle language rule applies to scenario text too.

## Task Loop (applies to every task from Task 2 on)

Each task's numbered steps are executed inside this loop. "Commit" in a task means the two commits below.

1. **Red (outer):** write the task's **Scenarios** in its `.feature` file and their step definitions in `features/steps/<name>.steps.ts`, calling the task's **Produces** functions. Run `pnpm --filter @anchor/domain test` → scenarios FAIL.
2. **Red (inner):** write the task's unit/property tests (Step 1 of the task). Run → FAIL.
3. **Commit:** `test(domain): specify <rule>` — failing scenarios and tests only. Use `git commit --no-verify` if a hook blocks red commits; never push this commit alone.
4. **Green:** implement until unit tests **and** scenarios PASS. Refactor with tests green.
5. **Commit:** `feat(domain): <rule>` — implementation only.

- Code, identifiers, comments and docs in English.

## Review Focus

1. **Item crossing midnight** (e.g. 23:30 + 60 min): it belongs to its start `localDate`; end instant is next day. → test in Task 4.
2. **DST day inside the materialization window** (Europe/Madrid 2026-03-29 02:30 does not exist; 2026-10-25 02:30 occurs twice) → tests in Task 2 and Task 4.
3. **Dependency with no occurrence that day** must not block → test in Task 7.
4. **Snooze/shift landing inside a protected block or past end of day** → tests in Task 11.
5. **User changes time zone** (travel): future untouched occurrences regenerate in the new zone; user-modified ones are kept → test in Task 12.

---

## File Structure

```
package.json                 root scripts: build, test, lint, typecheck
pnpm-workspace.yaml          packages/*, apps/*
tsconfig.base.json           strict settings shared by all packages
.github/workflows/ci.yml     install, lint, typecheck, test
packages/domain/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts               public exports only
  src/types.ts               shared types (Task 1)
  src/time.ts                zone/instant helpers (Task 2)
  src/recurrence.ts          weekly rule parse/serialize/match (Task 3)
  src/materialize.ts         occurrence generation (Task 4)
  src/transitions.ts         leave-by + warnings (Task 5)
  src/pile-up.ts             no-pile-up rule (Task 6)
  src/dependencies.ts        cycles + blocking (Task 7)
  src/today.ts               Now/Next/Later + timeline (Task 8)
  src/conflicts.ts           overlap + nearest free slot (Task 9)
  src/reminders.ts           reminder job planning (Task 10)
  src/reschedule.ts          snooze/shift/split (Task 11)
  src/regenerate.ts          routine edit regeneration (Task 12)
  test/*.test.ts             one test file per src file (TDD inner loop)
  features/*.feature         Gherkin scenarios per rule (BDD outer loop)
  features/steps/*.steps.ts  step definitions, one file per feature
  features/steps/world.ts    shared World: items, occurrences, user zone, "now"
```

---

### Task 1: Monorepo scaffold + domain types

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.prettierrc`, `eslint.config.js`, `.github/workflows/ci.yml`, `README.md` (stub: purpose + `pnpm i && pnpm test`)
- Create: `packages/domain/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/types.ts}`
- Test: `packages/domain/test/smoke.test.ts`

**Interfaces:**

- Produces (`src/types.ts`, re-exported from `src/index.ts`):

```ts
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
```

- [ ] **Step 1:** `git init`; create root files. Root scripts: `test` → `pnpm -r test`, `typecheck` → `pnpm -r typecheck`, `lint` → `eslint .`. CI runs `pnpm i --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` on Node 22.
- [ ] **Step 2: Write failing test** `smoke.test.ts`: `expect(DEFAULTS.bufferMinutes).toBe(10)` and `expect(DEFAULTS.materializeDays).toBe(7)`.
- [ ] **Step 2b: BDD harness.** Configure `vitest.config.ts` with the `quickpickle` plugin, `include: ['test/**/*.test.ts', 'features/**/*.feature']`, `setupFiles: ['features/steps/**/*.steps.ts']`. Create `features/steps/world.ts` (World holding `items: Item[]`, `occurrences: Occurrence[]`, `zone: IanaZone` default `'Europe/Madrid'`, `now: Instant`) and `features/defaults.feature`: _Scenario: New users get breathing room — Given I am a new user, Then each task is followed by a 10 minute buffer._ Run → FAIL with undefined steps, then define them.
- [ ] **Step 3:** Run `pnpm --filter @anchor/domain test` → FAIL (module not found).
- [ ] **Step 4:** Create `types.ts` exactly as above; export from `index.ts`. Package name `@anchor/domain`, `"type": "module"`.
- [ ] **Step 5:** Run `pnpm test && pnpm typecheck && pnpm lint` → all PASS.
- [ ] **Step 6: Commit** `chore: scaffold monorepo and domain types`

---

### Task 2: Time helpers (zones + DST)

**Files:** Create `src/time.ts`; Test `test/time.test.ts`; Feature `features/time-zones.feature`

**Scenarios:**

- _A morning routine follows my clock:_ Given I live in Europe/Madrid and have "Gym" at 09:00, When it is 17 Nov 2026, Then "Gym" starts at 08:00 UTC.
- _Clocks jump forward:_ Given "Meditate" at 02:30, When it is 29 Mar 2026 (spring forward), Then "Meditate" happens at 03:30 local time.

**Interfaces:**

- Produces:
  - `toInstant(date: LocalDate, time: LocalTime, zone: IanaZone): Instant`
  - `toLocalDate(instant: Instant, zone: IanaZone): LocalDate`
  - `weekdayOf(date: LocalDate): Weekday`
  - `addMinutes(instant: Instant, minutes: number): Instant`
  - `addDays(date: LocalDate, days: number): LocalDate`
  - `diffMinutes(a: Instant, b: Instant): number` (b − a)

- [ ] **Step 1: Failing tests**
  - `toInstant('2026-11-17','09:00','Europe/Madrid')` → `'2026-11-17T08:00:00Z'`
  - gap: `toInstant('2026-03-29','02:30','Europe/Madrid')` → `'2026-03-29T01:30:00Z'` (shifted forward to 03:30 local)
  - overlap: `toInstant('2026-10-25','02:30','Europe/Madrid')` → `'2026-10-25T00:30:00Z'` (earlier instant)
  - `toLocalDate('2026-11-17T23:30:00Z','Europe/Madrid')` → `'2026-11-18'`
  - `weekdayOf('2026-11-17')` → `'TU'`
  - property (fast-check): for any date in 2026 and any time `HH:MM` and zone in `['Europe/Madrid','America/New_York','Asia/Kolkata','UTC']`, `toLocalDate(toInstant(d,t,z), z) === d`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `Temporal.PlainDateTime.toZonedDateTime(zone, { disambiguation: 'compatible' })`. Output instants normalized to `...Z` without milliseconds.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(domain): add zone-aware time helpers`

---

### Task 3: Weekly recurrence rule

**Files:** Create `src/recurrence.ts`; Test `test/recurrence.test.ts`; Feature `features/weekly-routine.feature`

**Scenarios:**

- _My routine repeats on chosen weekdays:_ Given "Gym" every Monday and Wednesday, Then it is planned on Monday 16 Nov and not on Tuesday 17 Nov.

**Interfaces:**

- Consumes: `weekdayOf` (Task 2)
- Produces:
  - `parseRRule(rrule: string): Weekday[]` — accepts only `FREQ=WEEKLY;BYDAY=<list>`; throws `InvalidRecurrenceError` otherwise
  - `toRRule(byDay: Weekday[]): string` — days in MO..SU order, deduplicated
  - `occursOn(schedule: Schedule, date: LocalDate): boolean`

- [ ] **Step 1: Failing tests**
  - `parseRRule('FREQ=WEEKLY;BYDAY=MO,WE')` → `['MO','WE']`
  - `parseRRule('FREQ=DAILY')` throws `InvalidRecurrenceError`; `parseRRule('FREQ=WEEKLY;BYDAY=')` throws
  - `toRRule(['WE','MO','WE'])` → `'FREQ=WEEKLY;BYDAY=MO,WE'`
  - round-trip property: `parseRRule(toRRule(x))` equals sorted unique `x` for any non-empty subset
  - weekly MO/WE `occursOn` `'2026-11-16'` (MO) true, `'2026-11-17'` false; once schedule true only on its `date`
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(domain): add weekly recurrence rule`

---

### Task 4: Occurrence materialization

**Files:** Create `src/materialize.ts`; Test `test/materialize.test.ts`; Feature `features/planning-the-week.feature`

**Scenarios:**

- _My week is planned ahead:_ Given "Gym" on Monday and Wednesday and a one-time "Go to the administrations" on Thursday 19 Nov at 10:00, When the week of 16 Nov is planned, Then I see 3 tasks in that week.
- _Late-night tasks belong to the day they start:_ Given "Read" on Tuesday at 23:30 for 60 minutes, Then it appears on Tuesday's plan.

**Interfaces:**

- Consumes: Tasks 2–3
- Produces:
  - `materialize(items: Item[], from: LocalDate, days: number): OccurrenceDraft[]` — for each non-deleted item and each date in `[from, from+days)` where `occursOn`, one draft with `sequence: 0`, `status: 'pending'`, `userModified: false`, nulls elsewhere; `scheduledEnd = scheduledStart + durationMinutes`. Sorted by `scheduledStart`.
  - `occurrenceKey(d: Pick<Occurrence,'itemId'|'localDate'|'sequence'>): string` → `` `${itemId}:${localDate}:${sequence}` ``

- [ ] **Step 1: Failing tests**
  - routine MO,WE 09:00 60 min Madrid, `from='2026-11-16'`, `days=7` → 2 drafts, starts `2026-11-16T08:00:00Z` and `2026-11-18T08:00:00Z`
  - once item on `2026-11-19` 10:00 → 1 draft; once item outside window → 0
  - item with `deletedAt` set → 0 drafts
  - midnight crossing: 23:30 + 60 min Madrid on `2026-11-17` → `localDate '2026-11-17'`, start `2026-11-17T22:30:00Z`, end `2026-11-17T23:30:00Z` (00:30 local on the 18th)
  - DST window: daily-ish routine (all 7 days) at 02:30 Madrid, `from='2026-03-27'`, 7 days → 7 drafts, the one on `2026-03-29` starts `2026-03-29T01:30:00Z`
  - `occurrenceKey` is unique across output (property over random item sets)
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(domain): materialize occurrences over a date window`

---

### Task 5: Leave-by and transition warnings

**Files:** Create `src/transitions.ts`; Test `test/transitions.test.ts`; Feature `features/transitions.feature`

**Scenarios:**

- _I get told when to leave:_ Given "Go to the administrations" at 10:00 with 20 minutes travel and 10 minutes prep, Then I am told "Leave in 15 min" at 09:15.
- _I get told when to wrap up:_ Given "Deep work" from 09:00 to 10:00, Then I am told "Wrap up in 5" at 09:55.

**Interfaces:**

- Produces:
  - `leaveBy(occ: Occurrence, item: Item): Instant` = `scheduledStart − travel − prep`
  - `type Warning = { kind: 'leave' | 'wrapUp'; at: Instant; occurrenceId: string; message: string }`
  - `transitionWarnings(occ: Occurrence, item: Item): Warning[]` — `leave` at `leaveBy − 15` only if `travel + prep > 0`, message `"Leave in 15 min"`; `wrapUp` at `scheduledEnd − 5`, message `"Wrap up in 5"`. Omit `wrapUp` when duration ≤ 5.

- [ ] **Step 1: Failing tests:** start 10:00Z, travel 20, prep 10 → `leaveBy` 09:30Z, leave warning 09:15Z; no travel/prep → no `leave` warning; 60-min item ending 11:00Z → wrapUp 10:55Z; 5-min item → no wrapUp; no message contains forbidden words (Global Constraints).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(domain): compute leave-by and transition warnings`

---

### Task 6: No-pile-up

**Files:** Create `src/pile-up.ts`; Test `test/pile-up.test.ts`; Feature `features/no-pile-up.feature`

**Scenarios:**

- _Missed repeats don't pile up:_ Given "Water plants" was left open on Monday and Tuesday, When it is Wednesday at 12:00, Then I see "Water plants" only once.

**Interfaces:**

- Produces: `collapsePileUp(occurrences: Occurrence[], now: Instant): string[]` — returns ids to mark `skipped`. Per `itemId`, among occurrences with `status ∈ {pending, active}` and `scheduledStart ≤ now`, keep the latest; return the others' ids. Applies to all kinds (one-offs have only one occurrence, so never collapse).

- [ ] **Step 1: Failing tests:** three past pending "water plants" (Mon/Tue/Wed), now = Wed 12:00 → returns Mon and Tue ids; a `done` occurrence is never returned; future pending occurrences are never returned; two different items don't interfere.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(domain): collapse piled-up recurring occurrences`

---

### Task 7: Dependencies

**Files:** Create `src/dependencies.ts`; Test `test/dependencies.test.ts`; Feature `features/dependencies.feature`

**Scenarios:**

- _A task waits for another:_ Given "Send report" waits for "Write report", When "Write report" is still open, Then "Send report" is waiting on "Write report".
- _Skipping releases the wait:_ Given the same tasks, When "Write report" is skipped, Then "Send report" is ready.
- _Circular waits are refused:_ Given "A" waits for "B", When I make "B" wait for "A", Then I am told the tasks would wait for each other forever.

**Interfaces:**

- Produces:
  - `findCycle(items: Pick<Item,'id'|'dependsOn'>[]): string[] | null` — returns the cycle path (e.g. `['a','b','a']`) or `null`
  - `isBlocked(occ: Occurrence, item: Item, sameDay: Occurrence[]): { blocked: boolean; waitingOn: string[] }` — for each `dependsOn` id: if an occurrence of it exists in `sameDay` (same `localDate`) with status not in `{done, skipped}`, it blocks; if none exists that day, ignored.

- [ ] **Step 1: Failing tests:** a→b→a returns cycle; a→b, b→c returns null; self-dependency a→a returns `['a','a']`; B depends on A, A pending → blocked, `waitingOn: [A.itemId]`; A done → not blocked; A skipped → not blocked; A has no occurrence that day → not blocked (Review Focus 3).
- [ ] **Step 2–4:** FAIL → implement (DFS) → PASS.
- [ ] **Step 5: Commit** `feat(domain): detect dependency cycles and blocked occurrences`

---

### Task 8: Today view

**Files:** Create `src/today.ts`; Test `test/today.test.ts`; Feature `features/today.feature`

**Scenarios:**

- _One thing at a time:_ Given "Gym" 07:00–08:00, "Deep work" 09:00–10:00 and "Lunch" 13:00, When it is 09:15, Then Now is "Deep work", Next is "Lunch", and the timeline shows all three.
- _Open tasks are kept, kindly:_ Given "Gym" 07:00–08:00 is still open, When it is 09:15, Then "Gym" is in Later and nothing calls it overdue.

**Interfaces:**

- Consumes: `isBlocked` (Task 7), `transitionWarnings` (Task 5)
- Produces:

```ts
export interface TodayEntry {
  occurrence: Occurrence;
  item: Item;
  blocked: boolean;
  waitingOn: string[];
  leaveBy: Instant;
}
export interface TodayView {
  now: TodayEntry | null;
  next: TodayEntry | null;
  later: TodayEntry[];
  timeline: TodayEntry[];
}
export function buildTodayView(
  items: Item[],
  occurrences: Occurrence[],
  date: LocalDate,
  now: Instant,
): TodayView;
```

Rules (spec §8.5 Conflicts): `now` = the `active` occurrence if any, else a non-blocked `pending` occurrence whose `[scheduledStart, scheduledEnd)` contains `now`. `next` = earliest non-blocked `pending` with effective start (`snoozedUntil ?? scheduledStart`) after `now`, excluding `now`. `later` = remaining non-`done`/non-`skipped` entries (blocked ones included, flagged). `timeline` = all entries of `date` sorted by effective start, including done/skipped. Past-due pending entries (end < now) appear in `later` — never filtered out.

- [ ] **Step 1: Failing tests:** active occurrence wins `now` even if another overlaps; no active + one in window → that one; blocked occurrence never `now`/`next` and appears in `later` with `waitingOn`; snoozed occurrence uses `snoozedUntil` for ordering; empty day → all null/empty; past-due pending appears in `later`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(domain): build now/next/later today view`

---

### Task 9: Conflicts and free slots

**Files:** Create `src/conflicts.ts`; Test `test/conflicts.test.ts`; Feature `features/protected-time.feature`

**Scenarios:**

- _Lunch is protected:_ Given a protected "Lunch" 13:00–14:00, When I try to place a 30 minute task at 13:15, Then I am warned and offered 14:00.

**Interfaces:**

- Produces:
  - `type Conflict = { occurrenceId: string; protected: boolean }`
  - `occupiedWindow(occ: Occurrence, item: Item): { start: Instant; end: Instant }` = `[leaveBy, scheduledEnd)` (buffers excluded)
  - `findConflicts(candidate: {start: Instant; end: Instant}, existing: {occ: Occurrence; item: Item}[]): Conflict[]` — ignores `done`/`skipped`
  - `nearestFreeSlot(durationMinutes: number, after: Instant, dayEnd: Instant, existing: {occ: Occurrence; item: Item}[]): Instant | null` — first start ≥ `after` with no conflict; candidate grid = `after` and each existing window end; `null` if it can't end by `dayEnd`.

- [ ] **Step 1: Failing tests:** overlap with protected lunch returns `protected: true`; overlap only with travel window counts; touching edges (end == start) is not a conflict; free slot skips past lunch to lunch end; returns `null` when day is full.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(domain): detect conflicts and find free slots`

---

### Task 10: Reminder planning

**Files:** Create `src/reminders.ts`; Test `test/reminders.test.ts`; Feature `features/reminders.feature`

**Scenarios:**

- _Reminders escalate, then stop:_ Given "Deep work" at 09:00 with full reminders, Then I get a gentle reminder at 08:50, an insistent one at 09:00, one repeat at 09:05, and nothing more.
- _Quiet hours stay quiet:_ Given quiet hours 22:00–07:00 and a non-essential "Stretch" at 06:30, Then I get no reminders for "Stretch".

**Interfaces:**

- Consumes: `leaveBy` (Task 5)
- Produces:

```ts
export type ReminderLevel = 'gentle' | 'insistent' | 'repeat' | 'ready';
export interface ReminderJob {
  key: string;
  occurrenceId: string;
  level: ReminderLevel;
  at: Instant;
}
export interface QuietHours {
  start: LocalTime;
  end: LocalTime;
  zone: IanaZone;
} // may wrap midnight
export function planReminders(input: {
  occ: Occurrence;
  item: Item;
  userPolicy: ReminderPolicy;
  quiet: QuietHours | null;
  blocked: boolean;
  releasedAt: Instant | null;
  now: Instant;
}): ReminderJob[];
```

Rules: effective policy = `item.reminderPolicy ?? userPolicy`. `off` → `[]`. `blocked` → `[]`. `gentle` at `leaveBy − 10`; `insistent` at effective start; `repeat` at start + 5. Policy `gentle` → gentle only. Jobs with `at < now` dropped. If `releasedAt` is set and effective start < `releasedAt` → exactly one `ready` job at `releasedAt`. Quiet hours: drop `gentle` always, and drop all jobs if `!item.essential`. `key` = `` `${occurrenceId}:${level}` ``.

- [ ] **Step 1: Failing tests:** full policy → 3 jobs at the exact times; item override `off` beats user `full`; gentle policy → 1 job; blocked → none; released late → single `ready`; quiet hours wrapping midnight (22:00–07:00) drops non-essential 06:30 item entirely and drops only gentle for essential item; past jobs dropped.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(domain): plan layered reminder jobs`

---

### Task 11: Snooze, shift, split

**Files:** Create `src/reschedule.ts`; Test `test/reschedule.test.ts`; Feature `features/rescheduling.feature`

**Scenarios:**

- _Later today, or tomorrow morning:_ Given my day is full until 23:59, When I move "Read" to later today at 23:00, Then "Read" moves to tomorrow's first free slot.
- _Split a big task:_ Given "Deep work" for 60 minutes, When I split it, Then I have two 30 minute parts.

**Interfaces:**

- Consumes: `nearestFreeSlot` (Task 9)
- Produces:
  - `snooze(occ: Occurrence, minutes: 10 | 30, now: Instant): Occurrence` — sets `snoozedUntil = now + minutes`, `userModified: true`
  - `shiftLaterToday(occ, item, ctx: { now: Instant; dayEnd: Instant; nextDayStart: Instant; nextDayEnd: Instant; existingToday; existingTomorrow }): Occurrence` — moves to `nearestFreeSlot` today; if `null`, to tomorrow's first free slot (spec: "Later today" → "Tomorrow morning"), updating `localDate`; `userModified: true`
  - `split(occ, item, ctx: same as shift): [Occurrence, OccurrenceDraft]` — remaining = `scheduledEnd − max(now, scheduledStart)`; first keeps its start with half (rounded down); second draft gets the other half, `splitFromOccurrenceId = occ.id`, `sequence = occ.sequence + 1`, placed via the shift rule.

- [ ] **Step 1: Failing tests:** snooze 10 sets exact instant; shift skips a protected lunch (Review Focus 4); shift at 23:00 with no room → tomorrow's first free slot with new `localDate`; split 60-min at start → 30 + 30, second after next free gap; split 45-min → 22 + 23.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(domain): add snooze, shift and split`

---

### Task 12: Routine edit regeneration

**Files:** Create `src/regenerate.ts`; Test `test/regenerate.test.ts`; Feature `features/editing-routines.feature`

**Scenarios:**

- _Changing my routine respects what I already moved:_ Given "Gym" at 09:00 every weekday and I snoozed Wednesday's "Gym", When I change "Gym" to 10:00, Then the other upcoming days move to 10:00 and Wednesday stays as I left it.

**Interfaces:**

- Consumes: `materialize`, `occurrenceKey` (Task 4)
- Produces:
  - `planRegeneration(existing: Occurrence[], drafts: OccurrenceDraft[], now: Instant): { create: OccurrenceDraft[]; remove: string[]; keep: string[] }`
  - Rules: an existing occurrence is **kept** if `userModified`, or status ≠ `pending`, or `scheduledStart ≤ now`. Other existing occurrences are **removed** unless a draft with the same `occurrenceKey` has identical start/end (then kept). Drafts whose key matches a kept occurrence are not created.

- [ ] **Step 1: Failing tests:** routine time 09:00 → 10:00: future untouched occurrences removed and recreated at 10:00; snoozed (userModified) one kept; past and `done` kept; identical regeneration is a no-op (`create: [], remove: []`) — idempotency; time zone change Madrid → New York regenerates untouched future ones in NY (Review Focus 5); deleted item (no drafts) removes untouched future ones only.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Export every **Produces** symbol from `src/index.ts`; run `pnpm lint && pnpm typecheck && pnpm test` → PASS; add a "Domain rules" section to `README.md` linking to the spec.
- [ ] **Step 6: Commit** `feat(domain): plan regeneration after routine edits`
