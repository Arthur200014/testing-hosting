# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 period planning — server read-only preview connected to class schedule; bulk saving remains open.
**ACTIVE_BRANCH:** `tas/UI-03-server-period-preview`; resume branch before starting new work.
**LAST_IMPLEMENTATION_COMMIT:** `e3319751be80645cce04a0d578c30d0467979621` — PR #65, server preview + async class schedule form and real browser API assertion.
**NEXT_ACTION:** Review PR #65 CI and merge after acceptance. Next implementation: period batch saving with server-side conflict/idempotency protection, scoped to the confirmed class and range; keep screen 74 count-based planning separate. Preview alone does not reserve slots or guarantee conflict-free writes.
**VERIFICATION:** PR #65 server acceptance PASS — TAS task CI `43724768550` (backend build, real PostgreSQL integration test, runtime smoke) on `7d3b224`. Connected UI acceptance PASS — Native homework browser `43725661941` and Homework import integration `43725661905` on `e331975`: Chromium + isolated real API/PostgreSQL, actual preview POST/200 returns three candidates/one saved start, 31-day rejection, class open/close, mobile overflow, unchanged full Lesson/Rule responses and second teacher isolation. Local 12 calendar tests, inline/browser syntax and `git diff --check` PASS. NOT_RUN — bulk writes and production/Timeweb.

## Completed small slice

- Connected client checkpoint: class period form calls the server rather than local projection. Loading/error/retry states are explicit; closed preview/session changes discard stale results. `calendar-real-browser.mjs` awaits/asserts the real endpoint response before checking rendered rows. No batch write path.

- Server checkpoint (PR #65): `TeacherPeriodPreviewService.cs`, teacher route in `Program.cs`, `TeacherSessionTests.cs`. `POST /teacher/schedule-rules/period-preview` accepts class ID/kind and From/To; validates active ownership and 1–31 inclusive days, expands active IANA-zone rules, rejects DST ambiguity, returns linked existing Lesson IDs at identical starts. No writes/schema changes. Test covers persisted matching, one-day/31-day boundaries, invalid ranges, empty group, foreign owner and unchanged Lesson/Rule responses. Local `git diff --check` PASS; .NET unavailable locally; check CI for latest branch HEAD before merge. Previous VERIFICATION below/above describes PR #64, not this new server acceptance.

- `platform/teacher.html`, `teacher-calendar.mjs`, `meleto-fidelity.css`: expandable “Предпросмотр занятий на период” in active persisted individual/group class schedule; from/to dates, inclusive maximum 31 days, Moscow-time read-only rule occurrences. Marks an existing linked class Lesson with exactly the same start time; no claims about overlap safety. Invalid ranges/empty periods and close/reset handled. No save button and no mutation path. Scoped mobile header spacing fixes horizontal overflow.
- `teacher-calendar.test.mjs`: inclusive boundaries, invalid/reversed/long ranges, inactive/foreign rules, archived class, existing-class matching, read-only behavior and exclusion of prior-day continuations.
- `calendar-real-browser.mjs`: real HTTP persists one matching control Lesson in isolated test database, previews three slots with one saved match, validates limit, closes and compares full Lesson/Rule responses unchanged. Desktop screenshot `73_period_preview_real.png` inspected; mobile 390px overflow check passes; second teacher isolation also passes.
- No API/schema, production data or credential changes. Reference 73 has a complete modal/write flow; this deliberately small inline preview is PARTIAL, not completed bulk planning.

## References and safety

Source `.ai/tas/references/meleto/screens/73_bulk_lessons_period.png` + matching JSON; inspect 74 only when needed. Follow AGENTS.md: actual isolated API/PostgreSQL teachers for data-backed acceptance, mocked UI supplementary. Protect `sharifullinartur509@gmail.com` and all existing production owner/student/lesson records. No live imports or writer switch. Green isolated CI does not verify Timeweb deployment.
