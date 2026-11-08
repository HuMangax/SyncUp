# Devpost submission draft

Paste-ready text for the HackCamp 2026 submission. Items in **[brackets]** need your input.

## One line

An academic planner that fits study time around your life, then reorganises itself when you fall behind.

## Problem statement (for Best Problem-Solution Fit)

Students juggle assignments, exams, classes, jobs and friends. They build a study schedule, then one assignment takes longer than planned and the whole week falls apart. Existing planners just push the unfinished block to the next free slot. They do not notice how much work is really left, so students either rebuild their schedule by hand every week or stop using it. Rebuilding the plan is the stress we set out to remove.

## Solution

Adaptive Academic Planner builds a realistic study schedule around a student's classes, shifts and plans, then adapts it as they make progress.

- **Fits around your life.** Study sessions never touch a class, a shift or a hangout, never go past your daily limit and never land on sleep or days off.
- **Adapts to progress.** Mark a session done, partial or missed, or tick off a step. The planner recalculates the hours that are really left and proposes a new plan.
- **Shows its work.** Every change is a proposal. The Review page slides the old week into the new one, so you see what moved and why. Nothing changes until you accept, and you can undo once.
- **Warns early.** An overload detector compares the coursework due with the free study time and says so before the student falls behind. A red warning names the assignment and the hours short.
- **Starts from your syllabus.** Upload a syllabus PDF and the planner pulls out the deadlines for you to check.
- **You stay in control.** Lock a session to a time, drag it elsewhere, or cancel a lecture that was called off.

The scheduler is deterministic and has no AI in it, so the same inputs always give the same plan. AI only breaks an assignment into steps (Claude, with Gemini as a backup, and a template if both are unavailable). It never sees the calendar and never chooses a time.

## Impact statement (for Community Impact)

Poor time management is a quiet cause of stress, lost sleep and dropped courses, and it hits hardest for students who work, care for family or commute. This planner treats those commitments as fixed and sleep as a limit, not a leftover. It gives students a clear, honest answer to "can I actually finish this?" early enough to act, such as asking for an extension or trimming scope, instead of finding out the night before. It runs without an account or a network, so any student can try it.

**[Add one real quote or anecdote from a classmate who tried it, if you have one.]**

## Accessibility (for Most Accessible Design and Best Design)

Describe these in the submission, and link the Figma file.

- Every calendar block has an icon and a label as well as a colour: study, class, work, hangout, event, deadline, and locked or movable.
- Fully keyboard operable, with a skip link and visible focus.
- Progress bars, meters and switches have names and values. Warnings are announced to screen readers.
- Display settings: text size up to 133%, high contrast, and reduce motion (the device setting is respected by default).
- Works at phone width, with a single-day calendar and a bottom menu.
- Plain, short wording; the same word for the same action everywhere.
- In-app statement: `/accessibility`.

**Not done yet, so do not claim it:** an automated audit (axe or Lighthouse) and a real screen-reader pass. Run both before submitting and mention the results honestly.

## Prize opt-in checklist

**Submission rules (from the guide): a team can opt in to ONE superlative prize at most, and to zero or all sponsor prizes.** Superlatives are the ones tagged "Superlative": Most Accessible Design, Best Problem-Solution Fit, Best Design, Best Hardware, Community Impact. Overall Winner and nwChoice are automatic and do not count. MLH and sponsor prizes (Gemini and the rest) are separate and unlimited.

**Recommended pick for a beginner team with no Figma file: Best Problem-Solution Fit.** It needs only the problem and solution text below. Choose Most Accessible Design or Best Design only if you finish a Figma file; the table below still lists every option, but you can only tick one superlative.

| Prize | Opt in? | What the submission must include |
|---|---|---|
| Overall Winner, nwChoice | Automatic | Nothing extra |
| Beginner Overall Winner | Only if your team is in the Beginner stream | Nothing extra |
| Most Accessible Design (Beginner only) | **[Beginner team?]** | Figma link, accessibility description (section above) |
| Best Problem-Solution Fit (Beginner only) | **[Beginner team?]** | Problem statement and solution description (sections above) |
| Best Design | Yes | **[Figma link]** |
| Community Impact | Yes | Impact statement (section above) |
| Best Use of Gemini API (MLH) | Yes, once `GEMINI_API_KEY` is set and a breakdown has run through it | Say where Gemini is used: assignment breakdown, as the main or backup model |
| Best Domain Name from GoDaddy Registry | If you register one | The domain name; see `docs/DEPLOY.md` |
| Vultr | If you host the demo there | Where it is deployed; see `docs/DEPLOY.md` |

Not a fit, so skip: Hardware, Solana, Databricks, Maritime, Lovable, Tiger Data, Auth0. Check Freebuff, Entire, DeepSpace and n8n on the Devpost page before deciding; none of them is used today.

## Demo script

Follow the three-minute plan in the team doc (Slides tab). The key moment: mark a session missed, watch the Review page slide the week into its new shape, accept, and see the calendar update with every personal commitment untouched.

## Be honest about

- Google Calendar sync is built and unit tested but has not been run against a live Google account. Say "simulated calendar in the demo" unless you test it.
- The Gemini and Claude calls are tested with fakes, not live keys, unless you run them first.
