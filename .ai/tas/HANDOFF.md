# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 calendar creation / class selection (40–41) — functional slice complete; fidelity PARTIAL.
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`2e1d92a`](https://github.com/Arthur200014/testing-hosting/commit/2e1d92a4f3e9741faaf1d2ab60e96d9ffb7c64dd) ([merged PR #63](https://github.com/Arthur200014/testing-hosting/pull/63)).
**NEXT_ACTION:** UI-03 — first **bulk planning by period** slice (`73_bulk_lessons_period`). Read that PNG/JSON; use 74 only if needed for shared form behavior, count-based creation later. Inspect existing Lesson writer/idempotency and ScheduleRule semantics before adding the smallest compatible authenticated batch flow. Must prevent duplicate Lessons on replay, enforce workspace/class/participant access, preserve existing history, and verify with real isolated API/PostgreSQL teachers.
**VERIFICATION:** PASS — [Chromium + 23 Node tests + REAL API/PostgreSQL browser](https://github.com/Arthur200014/testing-hosting/actions/runs/43721802031), [PostgreSQL integration/startup/isolated restore](https://github.com/Arthur200014/testing-hosting/actions/runs/43721802018), [TAS CI](https://github.com/Arthur200014/testing-hosting/actions/runs/43721802041), source `fa06661` merged unchanged. JS syntax/diff pass. Source PNGs 40/41 + JSON and actual desktop/mobile captures inspected. NOT_RUN — production writes / Timeweb deployment.

## Completed slice

- `platform/teacher.html`, `meleto-fidelity.css`: scrollable calendar modal with One-time/Class tabs, active own persisted individual/group picker, title/date draft preservation, class duration and confirmed participants, dirty cancel/Escape, focus/inert background, server-error alert scrolled into view. Reuses `lessonPlannerForm` validation/idempotent mutation and existing teacher APIs. Calendar date/mode retained; existing class/rule full-page planner preserved. Individual class schedule now includes Lesson titles.
- `calendar-real-browser.mjs`: actual isolated test teachers/API/PostgreSQL verify one-time/individual/group saves, initial date and duration/member defaults, class schedules, empty/foreign class exclusion, declined dirty cancellation, archive while open → error/no Lesson → restore/retry, clean close/no write and mobile width. `meleto-ui-browser.mjs` supplementary selector updated for shared modal/full-page description.
- No API/schema or production config changes; existing owner, student and lesson data never used as test-write targets. Dedicated test accounts/data are created and cleaned in isolated runs.
- Fidelity PARTIAL: modal structure compared with 40/41; typography/spacing/native input appearance differ. Recording remains explicitly unavailable; only supported class defaults (duration/eligible participants) are applied. Do not mark all UI-03 complete.

## References and safety

Use `.ai/tas/references/meleto/screens/` and matching `screen_specs.json`, only 1–2 relevant screens. Follow `AGENTS.md`: data-backed UI acceptance includes dedicated real API/PostgreSQL test teachers, mocked checks are supplementary. No production owner/student test writes, live imports, GAS/Sheets writer switch or credential changes. Green isolated CI does not verify Timeweb deployment.
