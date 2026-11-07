HackCamp Project: Adaptive Academic Planner
1. Project Overview
We want to build an intelligent academic workload management web app that helps university students balance their academic responsibilities with their personal lives.
Unlike a traditional assignment tracker or calendar, our app automatically creates a realistic study schedule based on students' assignments, deadlines, existing commitments and available time.
Its biggest differentiating feature is progress-aware automatic rescheduling. When a student misses a study session, doesn't finish a task or makes less progress than expected, the system recalculates their remaining workload and adjusts their future schedule automatically.
The goal is to eliminate the stress of constantly reorganizing your schedule whenever something unexpected happens.
Core concept: A personal academic planner that adapts to your actual life, rather than forcing you to adapt your life around your assignments.
2. Target Users
University and college students who:

* Have multiple assignments, exams and deadlines.
* Struggle with time management.
* Have extracurricular activities, part-time jobs and social commitments.
* Often underestimate how long assignments will take.
* Find it difficult to reorganize their schedules when they fall behind.

3. Core Features
Feature 1: Assignment Management
Users can add assignments and academic tasks.
Each assignment should include:

* Assignment name
* Course name
* Due date and time
* Estimated total hours required
* Difficulty level or priority
* Description or assignment instructions
* Current completion percentage
* Remaining estimated hours

Users should be able to edit, delete and mark assignments as completed.
Feature 2: Smart Assignment Breakdown (AI)
Users can paste their assignment instructions or description.
AI should suggest smaller subtasks, such as:

* Research
* Planning and outlining
* First draft
* Editing
* Final review

For each subtask, AI should suggest an estimated time requirement.
Users must be able to edit these suggestions before adding them to their schedule.
AI should assist with understanding and breaking down assignments, while the scheduling algorithm should handle the actual time allocation.
this can be turned on or off depedning on the project or assignemnt
Feature 3: Google Calendar Integration
The app should connect to Google Calendar through Google OAuth.
It should:

* Import existing calendar events.
* Identify available study periods.
* Avoid scheduling over existing commitments such as classes, work shifts, appointments and social plans.
* Create study sessions directly in Google Calendar.
* Update or move study sessions when the schedule changes.

Respect existing events and do not modify or delete them.
For the initial prototype, if Google OAuth setup is not available, create a simulated calendar with sample events so the complete experience can still be demonstrated.
Feature 4: Automatic Study Scheduling
This is one of the most important features.
After users enter their assignments and availability, the system should automatically distribute their workload across their available time.
Scheduling considerations:

* Assignment deadlines
* Estimated hours required
* Assignment priority and difficulty
* Existing calendar commitments
* User's preferred study hours
* have users input their normal sleep scedule or when they want to sleep by, consistent habits to work around that
* Maximum study hours per day
* Preferred session duration
* Breaks and rest time

For example:
A student has:

* Marketing paper: 8 hours, due November 20
* Statistics midterm: 12 hours, due November 23
* Operations case: 5 hours, due November 25

The system should distribute the work across available days without overloading any single day.
Feature 5: Progress-Aware Automatic Rescheduling
This is our main differentiating feature.
The system should not simply move an unfinished calendar event to the next available time slot.
It should understand how much work remains and recalculate the student's overall workload.
Example:

1. A student has an 8-hour marketing assignment.
2. The system schedules 2 hours of research on Monday.
3. The student only completes 1 hour.
4. The student updates their progress to indicate that they are 25% complete.
5. The system recalculates the remaining workload (6 hours).
6. It automatically redistributes the remaining work across the upcoming days.
7. It protects existing commitments, such as classes, dinner plans and work shifts.

The system should:

* Allow users to mark sessions as completed, partially completed or missed.
* Allow users to update their completion percentage or remaining hours.
* Recalculate remaining workload.
* Adjust future study sessions automatically.
* Preserve assignment deadlines wherever possible.
* Notify users when a deadline is at risk.
* Avoid moving completed tasks or changing existing personal calendar events.

When a new schedule is generated, show users what changed and allow them to review and accept the updated schedule.
Feature 6: Workload Prediction and Feasibility Warnings
The system should identify when a student has more work than their available time allows.
For example:
"You have 18 hours of assignments to complete this week, but only 12 hours of available study time."
It should:

* Calculate total required study hours.
* Compare required hours with available hours.
* Identify overlapping deadlines.
* Highlight overloaded days.
* Warn students when deadlines are at risk.
* Suggest starting assignments earlier or reallocating available study time.

Do not generate unrealistic schedules just to fit everything in.
Feature 7: Personal Scheduling Preferences
Allow students to customize their schedules.
Examples:

