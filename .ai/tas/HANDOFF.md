# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 period planning — server read-only preview implemented; client integration and bulk saving remain open.
**ACTIVE_BRANCH:** `tas/UI-03-server-period-preview`; resume branch before starting new work.
**LAST_IMPLEMENTATION_COMMIT:** `7d3b224299f730d616c8bf9fb642f74dc082f7b9` — PR #65, server preview and persisted PostgreSQL regression.
**NEXT_ACTION:** Run/review CI for server period-preview branch, resolve failures, then wire the existing client period form to `POST /teacher/schedule-rules/period-preview` and verify through isolated real API/PostgreSQL. Server service and integration test are implemented; actual batch saving/idempotency and screen 74 remain open. Current client still calculates its own preview.
**VERIFICATION:** PASS — 12 focused calendar Node tests; complete browser workflow 25/25 Node tests + Chromium on real isolated API/PostgreSQL with dedicated test teachers; Native homework browser run 43723479404, Homework import integration 43723479335 and TAS task CI 43723479338 all successful on PR head `1557995`. Source 73 PNG/JSON and generated screenshot visually inspected. NOT_RUN — bulk writes, production/Timeweb.

## Completed small slice

- Server checkpoint (PR #65): `TeacherPeriodPreviewService.cs`, teacher route in `Program.cs`, `TeacherSessionTests.cs`. `POST /teacher/schedule-rules/period-preview` accepts class ID/kind and From/To; validates active ownership and 1–31 inclusive days, expands active IANA-zone rules, rejects DST ambiguity, returns linked existing Lesson IDs at identical starts. No writes/schema changes. Test covers persisted matching, one-day/31-day boundaries, invalid ranges, empty group, foreign owner and unchanged Lesson/Rule responses. Local `git diff --check` PASS; .NET unavailable locally; check CI for latest branch HEAD before merge. Previous VERIFICATION below/above describes PR #64, not this new server acceptance.

- `platform/teacher.html`, `teacher-calendar.mjs`, `meleto-fidelity.css`: expandable “Предпросмотр занятий на период” in active persisted individual/group class schedule; from/to dates, inclusive maximum 31 days, Moscow-time read-only rule occurrences. Marks an existing linked class Lesson with exactly the same start time; no claims about overlap safety. Invalid ranges/empty periods and close/reset handled. No save button and no mutation path. Scoped mobile header spacing fixes horizontal overflow.
- `teacher-calendar.test.mjs`: inclusive boundaries, invalid/reversed/long ranges, inactive/foreign rules, archived class, existing-class matching, read-only behavior and exclusion of prior-day continuations.
- `calendar-real-browser.mjs`: real HTTP persists one matching control Lesson in isolated test database, previews three slots with one saved match, validates limit, closes and compares full Lesson/Rule responses unchanged. Desktop screenshot `73_period_preview_real.png` inspected; mobile 390px overflow check passes; second teacher isolation also passes.
- No API/schema, production data or credential changes. Reference 73 has a complete modal/write flow; this deliberately small inline preview is PARTIAL, not completed bulk planning.

## References and safety

Source `.ai/tas/references/meleto/screens/73_bulk_lessons_period.png` + matching JSON; inspect 74 only when needed. Follow AGENTS.md: actual isolated API/PostgreSQL teachers for data-backed acceptance, mocked UI supplementary. Protect `sharifullinartur509@gmail.com` and all existing production owner/student/lesson records. No live imports or writer switch. Green isolated CI does not verify Timeweb deployment.
