# CLAUDE.md

Project: Adaptive Academic Planner (HackCamp). Read `docs/SPEC.md` for what to build, `docs/DESIGN.md` for how, and `docs/CODING_PROMPT.md` for the build order.

## Non-negotiable rules

1. **The scheduler is deterministic and AI-free.** `lib/scheduler` is a pure function `schedule(state, now) -> Plan`. No I/O, no `Date.now()`, no `Math.random()`. `now` is an argument. Ties break on `id`. Same input, same output.
2. **AI only breaks assignments into subtasks.** It never sees the calendar and never outputs dates or times. Every AI failure path ends in a deterministic fallback template.
3. **Existing calendar events are read-only and always unavailable time.** Never modify or delete them. Only events we create (tagged) may be changed.
4. **Never violate a hard limit to make work fit.** Hard: sleep window, free days, max hours per day, calendar events, minimum session length. When work does not fit, place what fits and report `hours_short`.
5. **Progress changes produce a proposal, never a silent overwrite.** The student reviews a diff with reasons, then accepts or rejects. One-step undo after accept.
6. **Locked sessions never move:** past, completed, partial, pinned, and sessions starting within 2 hours.
7. **Demo mode must work with no network.** Simulated calendar, local store, cached AI breakdowns.
8. **No decorative buttons.** Every control calls the real store and scheduler.

## Conventions

- TypeScript strict. Business logic in `lib/`, framework-free, shared by browser and route handlers.
- Store timestamps as UTC. Convert to the user's IANA zone only for display and recurrence expansion (use `luxon` or `date-fns-tz`).
- 15-minute slot grid. Times in scheduler code are integer slot indexes.
- Validate all external input with `zod`.
- Secrets only in server code. `ANTHROPIC_API_KEY` and Supabase service key never reach the client.
- Seed dates are offsets from a demo anchor, never hard-coded calendar dates.
- Accessibility: calendar blocks carry an icon or pattern as well as color. Target WCAG AA contrast. Keyboard reachable controls.
- Desktop first, verify at 390 px (mobile uses a single-day calendar view).

## Commands

```bash
npm run dev        # dev server
npm test           # Vitest
npm run lint
npm run build
```

## Definition of done (demo)

After a missed session and a progress update, the calendar visibly reorganizes in under 2 seconds. The Preview page lists each moved session with a reason. No session touches a personal commitment. When work cannot fit, a red warning names the assignment and hours short. Tests pass, no console errors at 1440 px and 390 px.

## Git

Commit at the end of each phase in `docs/BUILD_CHECKLIST.md`. Small, descriptive messages.
