# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 period planning — confirmed atomic period saving implemented and accepted in isolated CI.
**ACTIVE_BRANCH:** `tas/UI-03-server-period-preview`; resume branch before starting new work.
**LAST_IMPLEMENTATION_COMMIT:** `b3b6246acae6d9fcd245b1018633cac9b46907c0` — PR #65, atomic period save, persistent retry ledger and confirmation UI.
**NEXT_ACTION:** Review final PR #65 checks and merge after acceptance. Next scenario: screen 74 count-based planning; inspect only its PNG/JSON, reuse period planner transaction/idempotency protections rather than duplicating writes. Full reference-73 modal fidelity remains PARTIAL (current period flow is inline).
**VERIFICATION:** PASS on `b3b6246` — Native homework browser `43727159201` (Chromium + real isolated API/PostgreSQL: confirm cancel, two created/one skipped, replay without duplicates), TAS task CI `43727159248` (migration/model, integration tests, runtime smoke, gate), Homework import integration `43727159177`. Snapshot mismatch found on first build was fixed. Screenshot of saved period inspected. Local inline/browser syntax and `git diff --check` PASS. NOT_RUN — production/Timeweb deployment and screen 74.

## UI-03 checkpoints

- Period saving: `TeacherPeriodPlanService.cs` + migration `20261115210000_TeacherPeriodPlans` and EF snapshot. Endpoint `POST /teacher/schedule-rules/period-plan` compares the confirmed candidate payload to a fresh preview, skips existing exact class starts, rejects workspace overlaps and stale inputs, and saves all Lesson/Participant rows + retry ledger atomically. Workspace advisory locks shared by lesson creation/correction + serializable transaction protect concurrent operations. Identical request replay returns original IDs; changed payload with same ID conflicts. No import or production writes.
- Form confirms before saving, permits safe same-request retry, refreshes lessons and marks saved slots. Integration regression covers persisted save/replay, stale request, changed request ID payload, foreign owner, overlap with zero partial writes. Real browser covers confirmation cancel, two created/one skipped, ledger replay and unchanged count on retry; screenshot `73_period_saved_real.png` inspected.

- Connected client checkpoint: class period form calls the server rather than local projection. Loading/error/retry states are explicit; closed preview/session changes discard stale results. `calendar-real-browser.mjs` awaits/asserts the real endpoint response before checking rendered rows. No batch write path.

- Server checkpoint (PR #65): `TeacherPeriodPreviewService.cs`, teacher route in `Program.cs`, `TeacherSessionTests.cs`. `POST /teacher/schedule-rules/period-preview` accepts class ID/kind and From/To; validates active ownership and 1–31 inclusive days, expands active IANA-zone rules, rejects DST ambiguity, returns linked existing Lesson IDs at identical starts. No writes/schema changes. Test covers persisted matching, one-day/31-day boundaries, invalid ranges, empty group, foreign owner and unchanged Lesson/Rule responses. Local `git diff --check` PASS; .NET unavailable locally; check CI for latest branch HEAD before merge. Previous VERIFICATION below/above describes PR #64, not this new server acceptance.

- `platform/teacher.html`, `teacher-calendar.mjs`, `meleto-fidelity.css`: expandable “Предпросмотр занятий на период” in active persisted individual/group class schedule; from/to dates, inclusive maximum 31 days, Moscow-time read-only rule occurrences. Marks an existing linked class Lesson with exactly the same start time; no claims about overlap safety. Invalid ranges/empty periods and close/reset handled. No save button and no mutation path. Scoped mobile header spacing fixes horizontal overflow.
- `teacher-calendar.test.mjs`: inclusive boundaries, invalid/reversed/long ranges, inactive/foreign rules, archived class, existing-class matching, read-only behavior and exclusion of prior-day continuations.
- `calendar-real-browser.mjs`: real HTTP persists one matching control Lesson in isolated test database, previews three slots with one saved match, validates limit, closes and compares full Lesson/Rule responses unchanged. Desktop screenshot `73_period_preview_real.png` inspected; mobile 390px overflow check passes; second teacher isolation also passes.
- Earlier read-only slice had no API/schema writes. Current checkpoint adds the explicit period-save API and retry-ledger migration. Reference 73 uses a modal; current inline flow has verified saving but modal visual fidelity remains PARTIAL.

## References and safety

Source `.ai/tas/references/meleto/screens/73_bulk_lessons_period.png` + matching JSON; inspect 74 only when needed. Follow AGENTS.md: actual isolated API/PostgreSQL teachers for data-backed acceptance, mocked UI supplementary. Protect `sharifullinartur509@gmail.com` and all existing production owner/student/lesson records. No live imports or writer switch. Green isolated CI does not verify Timeweb deployment.
