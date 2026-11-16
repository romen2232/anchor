# Anchor — Design

Date: 2026-11-15
Status: Approved (2026-11-15)

## 1. Intent

A personal daily planner built around a **weekly routine** plus **one-off tasks**, with a calm "what do I do now?" experience and reminders that actually get acted on.

It serves two purposes at once:

- **Personal tool** — the author uses it daily to organize themself and build a routine.
- **Open-source showcase** — the repository demonstrates engineering ability across a Node backend, a Next.js web app and a React Native Android app. Code quality, architecture, tests and docs are part of the deliverable, not an afterthought.

Guiding principle: **reduce friction and guilt.** Every feature is judged by whether it makes it easier to start, continue, or recover — never by whether it adds more to look at.

## 2. Goals (v1)

1. Public live demo with sign-up; each user sees only their own data.
2. Weekly routine (recurring items per weekday) and one-off dated tasks.
3. Correct time-zone and daylight-saving behaviour.
4. Dependencies between items (B waits for A) and no pile-up of missed recurring occurrences.
5. Today screen with **Now / Next / Later** focus view **and** the full-day timeline, both available.
6. Visual time (countdown ring, shrinking bar), transition warnings, travel/prep time, buffers.
7. Layered reminders (gentle → insistent), quiet mode, customizable per item.
8. One-tap snooze / shift / split; no "overdue" red.
9. "Just 5 minutes" mode.
10. Protected rest and meal blocks.
11. AI-drafted, user-editable instructions and tiny first steps when creating an item.
12. Very fast capture and minimal setup.
13. Immediate, satisfying completion feedback.
14. Bauhaus visual style on web and Android.

## 3. Non-goals (v1) — planned for later layers

| Layer                 | Feature                                                                                                        | Why later                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| AI assist             | Auto-suggest what matters today, urgent vs interesting classification, auto-rebalance when the day falls apart | Needs v1 data model and real usage first                                                      |
| Learning & reflection | Learn real durations and add buffers, one-tap mood/energy logging, insights, "days this week"                  | Needs weeks of recorded data. v1 **records** actual start/end times so this is possible later |
| Habits                | Habit stacking, routine templates                                                                              | Builds on stable item model                                                                   |
| Triggers              | Location and external event triggers                                                                           | Android background-location permissions and Play Store review                                 |
| Platforms             | iOS, offline-first sync, device-local fallback notifications                                                   | Scope                                                                                         |

**Dropped entirely:** contact-person escalation (not wanted; also an abuse vector in an open-signup demo).

The v1 data model must allow every later layer to be added **without a rewrite**.

## 4. Anti-goals

The project fails, even if it technically works, if:

- It becomes another source of noise (too many notifications, cluttered screens).
- It induces guilt: red "overdue" states, broken-streak resets, judgmental copy.
- The only view is a dense full-day grid or long to-do list.
- It ends up as a broad, half-finished showcase instead of a narrow, polished one.

## 5. Constraints

- Stack (decided by author): Next.js web app, React Native Android app, shared Node.js backend.
- Open source: no secrets in repo, clear README, runnable locally with one command.
- Public demo must be cheap to run (free-tier friendly) and abuse-resistant (rate limits, AI caps).

## 6. Approaches considered — reminder delivery

|                | Approach                                                                                                                                | Trade-off                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A (chosen)** | **Server-driven.** Backend computes occurrences (incl. TZ/DST) and a worker sends Web Push and FCM at the right moment, with escalation | Single source of truth; escalation and no-pile-up are easy to guarantee; same behaviour on every device. Needs a worker; depends on network delivery |
| B              | Device-local. Each client schedules local notifications from the synced plan                                                            | Works offline, simple backend. Web notifications unreliable with tab closed; cross-device escalation/dedup is messy                                  |
| C              | Hybrid. Server primary + Android local fallback                                                                                         | Most robust; two delivery paths to build and test. Possible later upgrade from A                                                                     |

