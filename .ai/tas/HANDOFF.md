# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 calendar day — implemented and verified; reference fidelity unverified.
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`3fcfc03`](https://github.com/Arthur200014/testing-hosting/commit/3fcfc035e56182dfb9ba9ce5c3e81fc67c045af8) ([merged PR #58](https://github.com/Arthur200014/testing-hosting/pull/58)).
**NEXT_ACTION:** UI-03 — first **week calendar** slice (`38_calendar_week`), reusing `teacher-calendar.mjs` and existing workspace-scoped APIs. First retry Library reference access for screens 37–38; compare day fidelity if available. Do not implement month or mass scheduling in the same PR.
**VERIFICATION:** PASS — [Chromium + 18 Node tests](https://github.com/Arthur200014/testing-hosting/actions/runs/43714949526), [PostgreSQL integration/startup/isolated restore](https://github.com/Arthur200014/testing-hosting/actions/runs/43714949714), [TAS CI](https://github.com/Arthur200014/testing-hosting/actions/runs/43714949455), all on `f84db00` (source merged unchanged). PASS — 11 focused local Node tests, JS syntax and diff checks. Desktop/mobile calendar screenshots downloaded from Chromium artifact and visually inspected. NOT_RUN — PNG reference comparison, production Timeweb.

## Completed slice

- `platform/teacher.html`, `teacher-data.mjs`, new `teacher-calendar.mjs`, `meleto-fidelity.css`: day calendar with prev/next/today/date, empty/loading states, distinct saved Lesson and read-only ScheduleRule cards; current rules do not create Lessons or attendance. Display in Europe/Moscow; rule IANA zones, midnight overlaps and DST gaps/repeated hours handled. Archived/unavailable class rules hidden; actual archived-class lessons remain history. Matching rules and concrete lessons are displayed separately, without automatic reconciliation.
- Slot action opens existing individual/group planner with date/time/duration; Moscow-to-UTC save is independent of device zone. Only submit writes one Lesson. New lesson uses selected date. Existing journal/correction remains below the expandable journal.
- Existing synthetic Chromium tests extended for reload, navigation, empty day, no writes on browsing/cancel, slot duration, Los Angeles device and mobile width. Existing PostgreSQL tests verify lesson/rule reads and foreign-workspace rejection. Browser workflow includes the new module tests. No API/schema or production changes.

## Reference limitation and safety

[`Meleto_Reference_Pack.zip`](https://chatgpt.com/library?file_id=libfile_2a4feb1037c08191997ce235ce5fd686&account_id=personal) is currently unavailable: exact-title and shorter `Meleto` searches returned zero; `prepare_materialize` for that ID returned 404. No reference screenshot or JSON record inspected this turn; do not claim pixel fidelity. Prior schedule/planner PR #57/#56 remains complete (visual PARTIAL). Use only 1–2 current PNGs/JSON records if access returns. Follow `AGENTS.md` context budget; do not touch live students/imports, GAS/Sheets, production writer/passwords. Green CI does not verify Timeweb deployment.
