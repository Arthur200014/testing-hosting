# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 period planning — small READ-ONLY preview slice, CI pending.
**ACTIVE_BRANCH:** `tas/UI-03-period-preview`
**LAST_IMPLEMENTATION_COMMIT:** current branch head (base `7c49a29`, calendar class picker PR #63).
**NEXT_ACTION:** Finish real API/PostgreSQL browser CI, inspect period preview capture, merge if verified. Next small slice: server-side idempotent period-planning contract/service and focused integration tests; keep UI save/count-based 74 separate until batch semantics are verified. Preview is not a trusted deduplication/write guard.
**VERIFICATION:** PASS — 12 focused calendar Node tests, JS syntax/diff. Browser/persisted-account CI pending. Source 73 PNG/JSON inspected. NOT_RUN — bulk writes, production/Timeweb.

## Current small slice

- `platform/teacher.html`, `teacher-calendar.mjs`, `meleto-fidelity.css`: expandable “Предпросмотр занятий на период” in active persisted individual/group class schedule; from/to dates, inclusive maximum 31 days, Moscow-time read-only rule occurrences. Marks an existing linked class Lesson with exactly the same start time; no claims about overlap safety. Invalid ranges/empty periods and close/reset handled. No save button and no mutation path.
- `teacher-calendar.test.mjs`: inclusive boundaries, invalid/reversed/long ranges, inactive/foreign rules, archived class, existing-class matching, read-only behavior and exclusion of prior-day continuations. `calendar-real-browser.mjs`: persists one matching control Lesson through real HTTP, previews three slots with one saved match, validates limit, closes and compares full Lesson/Rule responses unchanged. Dedicated isolated test teachers only.
- No API/schema, production data or credential changes. Reference 73 has a complete modal/write flow; this deliberately small inline preview is PARTIAL, not completed bulk planning.

## References and safety

Source `.ai/tas/references/meleto/screens/73_bulk_lessons_period.png` + matching JSON; inspect 74 only when needed. Follow AGENTS.md: actual isolated API/PostgreSQL teachers for data-backed acceptance, mocked UI supplementary. Never write tests against existing production owner/student/lesson records. No live imports or writer switch. Green isolated CI does not verify Timeweb deployment.
