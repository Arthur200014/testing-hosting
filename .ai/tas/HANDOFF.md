# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 week calendar — functional slice complete; visual fidelity PARTIAL.
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`debb956`](https://github.com/Arthur200014/testing-hosting/commit/debb956c8768aa2b9a49a3445855ac0bd879d06d) ([PR #61](https://github.com/Arthur200014/testing-hosting/pull/61)); week functionality [PR #59](https://github.com/Arthur200014/testing-hosting/pull/59), `4e1621b`.
**NEXT_ACTION:** UI-03 — first **month calendar** slice (`39_calendar_month`). Read that PNG and its JSON record directly from `.ai/tas/references/meleto/`, reuse `teacher-calendar.mjs` and existing authenticated APIs. Preserve Day/Week navigation and read-only rule/Lesson distinction. Do not add mass planning in the same PR.
**VERIFICATION:** PASS — [Chromium + 20 Node tests](https://github.com/Arthur200014/testing-hosting/actions/runs/43717867489), [PostgreSQL integration/startup/isolated restore](https://github.com/Arthur200014/testing-hosting/actions/runs/43717867469), [TAS CI](https://github.com/Arthur200014/testing-hosting/actions/runs/43717867540), source `d258f72` merged unchanged. PASS — 13 focused local Node tests, JS syntax/diff checks. Desktop 1348×926 and mobile captures inspected; source PNG 37/38 and matching JSON read. NOT_RUN — Timeweb production or real student-data scenarios.

## Completed slice

- `platform/teacher.html`, `teacher-calendar.mjs`, `meleto-fidelity.css`: Day/Week switch; Monday–Sunday grid, ±7-day navigation, today/date, selected date, opening a day and planning one Lesson for a column date through the existing planner. Current-day column and orange clock line update every minute without re-rendering or data requests. Mobile scroll stays within the focusable grid.
- Actual Lessons and read-only ScheduleRule occurrences remain distinct. Existing authenticated tenant-scoped reads and mutation path reused; no API/schema, live data, imports or production configuration changes.
- `teacher-calendar.test.mjs`, `meleto-ui-browser.mjs`: year/leap boundaries, overnight continuation, reload, no writes on navigation/cancel, day switching, chosen-date save in Moscow on a Los Angeles device, mobile scroll, clock update and absence outside today's week.
- Fidelity **PARTIAL**: whole-day highlight/time line checked against screen 38; header/card composition differs. Cards stack by start hour; rows are not a duration-scaled overlap layout. Day 37 layout also remains partial. Do not mark UI-03 fully complete.

## References and safety

References now live in Git (concurrent reference-pack commit `1f3f35d`): `.ai/tas/references/meleto/screens/` and `screen_specs.json`. Library ZIP previously returned 404, but is no longer needed. Open only 1–2 relevant PNGs and matching JSON records per task. Follow `AGENTS.md` context budget. Do not touch live students/imports, GAS/Sheets, production writer/passwords. Green CI does not verify Timeweb deployment.
