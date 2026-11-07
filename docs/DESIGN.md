# System Design: Adaptive Academic Planner

A Next.js app where a deterministic TypeScript scheduler places every study session, Claude only breaks assignments into subtasks, and a progress update recomputes remaining work and proposes a reviewable new plan. The MVP runs on a simulated calendar with seeded data and a demo control panel. Google Calendar and live AI sit behind interfaces.

Full version with diagrams: https://claude.ai/artifact/VWkWAwhfv5Ban8fDct3gYS

## 1. Scope and decisions

| Tier | What ships |
| --- | --- |
| MVP | Assignments CRUD, simulated calendar with recurring events, deterministic scheduler, session and progress tracking, rescheduling proposal with diff, feasibility warnings. Pages: Dashboard, Calendar, Assignments, Settings, Preview |
| MVP+ | Demo panel, reset, simulated clock, one-step undo, session pinning, deadline-risk banner |
| Stretch | Live Claude breakdown, Google OAuth + Calendar sync, Supabase persistence, mobile day view polish |

| Decision | Choice |
| --- | --- |
| Auth | One seeded demo user, no login in MVP |
| Rescheduling trigger | Every progress update or missed-session mark builds a proposal. Never auto-applied |
| Ignore or reject a proposal | Current plan stays. Reject discards. Unreviewed proposals show a banner |
| Manual control | Any session can be pinned. Pinned = fixed commitment |
| Priority vs difficulty | Both 1 to 3. Difficulty pads estimates and prefers peak hours. Priority orders work under shortage |
| Exams | Type is assignment, project or exam. Exams get spaced sessions |
| Deadlines | Markers on the calendar at due time. Not written to Google |
| Subtasks | Ordered, share parent deadline, progress per subtask when a breakdown exists |
| Notifications | In-app banner and dashboard warnings only |
| Sleep | Bedtime, wake time, wind-down: a hard blocked window |
| AI toggle | Global default in Settings, per-assignment override |

## 2. Architecture

```
Browser: React UI + Zustand store (plan, proposals, undo snapshots, simulated clock)
   |-- schedule(state, now) --> lib/  (pure TS, no I/O)
   |                               scheduler/  progress/  feasibility/
   '-- events, plans, breakdown --> Adapters (swappable)
                                    CalendarProvider: simulated (MVP) | Google
                                    Claude breakdown route: server-side key + template fallback
                                    Repo: local store (demo) | Supabase Postgres
```

The scheduler only receives busy intervals as input. It never calls Google, Claude or the database. In demo mode the UI calls `lib/` directly against a local store; in Supabase mode route handlers call the same functions.

## 3. Data model

All timestamps UTC `timestamptz`. The user's IANA zone lives on `user_settings`.

| Entity | Key fields | Rules |
| --- | --- | --- |
| `user_settings` | `timezone`, `wake_time`, `bed_time`, `wind_down_min`, `preferred_windows[]`, `max_hours_per_day`, `session_min/target/max`, `break_min`, `free_days[]`, `ai_default` | Sleep window and free days are hard. Preferred windows are soft |
| `assignment` | `title`, `course`, `type` (assignment, project, exam), `due_at`, `estimate_hours`, `difficulty` 1-3, `priority` 1-3, `description`, `percent_complete`, `remaining_hours`, `remaining_override`, `ai_breakdown`, `status` (active, completed, at_risk) | `remaining_hours` derived. Override wins when set |
| `subtask` | `assignment_id`, `title`, `order_idx`, `estimate_hours`, `percent_complete`, `source` (ai, template, manual) | Later subtasks cannot be scheduled before earlier ones finish |
| `calendar_event` | `source` (simulated, google), `external_id`, `title`, `start_at`, `end_at`, `rrule`, `kind` (class, work, social, other), `read_only` | Always read-only. Recurring events expanded per planning window |
| `study_session` | `assignment_id`, `subtask_id`, `start_at`, `end_at`, `status` (scheduled, completed, partial, missed, cancelled), `minutes_done`, `pinned`, `plan_version`, `google_event_id` | Only future `scheduled` rows are ever moved |
| `schedule_proposal` | `created_at`, `trigger`, `base_version`, `new_sessions[]`, `diff[]`, `risk[]`, `state` (pending, accepted, rejected, superseded) | Diff has one entry per session: kept, moved, added, removed, with reason code |
| `warning` | `kind` (shortfall, overloaded_day, deadline_risk, overlap), `assignment_id?`, `day?`, `hours_short`, `message`, `suggestions[]` | Recomputed every plan or proposal |
| `plan_snapshot` | `version`, `sessions[]`, `created_at` | One per accepted proposal. Powers undo |

