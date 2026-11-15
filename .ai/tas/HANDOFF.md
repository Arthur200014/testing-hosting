# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 week calendar — implemented, awaiting Chromium verification.
**ACTIVE_BRANCH:** `tas/UI-03-calendar-week`
**LAST_IMPLEMENTATION_COMMIT:** current branch head (base `1feb966`; day calendar merged in PR #58).
**NEXT_ACTION:** Finish this branch's Chromium CI and inspect `38_calendar_week.png` / mobile screenshot. Fix actual failures and merge once verified. Next product slice: month calendar (`39` — verify exact screen index before work); mass scheduling stays separate.
**VERIFICATION:** PASS — 13 focused local Node tests, JS syntax and diff checks. Browser CI pending; local Chromium was previously blocked by OS socket permissions. NOT_RUN — reference comparison: repeated exact-title/short-title Library searches returned zero, ZIP materialization by known ID returned 404. NOT_RUN — Timeweb production.

## Current slice

- `platform/teacher.html`, `teacher-calendar.mjs`, `meleto-fidelity.css`: Day/Week switch, Monday–Sunday grid, prev/next ±7 days, today/date selection, selected/today labels, open a day from its header, plan a single lesson for a column date. Same read-only day projection, cards and authenticated APIs; no synthetic Lessons or attendance. Mobile scrolling stays inside a focusable weekly grid.
- `teacher-calendar.test.mjs` and existing `meleto-ui-browser.mjs`: year/leap boundaries, overnight continuation, seven-day projection, reload, navigation, day switching, cancel without writes, explicit Moscow single-lesson save on Los Angeles device, mobile horizontal scroll.
- No API/schema, live data, imports or production configuration changes. Matching rules and actual lessons remain separate states. Week grid groups cards by start hour, not a duration-scaled overlap layout.

## References and safety

[`Meleto_Reference_Pack.zip`](https://chatgpt.com/library?file_id=libfile_2a4feb1037c08191997ce235ce5fd686&account_id=personal): use only screens 37–38 and matching JSON if access returns. Currently unavailable; no pixel-fidelity claim. Follow `AGENTS.md` context budget. Do not touch live students/imports, GAS/Sheets, production writer/passwords. Green CI does not verify Timeweb deployment.
