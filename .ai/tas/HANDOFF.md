# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 lesson participant results/history (25–26) accepted; materials/tasks remain open.
**ACTIVE_BRANCH:** `tas/UI-03-server-period-preview` — [PR #65](https://github.com/Arthur200014/testing-hosting/pull/65); resume branch, not stale main.
**LAST_IMPLEMENTATION_COMMIT:** `38ace0a70ef52b63279f599aa9d2c10c4f0ddd1c`.
**NEXT_ACTION:** Review/merge PR #65 with green checks. Then inspect only source 25 and 27–29 and implement a real workspace-scoped lesson material/task attachment scenario. Inspect existing homework assignments and lesson-with-homework paths before adding links; do not infer links from matching dates. Preserve participant IDs, completion, results and retry safety. UI-03 and exact visual fidelity are not complete.

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