**Decision:** A, with the job queue stored in **Postgres (pg-boss)** instead of Redis — one less piece of infrastructure for a free-tier demo. The author chose A.

## 7. Architecture

### 7.1 Repository layout (author approved monorepo + hexagonal direction)

pnpm workspaces monorepo:

```
apps/
  api/        Node backend (HTTP API + worker entrypoint)
  web/        Next.js app
  mobile/     React Native (Expo) Android app
packages/
  domain/     Pure TypeScript: recurrence, TZ/DST, dependencies, no-pile-up,
              transition/leave-by calculation, reminder escalation policy.
              No I/O, no framework imports.
  contracts/  Shared API schemas (zod) and generated types/OpenAPI
  design-tokens/  Bauhaus colours, typography, spacing, shapes for web + mobile
```

### 7.2 Backend (hexagonal)

- **Domain** (`packages/domain`): entities and pure functions. The heart of the showcase; heavily unit- and property-tested.
- **Application**: use cases (CreateItem, CompleteOccurrence, SnoozeOccurrence, SplitOccurrence, GetToday, DraftInstructions…).
- **Ports**: `ItemRepository`, `OccurrenceRepository`, `JobScheduler`, `PushSender`, `InstructionDrafter`, `Clock`.
- **Adapters**: Postgres repositories, pg-boss scheduler, Web Push (VAPID) and FCM senders, AI provider, HTTP controllers.
- The **worker** is a second entrypoint of `apps/api` sharing the same application layer; it runs pg-boss handlers.

### 7.3 Data model (v1)

- **User** — id, email, IANA time zone (auto-detected at sign-up, editable), quiet-hours window, default buffer minutes, default reminder policy.
- **Item** (the definition):
  - `kind`: `routine` | `oneoff` | `protected` (rest/meal) | `slack` (buffer block)
  - title, instructions (markdown), firstSteps (ordered list)
  - schedule: `routine` → recurrence rule (RRULE, weekday-based) + local start time + user time zone; `oneoff` → local date-time + time zone
  - durationMinutes, prepMinutes, travelMinutes, bufferAfterMinutes
  - essential (boolean, "must-do") — used later by auto-rebalance
  - dependsOn (item ids)
  - reminderPolicy (override of user default)
- **Occurrence** (a concrete instance on a day):
  - itemId, localDate, scheduledStart/End (UTC), status: `pending | active | done | skipped`
  - snoozedUntil, splitFromOccurrenceId
  - actualStart, actualEnd (recorded for future duration learning)
- **PushSubscription** — userId, platform (`web` | `android`), endpoint/token.

Occurrences are materialized a rolling window ahead (e.g. 7 days) by the worker and on item change; past occurrences are kept as history.

### 7.4 Core rules

