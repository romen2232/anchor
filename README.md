# Anchor

A scheduling app. This repo currently holds the pure TypeScript `domain` package (time and recurrence logic).

```sh
pnpm i && pnpm test
```

## Domain rules

The behavior of `@anchor/domain` is specified in [the design spec](docs/superpowers/specs/2026-11-15-anchor-design.md) and pinned by Gherkin scenarios in `packages/domain/features/`:

- Weekly routines and one-off tasks, materialized per local date and time zone
- Transition warnings (leave-by, wrap-up) and no pile-up of overdue work
- Dependencies: blocked occurrences wait, then release
- Today view: Now, Next, Later
- Protected time: conflicts and nearest free slot
- Layered reminders with quiet hours
- Snooze, shift and split
- Regeneration after routine edits, preserving what the user already changed
