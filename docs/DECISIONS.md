# Decisions log

Record choices made where the spec or design was ambiguous, and anything left undone. Newest first.

| Date | Decision | Why |
| --- | --- | --- |
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
