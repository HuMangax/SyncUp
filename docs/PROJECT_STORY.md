# Project Story (paste into Devpost "About the project")

Devpost's box uses Markdown, so paste this as is. Fix anything that is not true for your team before you submit. Items in **[brackets]** need your input.

---

## Inspiration

It's Sunday night. You have three assignments due this week, classes, a shift and plans with friends. You make a study schedule, and then one assignment takes longer than you expected. By Tuesday the whole plan is wrong, and rebuilding it by hand is the part that stresses you out most.

Most planners only move the unfinished block to the next free slot. They don't notice how much work is really left. We wanted a planner that adapts to your real life instead of making you adapt your life to it, and that never takes your sleep or your commitments to make the numbers work.

## What it does

RE:FLOW builds a realistic study schedule around your classes, shifts and plans, then reorganises it when you fall behind.

- **Plans around your life.** Study sessions never land on a class, a shift or a hangout, never go past your daily limit, and never cut into sleep or days off.
- **Adapts to progress.** Mark a session done, partly done or missed, or tick off a step. The planner works out how many hours are really left and proposes a new plan.
- **Shows what changed.** Every change is a proposal. The Review page slides your old week into the new one, with a short reason for each move. Nothing changes until you accept, and you can undo once.
- **Warns early.** An overload check compares the coursework due with your free study time, for example "31 h needed, 17 h free". A red warning names the assignment and the hours short.
- **Reads your syllabus.** Upload a syllabus PDF or paste the text, and it finds the deadlines for you to check and add.
- **You stay in control.** Lock a session to a time, drag a session to a new one, cancel a lecture that was called off, and undo a task you marked finished.
- **Easy to see and use.** One colour family, big boxes, a daily schedule next to your week, text size, high contrast and reduce-motion settings, full keyboard use, and a one-day calendar on phones.

## How we built it

- **App:** Next.js, React and TypeScript in strict mode, with Tailwind for styling, Zustand for state and zod to check all input.
- **Scheduler:** a plain function on a 15-minute grid with no AI and no randomness. The same input always gives the same plan, and ties break by ID. It treats sleep, days off, your daily limit and calendar events as hard limits. When work can't fit, it places what fits and reports the hours short rather than breaking a limit.
- **Rescheduling:** a progress change recalculates the remaining hours, replans around locked sessions, keeps sessions where they are when possible, and produces a before/after diff with a reason for each move.
- **AI:** used only to break an assignment into steps. It never sees the calendar and never picks a time. We use Claude, with Gemini as a second option. If neither answers, a standard template takes over.
- **Syllabus reader:** PDF text is read in the browser, so a syllabus is not uploaded anywhere. A rule-based reader then finds deadlines, including in tables that PDFs flatten into scrambled lines.
- **Calendar:** a simulated calendar works with no network. We also wrote a Google Calendar connection that only reads your events and writes study sessions to a separate calendar.
- **Tests:** 110 automated tests cover the scheduler, progress loop, warnings, syllabus reader and more.

## Challenges we ran into

- **Making rescheduling calm.** Re-running a scheduler can shuffle everything. We added a stability pass so sessions stay put unless they have to move, then show the student exactly what moved.
- **Never breaking a limit.** Squeezing work in is the easy way to fake a good plan. We made the limits hard and made the app say so when work doesn't fit.
- **Real syllabi are messy.** A real course syllabus came out of its PDF as an interleaved table with page footers full of dates. Our first version found 22 "deadlines", most of them wrong. We rebuilt the reader around the word "due" and now get the 11 real ones.
- **Time zones.** Times are stored in UTC and shown in the student's zone, so a 9:00 class stays at 9:00 across daylight-saving changes.
- **Too complicated at first.** Early feedback said the design had too many words and small boxes. We redesigned it around big boxes, shades of blue and a simple task list.

## Accomplishments that we're proud of

- A scheduler that is deterministic and tested, with no AI in the part that has to be correct.
- The Review page, where you watch your week slide into its new shape before you accept.
- Pulling the right deadlines out of a real, messy syllabus PDF.
- An overload warning that tells a student early, with real numbers and real options to fix it.
- Accessibility built in from the start, not added at the end.

## What we learned

- Keep AI out of the part that must be correct. Let it help with understanding, and let plain code do the planning.
- Show a change before applying it. People trust a plan more when they can see why it moved.
- Real data is harder than sample data. The best tests came from a real syllabus.
- Fewer words and bigger targets make an app feel easier, even when it does more.

## What's next for RE:FLOW

- Run the Google Calendar sync against live accounts and keep it up to date automatically.
- Accounts, so a plan follows you across devices.
- Better syllabus reading, including scanned PDFs and course websites.
- Reminders and a mobile app.
- Study groups that can share deadlines and find time together.

---

## "Built with" tags

Paste these as separate tags: `nextjs` `react` `typescript` `tailwindcss` `zustand` `zod` `luxon` `vitest` `pdf.js` `claude` `gemini-api` `google-calendar-api` `supabase`

Only keep `gemini-api` if Gemini actually runs, and `supabase` / `google-calendar-api` if you want to say they are built (they are written and unit tested but not connected to live accounts).

## "Try it out" links

- GitHub: `https://github.com/HuMangax/adaptive-academic-planner` (**push your latest code first**, or judges will see the old version)
- Live demo: **[add if you deploy; see `docs/DEPLOY.md`]**

## Images for the gallery (3:2 ratio, PNG, under 5 MB each)

Take these with Cmd + Shift + 4 on a Mac, after pressing "Reset demo" and "Make my plan":
1. Home with the three boxes, deadlines and the Today schedule
2. Calendar with the colours and locks
3. Review page showing old and new plan
4. Overload card
5. Syllabus results

## Video

Up to 3 minutes, as a YouTube or Vimeo link (unlisted is fine). Follow the demo script in the team doc.
