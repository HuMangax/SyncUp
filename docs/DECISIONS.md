# Decisions log

Record choices made where the spec or design was ambiguous, and anything left undone. Newest first.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-07 | Students can add commitments to the simulated calendar and remove only the ones they added (`ev-user-*`); seeded/imported events stay read-only | The MVP needs "add or simulate commitments"; the planner itself still never edits calendar events |
| 2026-11-07 | Accepting a proposal highlights moved/added sessions on the calendar for 4 s ("Updated" tag + ring), off under reduced motion | Makes the reorganization visible during the demo; it is the only non-user-triggered motion |
| 2026-11-07 | Deleting, completing or editing an assignment and adding/removing a commitment all go through proposals | Consistent with rule 5; only the very first plan is applied directly |
| 2026-11-07 | Settings page uses presets (study-time windows, three session-length presets) rather than free-form windows | Simpler for students; the data model still stores arbitrary windows |
| 2026-11-07 | The scheduler uses the current plan's movable sessions as soft hints: an assignment tries its own old slots first and avoids slots other assignments hold | A from-scratch replan reshuffled unrelated assignments after one missed session. Hints only order the choice of free slots; hard limits are unchanged |
| 2026-11-07 | A session marked missed keeps its time blocked in later replans | The student said they could not use that time; otherwise the work went straight back into the same slot |
| 2026-11-07 | A superseding proposal carries the triggers of the pending ones it replaced (`prior_triggers`) | Presenter steps 4 and 5 happen before review; the Preview lists both and keeps the missed-session reason |
| 2026-11-07 | Diff pairs same-day sessions first; reasons follow the change direction (shorter = AHEAD_PACE, returned missed time = MISSED_RETURNED, longer/added = BEHIND_PACE) | Plain time-order pairing produced misleading reasons |
| 2026-11-07 | Pinning applies immediately without a proposal; marking a session done/partial/missed and progress edits record the fact immediately and propose the schedule change | Pinning moves nothing else. Facts are facts; only the schedule needs review. Reject keeps the old plan |
| 2026-11-07 | Undo restores the plan sessions (and assignment progress) from the snapshot taken at accept; settings and calendar changes are not undone | One-step undo of the plan, per the design |
| 2026-11-07 | Overloaded-day warnings are folded into one warning listing the days | Squeeze week produced 14 near-identical warnings |
| 2026-11-07 | Squeeze week = daily max 1.5 h plus Wed/Fri evening shifts for two weeks | A 2 h max still fit all work; 1.5 h makes Marketing 4.75 h short, and "raise daily max" recovers all of it |
| 2026-11-07 | "Show first open slots" suggestion not implemented | The other four what-ifs cover the demo; can add later |
| 2026-11-07 | Daily capacity is `min(max_hours - locked, free)` rather than `min(max_hours, free) - locked` | Free hours already exclude locked slots, so subtracting them again would double-count |
| 2026-11-07 | Pacing quota is at least one target-length session (`max(ceil(need / days_left), target)`) | Pure even spreading produced many 30-45 min fragments across three assignments. Front-loading leaves slack before deadlines |
| 2026-11-07 | Placement tries whole-session runs (preferred window, then any waking time) before short fragments | Otherwise leftover 30-min scraps of the evening window beat a free 90-min daytime block |
| 2026-11-07 | Calendar events block time plus a `break_min` buffer on both sides | Design says "event plus break buffer"; both sides avoids back-to-back with a class |
| 2026-11-07 | Shortage mode = rerun sorted by priority first when the deadline-first pass leaves a shortfall | Simplest way to make low priority absorb the shortfall |
| 2026-11-07 | "Difficulty 3 gets the first preferred window" is not special-cased; within a day the earliest-deadline item scans first | Kept the placement order single-keyed; revisit if the demo needs it |
| 2026-11-07 | Pinned or soon-starting scheduled sessions credit their hours against the assignment's remaining work | Otherwise a pinned session would be double-counted |
| 2026-11-07 | Demo timezone is America/Vancouver; shadcn/ui CLI skipped, primitives hand-written | Keeps setup fast and offline; the tz is only a seed default in settings |
| 2026-11-07 | Percent complete is the source of truth for remaining hours; manual hours override wins until percent is next edited | The spec's 8 h / 1 h done / 25% example is inconsistent (1 h of 8 h is 12.5%). The demo logs 2 h or types 12.5% |
| 2026-11-07 | No login in the MVP; one seeded demo user | Keeps the core loop first; real Google OAuth is stretch |
