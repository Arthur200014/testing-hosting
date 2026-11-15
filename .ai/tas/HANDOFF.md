# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 week calendar — PR #59 merged; reference 38 follow-up (today column/current-time line) awaiting browser CI.
**ACTIVE_BRANCH:** `tas/UI-03-calendar-week-reference`
**LAST_IMPLEMENTATION_COMMIT:** [`4e1621b`](https://github.com/Arthur200014/testing-hosting/commit/4e1621b80fef57ba2c9d8dd91daf88d6f2cfbf7a) (PR #59); follow-up on current branch.
**NEXT_ACTION:** Finish reference follow-up CI and inspect desktop/mobile screenshots; then finalize HANDOFF. Next UI-03 slice: month (`39_calendar_month`), reusing shared projection; mass scheduling separate.
**VERIFICATION:** PASS — PR #59: Chromium + 20 Node tests (43716922942), TAS CI (43716922952), PostgreSQL integration/startup/isolated restore (43716922945), source `2982d6c`; 13 focused local Node tests. Desktop/mobile screenshots inspected. Follow-up browser CI pending; syntax/diff checks pass. Reference 37/38 PNGs + JSON now read from Git after concurrent reference-pack commit `1f3f35d`; fidelity PARTIAL (header/card layout and duration geometry differ). NOT_RUN — Timeweb production.

## Current slice

- `platform/teacher.html`, `teacher-calendar.mjs`, `meleto-fidelity.css`: Day/Week switch, Monday–Sunday grid, prev/next ±7 days, today/date selection, selected/today labels, open a day from its header, plan a single lesson for a column date. Same read-only day projection, cards and authenticated APIs; no synthetic Lessons or attendance. Mobile scrolling stays inside a focusable weekly grid.
- `teacher-calendar.test.mjs` and existing `meleto-ui-browser.mjs`: year/leap boundaries, overnight continuation, seven-day projection, reload, navigation, day switching, cancel without writes, explicit Moscow single-lesson save on Los Angeles device, mobile horizontal scroll.
- No API/schema, live data, imports or production configuration changes. Matching rules and actual lessons remain separate states. Week grid groups cards by start hour, not a duration-scaled overlap layout.

## References and safety

References are now in Git: `.ai/tas/references/meleto/screens/37_calendar_day.png`, `38_calendar_week.png` and matching `screen_specs.json` records. Prefer these paths; Library archive previously returned 404 and is no longer needed. Follow `AGENTS.md` context budget: only 1–2 relevant PNG/JSON records. Do not touch live students/imports, GAS/Sheets, production writer/passwords. Green CI does not verify Timeweb deployment.