## 4. Scheduling engine

`schedule(state, now) -> Plan = { sessions[], unplaced: Record<assignmentId, hours>, loadByDay[], warnings[] }`

### Defaults

| Parameter | Default |
| --- | --- |
| Slot size | 15 min |
| Horizon | `now` to latest due date, max 28 days |
| Session min / target / max | 30 / 90 / 120 min ("prefer longer": 60 / 120 / 180) |
| Break after each session | 15 min, reserved |
| Deadline lead time | 3 h assignment, 6 h project, 12 h exam |
| Difficulty padding | x1.0 / x1.1 / x1.2 on remaining hours for difficulty 1 / 2 / 3 |
| Max hours per day | 6 |
| Exam cap | 3 h per exam per day; 3+ distinct days when the exam needs 6 h or more |

### Step 1: free-slot grid

Mark a slot unavailable if: before `now` (rounded up); in the sleep window (`bed_time - wind_down` to `wake_time`, may cross midnight); overlaps an expanded calendar event plus break buffer; on a free day; or belongs to a locked or pinned session.

### Step 2: pace the work

```
for each day d in horizon:
  cap = min(max_hours_per_day, free_hours(d)) - locked hours on d
  active = items with unplaced > 0 and effective_deadline > start(d)
  sort active by (effective_deadline asc, priority desc, difficulty desc, id asc)
  for item in active:
    days_left = eligible days from d to effective_deadline (free and zero-capacity days excluded)
    quota = round_up_to_slot(unplaced[item] / days_left)
    quota = min(quota, exam_cap if exam else cap)
    take = min(quota, cap); place(item, take, d)
    cap -= placed; unplaced[item] -= placed
after last day: leftover unplaced = shortfall
```

### Step 3: place sessions in a day

- Pass A uses only preferred windows; pass B uses other waking hours for the part that did not fit. Difficulty 3 gets the first preferred window.
- Split into sessions near the target length. A remainder under the minimum merges into the previous session if it stays under the max, else moves to the next day.
- Reserve break slots after each session.
- Subtasks form a queue consumed in `order_idx` order.

### Determinism

Same state and `now` give the same plan. Stable sort with `id` as the last key, integer slot indexes, `now` as an argument.

## 5. Progress and rescheduling

```
remaining_hours = remaining_override                       if set
                = estimate_hours * (1 - percent_complete)  otherwise
```

- Percent is the primary input. Logging a session prefills percent from minutes done; the student can edit. Manual "hours remaining" sets `remaining_override` until percent is next edited.
- Missed: full hours return to the pool, percent unchanged. Partial: minutes done count as progress.
- With subtasks, assignment percent = hours-weighted average of subtask percents.
- Spec example note: 1 h done of 8 h is 12.5%, not 25%. The design follows the number the student types. The demo should log 2 h (25%, 6 h left) or type 12.5%.

| Session state | Movable? |
| --- | --- |
| Past, completed, partial | No (locked, counts as done) |
| Starting within 2 hours or in progress | No |
| Pinned | No |
| Scheduled, further out | Yes |
| Calendar events | Never |

Pipeline: trigger -> recompute remaining -> replan with locked sessions occupied -> stabilize (snap a session back to its previous slot if still valid and quota matches) -> diff (kept, moved, added, removed + reason codes) -> risk per deadline (on track, tight under 10% slack, at risk) -> save `schedule_proposal` -> Preview page -> accept (write sessions, snapshot, sync changed sessions to calendar) or reject. Undo restores the last snapshot. A new trigger while a proposal is pending supersedes it and rebuilds from the current accepted plan.

Reason codes: `MISSED_RETURNED`, `BEHIND_PACE`, `AHEAD_PACE`, `CONFLICT`, `DEADLINE_PROTECTION`, `REBALANCE`.

## 6. Feasibility and warnings

For each deadline in order: `required_i` = sum of padded remaining hours due at or before i; `capacity_i` = sum over days up to its effective deadline of `min(max_hours, free_hours) - locked`; `shortfall_i = max(0, required_i - capacity_i)`.

| Kind | Trigger | Severity |
| --- | --- | --- |
| `deadline_risk` | `shortfall_i > 0` | Red |
| `tight` | Slack under 10% | Yellow |
| `overlap` | 2+ deadlines within 48 h | Yellow |
| `overloaded_day` | Day planned at 90%+ of daily max | Yellow |
| `shortfall_week` | Required exceeds available over next 7 days | Red or yellow |

