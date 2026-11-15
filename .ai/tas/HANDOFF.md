# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 calendar day — implementation ready; awaiting isolated CI/browser verification.
**ACTIVE_BRANCH:** `tas/UI-03-calendar-day`
**LAST_IMPLEMENTATION_COMMIT:** current branch head (base `1b353da`, previous schedule PR #57).
**NEXT_ACTION:** Finish this branch's Chromium and PostgreSQL CI, fix actual failures and inspect `37_calendar_day.png`; then merge if verified. Next product slice: week calendar (`38_calendar_week`), reusing day projections and current APIs; month later.
**VERIFICATION:** PASS — 11 focused Node tests (calendar/date boundaries, cross-zone and midnight projection, DST gaps/repeated hours, read-only separation, teacher cache). PASS — JS syntax and diff whitespace. Chromium local launch blocked by OS `socket()` permission; CI pending. Reference NOT_RUN: Library exact-title and shorter-title searches returned zero; `prepare_materialize` for `libfile_2a4feb1037c08191997ce235ce5fd686` returned 404. No PNG comparison claimed. NOT_RUN — Timeweb production.

## Current slice

- Day calendar uses existing authenticated `teacher/lessons`, `teacher/schedule-rules`, classes/groups reads. Real Lessons and read-only recurring slots have different cards; browsing never creates Lessons or attendance. Prev/next/today/date, empty/loading states, Moscow display, IANA rule conversion and midnight overlaps. Archived/inaccessible class rules excluded. Matching actual lessons and rules remain separate, not automatically reconciled.
- Rule action opens existing individual/group planner, prefills date/time/duration in explicit Moscow zone even on a differently zoned device; only submitting creates one Lesson. New lesson uses selected calendar date. Existing journal/correction remains under expandable section.
- Paths: `platform/teacher.html`, `teacher-data.mjs`, new `teacher-calendar.mjs` and focused tests, `meleto-fidelity.css`, existing synthetic browser tests and browser workflow. No API/schema/production changes.
- Browser regression extends existing Meleto fixture: reload, navigation/empty day, separate rule and lesson cards, no writes on browsing/cancel, Moscow-to-UTC save with Los Angeles device, mobile width. Existing PostgreSQL tests cover both API reads and foreign-workspace rejection: `RecurringRulesPersistWithoutLessonsAndEnforceTenantConflictsAndRevision`, `ScheduledLessonLinksOneClassAndRespectsMembersTenantAndIdempotency`.

## References and constraints

[`Meleto_Reference_Pack.zip`](https://chatgpt.com/library?file_id=libfile_2a4feb1037c08191997ce235ce5fd686&account_id=personal): use only `37_calendar_day` (optional `38_calendar_week`) and matching JSON. Currently unavailable through Library; visual fidelity remains unverified. Prior class schedule/planner implementation is on main (PR #57/#56), visual PARTIAL. Follow `AGENTS.md` context budget. Do not touch live students/imports, GAS/Sheets, production writer/passwords. Green GitHub CI does not verify Timeweb deployment.
