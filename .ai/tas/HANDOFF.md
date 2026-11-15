# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 calendar creation dialog / class selection (40–41) — implemented, CI pending.
**ACTIVE_BRANCH:** `tas/UI-03-calendar-create`
**LAST_IMPLEMENTATION_COMMIT:** current branch head (base `5d4362d`; month/real-account runner PR #62).
**NEXT_ACTION:** Finish browser/real API PostgreSQL checks and inspect captures 40/41; fix actual failures and merge. Next product slice: UI-03 bulk planning by period (`73_bulk_lessons_period`); count-based 74 remains separate. Do not mark all UI-03 complete.
**VERIFICATION:** PASS — JS syntax and diff checks. CI pending. Source PNGs 40/41 + JSON inspected. NOT_RUN — production writes / Timeweb deployment.

## Current slice

- `platform/teacher.html`, `meleto-fidelity.css`: reference-style scrollable calendar modal with One-time/Class tabs, active persisted individual/group class picker, title/date draft preservation, class duration/confirmed participants, dirty cancel/Escape, focus handling/inert background, local server-error alert. Shared `lessonPlannerForm` validation, idempotent mutation and existing teacher Lesson API reused. Calendar mode/date background retained. Existing class/rule full-page planner unchanged.
- Individual class schedule now shows saved Lesson titles alongside dates, matching group schedule visibility. Supported class defaults are duration and eligible participants; recording remains explicitly unavailable. No API/schema or production changes.
- `calendar-real-browser.mjs`: actual isolated test teachers (not fixture API): one-time modal, individual/group save, date/time/duration/membership links, class schedules, empty/foreign class exclusion, declined dirty cancellation, archive while form is open → visible error/no Lesson → restore/retry, clean close/no write and mobile width. Uses prior real API/PostgreSQL runner and supplementary synthetic UI checks.

## References and safety

Use `.ai/tas/references/meleto/screens/40_calendar_create.png`, `41_calendar_class_create.png` and matching JSON. Compare actual captures; no pixel-fidelity claim before inspection. Follow `AGENTS.md`: new data-backed scenarios must use dedicated real API/PostgreSQL test teachers. Never test writes against the existing production owner or their students/lessons. No live imports, GAS/Sheets writer switch or credential changes. Green isolated CI does not verify Timeweb deployment.
