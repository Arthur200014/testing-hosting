# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** RELEASE_PENDING — publish and live-verify PR #65 before developing another feature.
**ACTIVE_BRANCH:** `tas/UI-03-server-period-preview` — [PR #65](https://github.com/Arthur200014/testing-hosting/pull/65); resume branch, not stale main.
**LAST_IMPLEMENTATION_COMMIT:** `38ace0a70ef52b63279f599aa9d2c10c4f0ddd1c`.
**NEXT_ACTION:** Finish PR #65 release first under AGENTS.md: inspect exact PR head/required checks and migrations, merge into main, verify GitHub Pages interface and Timeweb API deployment, then exercise planning + group lesson completion/results through the real site. Existing real records read-only; save/cancel/reload in an identified live test workspace only. Record MERGED_SHA, frontend/API deployment evidence and live acceptance on main. If access/deployment/test account is unavailable, fix or report the exact RELEASE_BLOCKED/LIVE_WRITE_NOT_RUN condition; do not start materials/tasks instead. After successful live acceptance, resume lesson attachments (source 25, 27–29).

## Release state
- Implementation and isolated CI are accepted; PR #65 remains open/unmerged as last observed. Latest branch code must be rechecked before merge.
- Frontend observed on main before these instruction edits: `ab21d17`; PR #65 features absent from published teacher.html. API health returned 200, running API revision UNKNOWN.
- **MERGED_SHA:** NOT_MERGED. **FRONTEND_DEPLOY:** PR #65 NOT_DEPLOYED. **API_DEPLOY:** UNKNOWN for this feature set. **LIVE_ACCEPTANCE:** NOT_RUN. These are evidence states, not successful release claims.
- This checkpoint changes instructions only; it does not merge PR #65, deploy application code or run production writes.

## Current implementation

- Period/count planning: authoritative server preview, confirmed atomic batch saving, persisted request ledger, stale/overlap checks and workspace locks shared by lesson creation/correction. Count means next 1–31 future slots within 366 days; existing linked starts count toward N and are skipped on save. Migrations: TeacherPeriodPlans (20261115210000).
- Class lesson detail/completion: nullable CompletedAt, explicit completion through existing correction API, immutable first completion timestamp, per-participant attendance and revision/replay checks. Past dates alone do not mark completion. Migration: LessonCompletion (20261115220000).
- Current result scenario: nullable Reaction/Feedback on LessonParticipant, migration LessonFeedback (20261115230000) + EF snapshot. Endpoint `POST /teacher/lessons/{lessonId}/participants/{membershipId}/result` validates workspace/participant/version and updates only that result. Successful same-payload replay is safe; stale changed payload conflicts. Attendance, topic, other participants, class links, homework and completion are preserved.
- Result dialog follows 26: selected student, optional reaction/comment, Done/cancel/close/Escape and focus containment. Three reactions positive/neutral/negative are a product choice; screenshot shows the reaction control, not its complete menu. Comment max 2000 chars, escaped on output. Timeline shows actual record creation/completion; no invented actual-start event. Recordings/boards/chat/material integrations remain unavailable; source 25 is PARTIAL.
- Changed paths: lesson model/history/revision/correction, Program.cs, DbContext + migration/snapshot, teacher.html, meleto-fidelity.css, TeacherSessionTests.cs, calendar-real-browser.mjs.

## Verification

PASS on `38ace0a`: Native homework browser `43731170568`, TAS task CI `43731170606`, Homework import integration `43731170570`. Real isolated HTTP API/PostgreSQL + Chromium verified result cancel/save/refresh, mobile fit, one participant changed/other unchanged, preserved completion/class/attendance and previous planning scenarios. Integration tests cover result validation, foreign lesson/member, stale revision and replay. Local syntax + git diff --check PASS. Source 25–26 PNG/JSON and generated screenshots `25_lesson_history_real.png` / `26_lesson_result_real.png` inspected at 1348×926. First mobile header overflow fixed. Exact pixel fidelity PARTIAL. Production/Timeweb NOT_RUN.

## References and safety

Use repo PNG/JSON under `.ai/tas/references/meleto/`, only current IDs. Follow AGENTS.md and isolated `platform/scripts/calendar-real-browser.sh`. No production owner/student/lesson test writes, password changes, board deletion, repeat imports or writer switches. Green isolated CI does not verify deployment.
