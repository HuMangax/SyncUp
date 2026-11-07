# Adaptive Academic Planner

A study planner for university students that adapts to real life. It builds a realistic study schedule around classes, work and social plans, and when a student misses a session or falls behind, it recalculates the remaining workload and proposes a new plan to review and accept.

Built for HackCamp. The differentiator is **progress-aware rescheduling**: not "move the missed event to the next slot", but "recompute how much work is left, replan everything unlocked, show what changed and why".

## Status

Pre-build. This repo currently holds the context a coding agent (or teammate) needs. The app itself is not scaffolded yet.

## Where to start

| File | Read it for |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Project rules and conventions. Read first |
| [`docs/CODING_PROMPT.md`](docs/CODING_PROMPT.md) | The prompt that kicks off the build |
| [`docs/DESIGN.md`](docs/DESIGN.md) | System design: architecture, data model, scheduler, rescheduling, feasibility |
| [`docs/SPEC.md`](docs/SPEC.md) | The original product spec (source of truth for features and demo) |
| [`docs/BUILD_CHECKLIST.md`](docs/BUILD_CHECKLIST.md) | Phased checklist with gates |
| [`.env.example`](.env.example) | Environment variables |

## Stack

Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui, Zustand, zod, Vitest, Supabase (stretch), Claude API (stretch), Google Calendar API (stretch).

## Quick start (after scaffolding)

```bash
cp .env.example .env.local
npm install
npm run dev          # demo mode, no network needed
npm test             # scheduler unit tests
```

## Demo

Run with `NEXT_PUBLIC_DEMO=1`. The demo panel can reset the data, move the clock, mark a session missed and squeeze the week to trigger the red deadline warning. The scripted run is in `docs/DESIGN.md` under "Demo mode".

## Full design doc

The longer version of the design, with diagrams, lives in the shared Claude doc: https://claude.ai/artifact/VWkWAwhfv5Ban8fDct3gYS
