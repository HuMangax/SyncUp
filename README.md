# SyncUp

A study planner for university students that adapts to real life. It builds a realistic study schedule around classes, work and social plans. When a student misses a session or falls behind, it recalculates the remaining work and proposes a new plan to review and accept.

Built for HackCamp. The differentiator is **progress-aware rescheduling**: not "move the missed event to the next slot", but "recompute how much work is left, replan everything unlocked, show what changed and why".

## Run it

Requires Node 20+.

```bash
cp .env.example .env.local   # NEXT_PUBLIC_DEMO=1 is already set
npm install
npm run dev                  # http://localhost:3000, demo mode, no network or keys needed
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Vitest suite (scheduler, progress loop, feasibility, demo, AI fallback, Google provider, row mapping) |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run build && npm start` | Production build, the one to demo from |

## Demo

With `NEXT_PUBLIC_DEMO=1` a **Demo** button (bottom right) opens the presenter controls: Reset, Advance clock, Mark next session missed, Log 1 h on Marketing and set 25%, Surprise shift, Squeeze week, Export and Import. They call the same store actions as the UI. Seed dates are offsets from the coming Monday, so the demo never goes stale.

Presenter script (`docs/DESIGN.md` §11):

1. **Assignments:** three assignments with different deadlines.
2. **Calendar:** classes, the part-time job and Thursday dinner.
3. **Generate plan.**
4. Click Monday's Marketing session and choose **Missed**.
5. **Assignments:** set Marketing to 25%, then **Update**.
6. Follow the **Review changes** banner to Preview. It lists each moved session with its reason.
7. **Accept new plan.** The calendar reorganizes and changed sessions are highlighted.
8. **Demo > Squeeze week**, then accept. A red warning names Marketing paper and the hours short.
9. Click **Raise your daily max**. It shows the hours it recovers and opens a new proposal.

Reset demo between rehearsals.

## How it works

- `lib/scheduler`: `schedule(state, now) -> Plan` is a pure, deterministic function on a 15-minute slot grid. It respects these hard limits: sleep, free days, the daily max, calendar events plus a break buffer, and the minimum session length. When work doesn't fit it reports `unplaced` hours instead of breaking a limit.
- `lib/progress`: tracks remaining hours (percent, or a manual override), session status (done, partial, missed), the stable diff with reason codes, and proposals (build, accept, undo).
- `lib/feasibility`: cumulative per-deadline capacity checks, warnings, and what-if suggestions, which are reruns of the same scheduler.
- `lib/ai`: assignment breakdown only. It never sees the calendar and never returns dates. Responses are zod-validated and clamped, with an 8 s timeout and one retry, falling back to a template. The three demo assignments are pre-cached.
- `lib/calendar`: the `CalendarProvider` interface, a simulated provider with weekly recurrence that is safe across DST, and a Google provider.
- `store/planner.ts`: a Zustand store persisted to localStorage, with a simulated clock.

Rules and conventions are in [`CLAUDE.md`](CLAUDE.md). Design is in [`docs/DESIGN.md`](docs/DESIGN.md). Choices made along the way are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Optional integrations

Each one is off unless configured, and the app runs without any of them. They only activate when `NEXT_PUBLIC_DEMO` is not `1`.

### AI breakdown (Claude)

Set `ANTHROPIC_API_KEY`, and optionally `ANTHROPIC_MODEL` (defaults to `claude-opus-5-5`). The key stays on the server in `app/api/breakdown/route.ts`. Without a key, or on any failure, the panel uses the standard template.

### Supabase persistence

1. Create a Supabase project and run `supabase/migrations/0001_init.sql`, either with `supabase db push` or in the SQL editor. Every table has row-level security restricted to the owner.
2. Enable the Google provider under Authentication > Providers.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Settings then shows **Sign in with Google**. After sign-in the planner loads from, and saves to, your account. The service-role key is not used.

### Google Calendar

1. Create a Google Cloud OAuth client (web application) with the Calendar API enabled.
2. Add the redirect URI `http(s)://<host>/api/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_TOKEN_SECRET` (any long random string).

Settings then shows **Connect Google Calendar**, then **Import events**. Busy events are only read. Study sessions are written to a separate "SyncUp" calendar, tagged so the planner only ever changes its own events.

## Status

See [`docs/BUILD_CHECKLIST.md`](docs/BUILD_CHECKLIST.md). Phases 1 to 5 are built. Not done, or not verifiable here (also in `docs/DECISIONS.md`):

- Two live rehearsals and the 90-second backup video are for the team to do.
- The live Claude call, Supabase and Google Calendar have not been run against the real services. Their logic is unit-tested with injected or fake clients, and the no-config paths are verified in the browser.
