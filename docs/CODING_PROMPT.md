# Coding prompt

Paste everything below the line into Claude Code (or any coding agent) opened at the repo root.

---

You are building **Adaptive Academic Planner**, a hackathon web app that creates a realistic study schedule for university students and automatically reschedules it when they fall behind.

## Read first, in this order

1. `CLAUDE.md` for the non-negotiable rules and conventions.
2. `docs/SPEC.md` for the product requirements and the demo scenario (source of truth for features).
3. `docs/DESIGN.md` for the architecture, data model, scheduler algorithm, rescheduling pipeline, feasibility rules, demo mode and tests (source of truth for how).
4. `docs/BUILD_CHECKLIST.md` for the phases and gates.

If the spec and the design disagree, the design wins (it resolves the spec's open questions). If something is still ambiguous, pick the simplest reasonable option, note it in `docs/DECISIONS.md`, and keep going. Do not stop to ask before starting.

## What to build

A Next.js (App Router) + TypeScript + Tailwind + shadcn/ui app with five pages (Dashboard, Calendar, Assignments, Settings, Rescheduling Preview), a deterministic scheduling engine, progress-aware rescheduling with a reviewable diff, feasibility warnings, a simulated calendar, and a demo control panel. Google Calendar, Supabase and live Claude calls are stretch work behind interfaces.

## The core idea (do not get this wrong)

- The **scheduler is a pure function** `schedule(state, now) -> Plan` in `lib/scheduler`. No AI, no I/O, no system clock, no randomness. Same input, same output. It uses the daily pacing algorithm in `docs/DESIGN.md` section 4.
- **Rescheduling is not "move the missed event".** A progress change recomputes `remaining_hours`, reruns the scheduler over the unlocked future, diffs it against the current plan (kept / moved / added / removed with reason codes), and presents a proposal the student accepts or rejects. Undo is one step.
- **Never break a hard limit to fit work in.** Place what fits, report `hours_short`, raise a red warning naming the assignment, and offer computed what-if suggestions.
- **Existing calendar events are read-only unavailable time.**
- **AI only breaks assignments into subtasks**, via a server route with a zod-validated schema and a deterministic fallback template. It never sees the calendar and never returns dates.

## How to work

Work in the phases from `docs/BUILD_CHECKLIST.md` and do not start a phase until the previous gate passes.

1. **Foundation.** Scaffold the app. Write `lib/types.ts` first (all entities, `Plan`, `Proposal`, `Diff`, `Warning`). Build `lib/time/slots.ts`, the `CalendarProvider` interface, the simulated provider with recurring events, `lib/demo/seed.ts` (dates as offsets from a demo anchor), the Zustand store and the app shell. Render the seeded week on the Calendar page with different styling for personal events versus study sessions.
2. **Scheduler core.** Implement `availability.ts`, `pace.ts`, `place.ts`, `index.ts` exactly as designed, with the Vitest suite listed in `docs/DESIGN.md` section 12 written **alongside** the code (test first where practical). Do not move on until the scheduler tests pass.
3. **Progress loop.** Implement `lib/progress/remaining.ts`, `diff.ts` (with reason codes and the stability pass), `lib/feasibility/check.ts` (cumulative check, warning kinds, what-if suggestions), proposal creation, accept, reject, undo snapshots. Wire session status buttons and the percent / remaining-hours control so they trigger real proposals. Build the Rescheduling Preview page.
4. **Demo polish.** Dashboard, Assignments, Settings (including sleep schedule), warning banners, DemoPanel (Reset, Advance clock, Mark next session missed, Log 1 h and set 25%, Surprise shift, Squeeze week, Export/Import), the mobile day view, accessibility cues (icons and patterns, not color alone). Verify the presenter script in `docs/DESIGN.md` section 11 end to end.
5. **Stretch, only after the demo is solid.** AI breakdown route with fallback and cache, then Supabase `Repo`, then the Google Calendar provider (dedicated "Study Planner" calendar, tagged events, only ever modify our own).

## Quality bar

- Every button works. Changing progress produces a real schedule change visible on the calendar.
- No session ever overlaps a calendar event, sleep window, free day or pinned session, and none exceeds the daily maximum.
- The reorganization after a progress update is visible and takes under 2 seconds.
- The design looks like a polished SaaS product (soft neutral background, rounded cards, one indigo accent, clean Inter typography, clear progress bars), friendly rather than corporate. Use the `frontend-design` skill if available.
- Seed data is realistic and relative to the demo anchor, so it never goes stale. A unit test proves the opening plan has no deadline risk and Squeeze week produces a red warning.
- Strict TypeScript, `npm run lint` and `npm test` clean, no console errors at 1440 px and 390 px.

## Before you finish each phase

Run `npm test` and `npm run lint`, check the gate in `docs/BUILD_CHECKLIST.md`, tick it off, and commit with a short descriptive message. At the end, update `README.md` with real run instructions and list anything not done in `docs/DECISIONS.md`.

Begin with phase 1. Start by scaffolding the project and writing `lib/types.ts`.
