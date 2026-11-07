# Decisions log

Record choices made where the spec or design was ambiguous, and anything left undone. Newest first.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-07 | Phase 1 seeds 4 placeholder study sessions (`placeholderSessions`) so the Calendar shows the study style before the scheduler exists | Remove in phase 2 when `schedule()` generates the opening plan |
| 2026-11-07 | Demo timezone is America/Vancouver; shadcn/ui CLI skipped, primitives hand-written | Keeps setup fast and offline; the tz is only a seed default in settings |
| 2026-11-07 | Percent complete is the source of truth for remaining hours; manual hours override wins until percent is next edited | The spec's 8 h / 1 h done / 25% example is inconsistent (1 h of 8 h is 12.5%). The demo logs 2 h or types 12.5% |
| 2026-11-07 | No login in the MVP; one seeded demo user | Keeps the core loop first; real Google OAuth is stretch |