- **Time zones / DST:** times are stored as wall-clock + IANA zone and converted to UTC per occurrence. A non-existent local time (spring forward) shifts forward to the first valid instant; an ambiguous time (fall back) uses the first occurrence. Changing the user's time zone recomputes future occurrences.
- **No pile-up:** for a recurring item, at most **one** unfinished occurrence is visible. When a new occurrence starts and the previous one is still unfinished, the previous one is closed as `skipped` (silently, no guilt copy) and the new one takes its place.
- **Dependencies:** an occurrence whose dependency (same day) is not `done` is shown as "waiting on X" in Later and its reminders are held. When the dependency completes, it becomes eligible for Next and its reminders are released.
- **Leave-by / transitions:** `leaveBy = scheduledStart − travel − prep`. Warnings: "leave in 15 min" (15 min before leaveBy, when travel/prep > 0) and "wrap up in 5" (5 min before the active item's end).
- **Buffers:** each item gets `bufferAfterMinutes` (user default, e.g. 10). Slack blocks are explicit items.
- **Protected blocks:** rest and meals cannot be overlapped by other items when scheduling; non-essential reminders are muted during them.

### 7.5 Reminders

- Escalation levels (v1): **gentle** (silent notification at leave-by/start minus lead time) → **insistent** (sound/heads-up at start) → one repeat after 5 min, then stop. Never more.
- Quiet mode / quiet hours: suppresses gentle reminders and all non-essential items.
- Customizable globally and per item (off / gentle only / full).
- Every notification offers actions: **Start**, **Snooze 10 min**, **Later today**.
- Jobs are scheduled in pg-boss keyed by occurrence id + level, so rescheduling cancels and replaces them idempotently.

### 7.6 AI assist (v1 scope)

- When creating an item, the user enters a title (and optionally a note). The AI drafts **instructions** and **2–4 tiny first steps** (each under ~2 minutes). Everything is editable before saving; the AI never saves on its own.
- Behind the `InstructionDrafter` port. Default adapter: a small Claude model (e.g. `claude-haiku-5-5`); swappable.
- Demo safeguards: per-user daily cap, request timeout, graceful fallback (item saves fine without AI).

## 8. User experience

### 8.1 Today screen

Two views of the same data, both always reachable:

- **Focus (Now / Next / Later)** — default. One large card for Now (instructions, first steps, countdown ring), a smaller Next card (with "leave in…" if relevant), and a collapsed Later list.
- **Timeline** — the full day. On web, shown side by side with Focus on wide screens; on Android, one swipe/tab away.

```
 ┌───────────── NOW ─────────────┐   TIMELINE
 │  ◔ 18 min left                │   07:00 Gym
 │  Deep work                    │ ▶ 09:00 Deep work
 │  1. Open the doc              │   10:30 ★ Administrations
 │  2. Write one sentence        │   13:00 Lunch (protected)
 │  [Done] [Just 5 min] [Shift]  │   18:00 Study RN
 └───────────────────────────────┘
  NEXT  ★ Administrations · leave in 25 min
  LATER  3 items ▾
```

### 8.2 Interactions

- **Quick capture:** a single input ("admin thu 10am") with natural-language date parsing; everything else gets sensible defaults. Expand for details.
- **Just 5 minutes:** starts a 5-minute ring on the current item. At the end: "Keep going" or "Stop here — that counts." Either outcome is recorded positively.
- **Snooze / Shift / Split:** one tap each. Shift offers "later today", "tomorrow", "pick time". Split divides the remaining duration into two occurrences.
- **Past-due items** are shown in neutral colour with "Still open — when works?" Never red, never "overdue".
- **Completion feedback:** short shape animation (Bauhaus geometry) and optional sound.

### 8.3 Visual style — Bauhaus

- Primary red, yellow, blue, plus black and off-white; flat colour, no gradients or shadows.
- Geometric primitives (circle, square, triangle) as functional UI: the countdown ring is a circle, item kinds map to shapes.
- Strong grid, generous whitespace, geometric sans-serif typeface, asymmetric but balanced layouts.
- Tokens live in `packages/design-tokens` and are consumed by both web and mobile. Light and dark themes.
- Low clutter is a hard rule: when in doubt, remove.

### 8.4 Language

Gentle and non-judgmental. No "overdue", "failed", "missed", "streak lost". Prefer "still open", "moved to later", "that counts".

## 8.5 Detailed rules (designer's calls after builder review)

**Auth & tenancy**

- Email + password with mandatory email verification, plus Google OAuth. Web uses httpOnly cookie sessions; mobile and the push service worker use bearer tokens issued by the same auth system.
- Every repository query is scoped by `userId` at the adapter level; there is no un-scoped read path.

**Editing routines**

- Editing a routine (time, RRULE, duration, time zone) applies from **now onwards**: future `pending` occurrences that the user has not touched are regenerated; occurrences the user has snoozed/shifted/split are kept as they are; `active`, `done` and `skipped` occurrences and all history are never rewritten.
- Deleting an item soft-deletes it: future occurrences are removed, history is kept.
- Regeneration is idempotent (unique key: itemId + localDate + sequence).

**Dependencies**

- Same-day only in v1. A routine may depend on a one-off and vice versa when both fall on the same day; if the dependency has no occurrence that day, the dependency is ignored for that day.
- Cycles are rejected at creation time.
- A dependency is satisfied when its occurrence is `done` **or** `skipped` (including no-pile-up auto-skip) — B is never blocked forever.
- Held reminders, once released: if the scheduled start has already passed, send a single gentle "ready when you are" notification instead of the escalation chain.

**Conflicts**

- Overlaps between ordinary items are allowed and shown with a soft warning.
- Creating/moving an item into a protected block shows a warning and offers the nearest free slot; the user can still override.
- The leave-by window (travel + prep) counts as occupied time for conflict warnings; buffers do not.
- **Now** = the `active` occurrence if any, otherwise the occurrence whose scheduled window contains the current time. **Next** = the earliest eligible (not blocked) pending occurrence after Now.

**Reminders**

- Gentle reminder lead time default: 10 min before leave-by (or start, if no travel/prep). User-configurable.
- Notification actions on web are handled by the service worker calling the API with a short-lived, action-scoped token embedded in the push payload.
- "Later today" with no time left becomes "Tomorrow morning" (first free slot).
- Push subscriptions returning 404/410 are deleted.
- Web Push on iOS Safari: out of scope.

**Split, Shift, Just 5 minutes**

- Split divides the remaining duration 50/50; the second part is placed in the next free slot today, otherwise tomorrow's first free slot.
- Just 5 minutes sets the occurrence `active` and records `actualStart`; stopping after 5 minutes records a `FocusSession` (occurrenceId, start, end, outcome) and returns the occurrence to `pending`. Add a `FocusSession` table for this; it also feeds future duration learning.

**Quick capture**

- v1 parses one-off tasks only (title + optional date/time). Routines are created through the full form.

**Guest demo (author decided: yes)**

- The landing page has a "Try it without an account" button that creates a temporary guest account in one click, pre-filled with a sample week (routines, one-offs, a protected lunch, a dependency, a travel item) relative to the visitor's time zone.
- Guest accounts can use every v1 feature except push notifications on Android; they can be converted to a real account (email + password) keeping their data.
- Guest accounts and their data are deleted 24 h after creation. Guest creation is rate-limited per IP (same budget as sign-ups) and guest AI drafts are capped at 5.

**Demo limits**

- AI drafts: 20 per user per day. Items: 200 per user. Sign-ups: 5 per IP per day. Accounts inactive for 60 days are deleted (stated in the privacy note).

**Hosting**

- A long-running process is required for the worker; serverless-only hosting is not acceptable for `apps/api`. The web app may be serverless.

## 9. Quality bar (showcase)

- BDD outer loop: each rule is specified as Gherkin scenarios (`.feature` files, run by Vitest via quickpickle) in user language — living documentation.
- Strict TDD inner loop: the `domain` package is test-first with unit and property-based tests for recurrence and DST edge cases.
- Git history shows red → green: a `test:` commit with failing scenarios/tests, then a `feat:` commit that makes them pass.
- Contract tests between `contracts` and API.
- E2E smoke tests for the web Today flow.
- CI on every push: lint, typecheck, tests.
- README with architecture diagram, local setup in one command, and live-demo link.

## 10. Calls made by the designer (not explicitly decided by the author)

- pnpm monorepo with a pure `domain` package; hexagonal backend.
- Postgres + pg-boss (no Redis).
- REST + zod-based contracts (instead of tRPC/GraphQL) so web and mobile consume the same documented API.
- Expo for the React Native app.
- No-pile-up implemented as "auto-skip previous unfinished occurrence".
- Escalation capped at gentle → insistent → one repeat.
- Default buffer 10 min; transition warnings at 15 and 5 min.

## 11. Left to the builder

- Backend HTTP framework, ORM/query builder, auth library, date library (must support IANA zones correctly).
- Natural-language date parser.
- Hosting providers for the demo.
- Exact animation and sound assets.
- Build order between web and mobile (backend + domain first is expected).