When it does not fit: hard limits stay hard; shortage mode hands scarce capacity out by priority then deadline; place what fits and store `hours_short`; mark the assignment `at_risk`.

Suggestions are what-if runs of the same scheduler, each reporting "would recover X of Y hours": raise daily max by 1 h, open the earliest free day, allow sessions up to 180 min, show first open slots before the earliest deadline, trim scope on the lowest-priority item.

## 7. Calendar layer

```ts
interface CalendarProvider {
  listEvents(range: { from: Date; to: Date }): Promise<CalendarEvent[]>  // read-only, expanded
  upsertSession(s: StudySession): Promise<{ externalId: string }>        // our events only
  removeSession(externalId: string): Promise<void>                       // our events only
}
```

- Simulated (MVP): events from `seed.ts`, weekly recurrence expanded by local wall-clock time then converted to UTC, so a 9:00 class stays 9:00 across DST.
- Google (stretch): sessions go into a dedicated "Study Planner" calendar. Tag with `extendedProperties.private.plannerSession = "1"` plus `sessionId`; only modify tagged events. Scopes `calendar.events`, `calendar.readonly`. Sync token per calendar. Refresh token stored server-side only.
- Import: only busy events block time. All-day events show but do not block unless marked. Exclude our own events from the busy list.
- If Google is unreachable: use cached events, show "may be out of date". A failed sync marks sessions "not synced" and retries; it never blocks accepting a plan.
- Event details never go to the AI.

## 8. AI breakdown

`POST /api/breakdown` (server holds the key). Request `{ title, course, type, description (max 8000 chars), estimateHours? }`. Response (zod-validated) `{ subtasks: { title, description, estimateHours, order }[], assumptions: string[], source: "ai" | "template" | "cache" }`.

Validation: 3 to 8 subtasks; 0.5 to 6 h each in 0.5 steps (clamp); total within 25% of the student's estimate or scaled and flagged; unknown keys dropped; 8 s timeout and one retry with the validation error, then fallback; per-IP rate limit.

Fallback template: assignment or project = Research 25%, Outline 10%, First draft 35%, Editing 20%, Final review 10%. Exam = Review notes 25%, Practice problems 40%, Weak topics 20%, Mock exam 15%. Pre-cached results for the three demo assignments.

The student edits the table, then presses "Add to plan". Only then are subtasks saved and the scheduler run. AI estimates are hints only. Model from `ANTHROPIC_MODEL`.

## 9. Pages and components

| Page | Shows | Interactions |
| --- | --- | --- |
| Dashboard | Today's sessions, deadlines, weekly workload meter, progress bars, warnings, next 3 sessions | Mark session done/partial/missed, open pending proposal |
| Calendar | Week grid: personal events, classes, work, study sessions, deadline markers, overloaded-day highlight | Click session to complete/partial/miss/pin, edit simulated events |
| Assignments | Cards: course, deadline, progress, remaining hours, priority, risk chip | Add/edit sheet, delete, complete, set percent or remaining hours, AI toggle |
| Settings | Study windows, max hours, session length, breaks, free days, bedtime, wake, wind-down, AI default | Save re-runs the scheduler and opens a proposal |
| Rescheduling Preview | Before/after week, kept/moved/added/removed with reasons, risk per assignment | Accept, Reject, Undo |

Components: SessionCard, WeekGrid (custom CSS grid, 15-minute rows, no calendar library), ProgressSlider, ProposalDiff, RiskBanner, DemoPanel (only when `NEXT_PUBLIC_DEMO=1`).

Visual direction: background `#FAF9F7`, white cards with 12 to 16 px radius, Inter, one indigo accent, subtle shadows. Friendly, short sentences.

| Element | Color | Non-color cue |
| --- | --- | --- |
| Study session | Indigo fill | Pencil icon, solid edge |
| Class | Slate | Book icon, hatched |
| Work | Amber | Briefcase icon, hatched |
| Social/other | Rose | Heart icon, hatched |
| Deadline | Red | Flag icon + line across the day |
| Pinned | Indigo | Pin icon |

Below 768 px the week grid becomes a single-day view with a swipeable date strip.

## 10. Code layout

