# Build checklist

Phases are ordered by gates, not hours. Do not start a phase until the previous gate passes. Cut from the bottom if time runs short.

## Phase 1: Foundation

- [x] Scaffold Next.js (App Router, TypeScript strict), Tailwind, shadcn/ui, Vitest, zod, Zustand, luxon
- [x] `lib/types.ts` with all entities, `Plan`, `Proposal`, `Diff`, `Warning`
- [x] `lib/time/slots.ts` (15-minute grid, UTC <-> local, DST-safe)
- [x] `CalendarProvider` interface and simulated provider with weekly recurrence
- [x] `lib/demo/seed.ts` with dates as offsets from the demo anchor
- [x] Zustand store (plan, proposals, snapshots, simulated clock)
- [x] App shell: sidebar (desktop), bottom tabs (mobile)
- [x] Calendar page renders the seeded week; personal events and study sessions styled differently

**Gate 1:** seeded week renders on the Calendar page. (All routes build and return 200; checked in headless Chrome at 1440 px and 390 px, no console errors. shadcn/ui is not initialised yet: components are hand-written with Tailwind and added as needed.)

## Phase 2: Scheduler core

- [x] `availability.ts`: free-slot grid (sleep window incl. midnight crossing, events + buffers, free days, locked/pinned, past)
- [x] `pace.ts`: daily quotas with carryover, EDF ordering with priority/difficulty tie-breaks, exam cap and spacing
- [x] `place.ts`: preferred windows first, session splitting, breaks, subtask queue
- [x] `index.ts`: `schedule(state, now) -> Plan`
- [x] Vitest: no overlap, deadlines respected, daily limit, sleep and free days, minimum session, determinism, subtask order, exam spacing, performance under 200 ms

**Gate 2:** all scheduler tests pass; same output on every run. (25 tests green; "Generate plan" renders the opening plan in ~100 ms.)

## Phase 3: Progress loop

- [x] `progress/remaining.ts` (percent vs override, missed returns hours, partial credits minutes)
- [x] `progress/diff.ts` with stability pass and reason codes
- [x] `feasibility/check.ts`: cumulative shortfall, warning kinds, shortage mode, what-if suggestions
- [x] Proposal create / accept / reject / supersede; plan snapshots and one-step undo
- [x] Session status controls (done, partial with minutes, missed, pin) trigger proposals
- [x] Assignment percent / remaining-hours control triggers proposals
- [x] Rescheduling Preview page: kept, moved, added, removed, reasons, risk per assignment
- [x] Tests: locked sessions unchanged, no-op proposal all kept, accept then undo restores plan, infeasible case

**Gate 3:** presenter steps 1 to 9 run end to end. (Scripted in headless Chrome at 1440 px and 390 px: no console errors, accept-to-calendar in ~60 ms, red warning after Squeeze week, suggestion clears it, undo restores it.)

## Phase 4: Demo polish

- [x] Dashboard: today's sessions, deadlines, weekly workload meter, progress bars, warnings
- [x] Assignments page: cards, add/edit sheet, delete, complete, risk chip
- [x] Settings page: windows, max hours, session length, breaks, free days, bedtime, wake, wind-down, AI default
- [x] Warning banners and suggestion buttons
- [x] DemoPanel: Reset, Advance clock, Mark next session missed, Log 1 h and set 25%, Surprise shift, Squeeze week, Export/Import
- [x] Mobile single-day calendar view, verified at 390 px
- [x] Accessibility: icons and patterns beyond color, keyboard reachable controls, AA contrast
- [x] Seed tests: opening plan has no deadline risk; Squeeze week is red
- [ ] Rehearse the script twice with Reset; record a 90-second backup video; test the production build locally

**Gate 4:** rehearsed twice, backup video recorded, no console errors at 1440 px and 390 px. (Automated: presenter script and every page/flow scripted in headless Chrome at both widths with no console errors and axe WCAG A/AA clean. Still to do by the team: two live rehearsals and the backup video.)

## Phase 5: Stretch (only after Gate 4)

- [ ] AI breakdown route: zod schema, 8 s timeout, one retry, template fallback, cached demo results, editable table, per-assignment toggle
- [ ] Supabase `Repo` implementation and migrations
- [ ] Google OAuth and Google `CalendarProvider` (dedicated "Study Planner" calendar, tagged events, never modify others)

## Never cut

Scheduler tests, proposal diff with reasons, red deadline warning, Reset demo, backup video.