* Preferred study hours (morning, afternoon or evening).
* Maximum study hours per day.
* Preferred study session length.
* Days they want to keep free.
* Whether they prefer longer or shorter study sessions.
* Whether they want breaks between sessions.

The scheduling algorithm should respect these preferences whenever possible.
4. Main User Interface
We want a modern, clean and intuitive design that feels like a real productivity SaaS product.
Avoid an overly complicated dashboard.
Page 1: Dashboard
Display:

* Today's study schedule.
* Upcoming assignments and deadlines.
* Overall weekly workload.
* Progress on current assignments.
* Any workload warnings.
* A quick overview of upcoming study sessions.

Page 2: Calendar
A weekly calendar view showing:

* Existing personal commitments.
* Classes and work.
* Automatically scheduled study sessions.
* Assignment deadlines.

Use different colors to distinguish personal events from study sessions.
Users should be able to see how their academic schedule fits around their existing life.
Page 3: Assignments
Display all assignments in a list or card layout.
Show:

* Course
* Assignment name
* Deadline
* Progress percentage
* Estimated remaining hours
* Priority

Allow users to add and edit assignments.
Page 4: Schedule Settings
Allow users to configure:

* Available study hours.
* Maximum daily workload.
* Preferred study times.
* Study session duration.
* Break preferences.

Page 5: Rescheduling Preview
When the system needs to adjust a schedule, display:

* What changed.
* Which sessions were moved.
* Why they were moved.
* Whether any deadlines are now at risk.

Allow users to accept the updated schedule.
5. Design Direction
We want:

* Minimalist, modern SaaS design.
* Clean typography.
* Soft neutral background colors.
* Subtle accent colors.
* Rounded cards and simple icons.
* Clear progress bars and calendar visualizations.
* Easy navigation.
* A polished desktop-first experience that also works on mobile.

Take inspiration from products like Notion, Linear, Motion and Google Calendar.
The app should feel friendly and approachable to university students, not like corporate project management software.
6. Technical Requirements
Please choose a practical tech stack that allows us to build a functional hackathon prototype quickly.
Suggested stack:

* Frontend: React / Next.js
* Styling: Tailwind CSS
* Backend/database: Supabase
* AI: Claude API for assignment breakdown and workload estimation
* Calendar: Google Calendar API
* Authentication: Google OAuth

Important technical distinction:

* Use a deterministic scheduling algorithm for allocating study sessions.
* Use AI for assignment breakdown and optional time estimates.
* Do not rely on AI alone to generate the calendar.
* Ensure existing calendar events are treated as unavailable time.
* Build the scheduling engine so it can recalculate the remaining workload when progress changes.

If Google Calendar API integration takes too long, build a realistic simulated calendar first and keep the architecture ready for integration.
7. Hackathon MVP Priorities
We have limited development time, so prioritize a working end-to-end experience over implementing every feature.
Must work:

1. Add assignments with deadlines and estimated hours.
2. Add or simulate existing calendar commitments.
3. Generate a realistic weekly study schedule.
4. Track assignment progress.
5. Automatically reschedule unfinished work.
6. Show workload warnings when there is insufficient time.

If time allows:

1. Google Calendar integration.
2. AI assignment breakdown.
3. Personalized study preferences.
4. Rescheduling preview and explanations.

8. Important Demo Scenario
We want to demonstrate the following scenario during our hackathon presentation:

1. A student adds three assignments with different deadlines.
2. The student has existing commitments in their calendar, including classes, a part-time job and dinner with friends.
3. The app generates a study schedule around these commitments.
4. The student misses a scheduled study session.
5. The student updates their assignment progress.
6. The app recognizes that the original plan is no longer realistic.
7. The app automatically reorganizes the remaining study sessions.
8. The student sees an updated calendar that still protects their personal commitments.
9. If the workload is too large to finish before the deadlines, the app clearly warns the student.

The key moment in the demo is watching the calendar intelligently reorganize itself after the student falls behind.
9. Instructions for Building
Start by creating a functional, visually polished prototype with realistic sample data.
Do not spend too much time on authentication or external API configuration before the core experience works.
First, build:

* Dashboard
* Assignment management
* Weekly calendar
* Scheduling algorithm
* Progress tracking
* Automatic rescheduling
* Workload warnings

Make sure the core interactions actually work. Buttons should not be decorative, and changing assignment progress should trigger real scheduling changes.
Please begin by proposing the architecture and then implement the application. Prioritize a polished, fully functional hackathon demo rather than an oversized product with incomplete features.
Read through this check if there is anything missing