```
app/(app)/dashboard | calendar | assignments | settings | preview
app/api/breakdown/route.ts
app/api/proposals/route.ts   app/api/proposals/[id]/accept|reject/route.ts
app/api/undo/route.ts        app/api/calendar/route.ts   app/api/auth/google/...
lib/types.ts
lib/time/slots.ts            # 15-min grid, UTC <-> local, DST-safe
lib/calendar/provider.ts  simulated.ts  google.ts
lib/scheduler/availability.ts  pace.ts  place.ts  index.ts
lib/progress/remaining.ts  diff.ts
lib/feasibility/check.ts
lib/ai/breakdown.ts
lib/demo/seed.ts  controls.ts
store/                       # Zustand
tests/                       # Vitest
```

| Route | Input | Output |
| --- | --- | --- |
| `POST /api/breakdown` | Assignment text and type | Validated subtasks or fallback |
| `POST /api/proposals` | A progress change | Pending proposal with diff and risk |
| `POST /api/proposals/:id/accept` | none | New plan, snapshot, calendar sync result |
| `POST /api/proposals/:id/reject` | none | Proposal rejected, plan unchanged |
| `POST /api/undo` | none | Previous snapshot restored |
| `GET /api/calendar` | Date range | Expanded busy events |

With real auth later, every table carries `user_id` and Supabase RLS restricts to the owner.

## 11. Demo mode

Seed dates are offsets from a demo anchor (the coming Monday 08:00 in the user's zone). The simulated clock starts at the anchor.

| Item | Seed |
| --- | --- |
| Classes | Marketing lecture Mon/Wed/Fri 09:00-10:30. Statistics lecture Tue/Thu 13:00-14:30. Operations seminar Wed 14:00-15:30 |
| Job | Tue 17:00-21:00, Sat 10:00-16:00 |
| Social | Dinner Thu 18:30-20:30 |
| Assignments | Marketing paper 8 h (difficulty 2, priority 2). Statistics midterm 12 h (difficulty 3, priority 3, exam). Operations case 5 h (difficulty 2, priority 1) |
| Deadlines | Roughly two weeks, same order as the spec (Nov 20, 23, 25), as offsets from the anchor |
| Preferences | Sleep 23:30-07:30, 30 min wind-down, max 6 h/day, evenings preferred, Sundays free, 90-minute sessions, 15-minute breaks |

Tune offsets so the opening plan has slack and "Squeeze week" turns it red; a unit test locks both.

Demo panel: Reset demo, Advance clock, Mark next session missed, Log 1 h on Marketing and set 25%, Surprise shift (6 h work event Thursday), Squeeze week (lower daily max, add shifts), Export/import state JSON. These call the same functions as the UI; no demo-only scheduling behavior.

Presenter script: (1) show the three assignments, (2) open Calendar with classes, job, dinner, (3) Generate plan, (4) mark Monday's session missed, (5) set Marketing to 25%, (6) open Preview with reasons, (7) Accept, (8) Squeeze week for the red warning, (9) click a suggestion to see hours recovered.

Offline plan: run the production build locally, record a 90-second backup video, rehearse twice with Reset.

## 12. Tests (Vitest)

Scheduler: no overlap with events/breaks/pinned; deadlines respected; daily limit; sleep window (including across midnight) and free days; minimum session length; determinism; subtask order; exam spacing. Progress: 8 h at 25% gives 6 h, override wins; missed returns full hours, partial credits minutes. Rescheduling: locked sessions identical before and after; no-op change yields all kept; accept then undo restores exactly. Feasibility: infeasible case has positive `hours_short`, no hard limit broken, low priority absorbs shortfall. Calendar: 9:00 class stays 9:00 across Nov 1, 2026 and Mar 14, 2027. AI: invalid JSON, timeout or out-of-range hours give the template. Demo: opening plan has no deadline risk; Squeeze week produces a red warning. Performance: 20 assignments over 28 days under 200 ms.

## 13. Build order

1. Foundation: types, seed, simulated calendar, app shell. Gate: seeded week renders on Calendar.
2. Scheduler core: slot grid, pacing, placement, tests. Gate: no overlaps, deadlines met, same output every run.
3. Progress loop: remaining hours, proposal, diff, accept, undo, feasibility. Gate: presenter steps 1 to 9 run end to end.
4. Demo polish: warnings UI, DemoPanel, Preview page, mobile day view. Gate: rehearsed twice with Reset, backup video.
5. Stretch (only after gate 4): live AI breakdown, Supabase, Google Calendar.

Cut from the bottom if short: Google sync, Supabase, live Claude call, mobile day view, pinning and workload meter. Never cut: scheduler tests, proposal diff with reasons, red warning, Reset demo, backup video.
