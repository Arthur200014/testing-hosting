# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 month calendar + real persisted-teacher browser test — complete; fidelity PARTIAL.
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`5e905b0`](https://github.com/Arthur200014/testing-hosting/commit/5e905b0188042f052f9e2cad4b464fac0c98f9ca) ([merged PR #62](https://github.com/Arthur200014/testing-hosting/pull/62)).
**NEXT_ACTION:** UI-03 — calendar creation menu / choosing an existing class (`40_calendar_create`, `41_calendar_class_create`). Read only those PNGs/JSON. Header currently opens one-time planner; reuse existing class-linked planner/rule path and preserve the selected calendar date. Do not combine this with bulk period/count planning (`73–74`).
**VERIFICATION:** PASS — [Chromium + 23 Node tests + REAL API/PostgreSQL browser](https://github.com/Arthur200014/testing-hosting/actions/runs/43719730011), [PostgreSQL integration/startup/isolated restore](https://github.com/Arthur200014/testing-hosting/actions/runs/43719730029), [TAS CI](https://github.com/Arthur200014/testing-hosting/actions/runs/43719730119), source `45e5c38` merged unchanged. PASS — 16 focused local Node tests, JS/Bash syntax/diff. Reference 39 PNG/JSON and desktop/mobile captures inspected. NOT_RUN — production test-account creation or Timeweb deployment.

## Completed slice

- `platform/teacher.html`, `teacher-calendar.mjs`, `meleto-fidelity.css`: Month mode, Monday–Sunday weeks including adjacent dates, fixed-height cells with two previews and “ещё N”, day/event opening, prev/next month with clamping/year/leap handling. Actual Lessons and recurring rule slots remain distinct; browsing never generates Lessons or attendance.
- `teacher-calendar.test.mjs`, `calendar-real-browser.mjs`, `scripts/calendar-real-browser.sh`, browser workflow: two real persisted test teachers in a unique disposable Compose API/PostgreSQL. Bootstrap creates only fresh test owners; initial programs seeded in `platform` schema; HTTP creates students/classes/group/rules/lessons. Browser logs in, saves, reloads and verifies month data, no duplicate on replay, and tenant rejection. No fixture API responses in this scenario. Loopback-only endpoints, random runtime credentials, cleanup after each run.
- User requires real persistence testing with separate teachers; do not test writes against the existing production owner or their students/lessons. This rule is also in `AGENTS.md`. Existing mocked browser checks remain supplementary.
- Live TAS teacher page inspected through secure sign-in: no teacher-account administration UI/API. No owner's profile/student/lesson changes and no permanent Timeweb test accounts created. Isolated test accounts exist only during CI runs and are removed with that DB.
- No API/schema or production config changes. Fidelity PARTIAL: reference 39 grid semantics/colors verified; shared header/shell density differs. Prior Day/Week layout also partial; do not mark all UI-03 DONE.

## References and safety

References are in `.ai/tas/references/meleto/screens/` and `screen_specs.json`; only 1–2 relevant screens per task. Do not require the old Library ZIP. No live imports, GAS/Sheets writer switch or production credential changes. Green isolated CI does not verify Timeweb deployment.
