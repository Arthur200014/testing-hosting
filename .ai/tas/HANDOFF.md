# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 recurring class schedule — complete for individual and group classes; calendar remains.
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`5b91cfc`](https://github.com/Arthur200014/testing-hosting/commit/5b91cfc1600c1798a7e4151a0dd6b81732d61e87) ([PR #57](https://github.com/Arthur200014/testing-hosting/pull/57)).
**NEXT_ACTION:** UI-03 — first **calendar day** slice from `37_calendar_day` (optional `38_calendar_week` only for shared navigation behavior). In `platform/teacher.html`, show actual scheduled `Lesson` records and read-only recurring `ScheduleRule` occurrences as clearly different states, without inserting synthetic Lesson/attendance. Add prev/next/today, date selection, timezone-safe display and a link from a rule slot to the *existing* lesson planner; test synthetic Chromium after reload and tenant boundaries using current PostgreSQL APIs. Week/month calendar are later slices; do not start all three in one PR.
**VERIFICATION:** PASS — [PostgreSQL integration 43692767852](https://github.com/Arthur200014/testing-hosting/actions/runs/43692767852), [TAS CI 43692767793](https://github.com/Arthur200014/testing-hosting/actions/runs/43692767793) on `5b91cfc`; PASS — [Chromium 43692528314](https://github.com/Arthur200014/testing-hosting/actions/runs/43692528314) on `c3d0ed6` (browser source unchanged by the subsequent test-expectation fix). Reference `15_class_schedule.png` opened and visually reviewed from the Library ZIP; fidelity PARTIAL (layout not pixel-matched). NOT_RUN — production Timeweb, pixel-perfect diff, real notifications/video/payments.

## Current completed slice

- [PR #57](https://github.com/Arthur200014/testing-hosting/pull/57): `TeacherScheduleRule` persisted separately from `Lesson` with weekday bitmask, local start, duration, IANA timezone, active flag, optimistic revision, request idempotency, individual/group class linkage, composite workspace FKs, additive `20261115200000_TeacherScheduleRules` migration. Authenticated list/create/edit/disable teacher endpoints; serializable class-local active-slot collision protection (overlapping weekdays/times and mixed time zones rejected); archived/foreign classes inaccessible to mutation. `teacher.html` shows class-level recurring slots/summary and an editor with save/cancel/disable. No retroactive lesson generation, imported data changes or live data writes.
- Files: `platform/src/Platform.Api/Classes/TeacherScheduleRule.cs`, `Persistence/PlatformDbContext.cs`, `Persistence/Migrations/20261115200000_TeacherScheduleRules.cs`, EF snapshot, `Program.cs`, `platform/teacher.html`, `teacher-data.mjs`, `meleto-fidelity.css`; focused PostgreSQL and synthetic Chromium tests. Rule collisions are scoped to **one class**, not other classes or concrete Lessons; overnight recurring slots are intentionally disallowed.
- [PR #56](https://github.com/Arthur200014/testing-hosting/pull/56): single concrete Lesson planning (one-time / individual / group), class-linked lessons with title/description and participants; previous tests passed. Visual screens 07/12/13 PARTIAL.
- [PR #48–55](https://github.com/Arthur200014/testing-hosting/pull/55): individual and group classes, tenant-safe CRUD, memberships, archive and invitations (visual PARTIAL).

## References and constraints

Source: [`Meleto_Reference_Pack.zip`](https://chatgpt.com/library?file_id=libfile_2a4feb1037c08191997ce235ce5fd686&account_id=personal) (74 PNG + `screen_specs.json`); original ZIP located again in Library on 15 Nov, screen 15 inspected. Use only 1–2 PNGs and matching JSON records for next task. Follow `AGENTS.md` context budget and `.ai/CONTEXT_MAP.md`. Do not touch live students, imports, GAS/Sheets, production data/writer, passwords, or unrelated platform features. GitHub green CI is not verified Timeweb deployment.
