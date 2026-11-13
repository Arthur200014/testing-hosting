# TEACHER AI STUDENT — HANDOFF

**REPO:** `Arthur200014/testing-hosting`
**STATE_UPDATED:** 2026-11-13
**CURRENT_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — 3 outcomes, not historical Mxx TODO queue
**ACTIVE_RESULT:** 1 — рабочий кабинет преподавателя
**ACTIVE_TASK:** первый результат — довести кабинет до полного повседневного использования; next gap: безопасное редактирование существующего профиля ученика из teacher UI
**ACTIVE_BRANCH:** none (PR #40 merged)
**LAST_PROGRESS_COMMIT:** `cc455d435694de598e616cc8f7a8bdac49d2347b` ([PR #40](https://github.com/Arthur200014/testing-hosting/pull/40))
**NEXT_ACTION:** Implement existing-student profile editing in teacher API+UI as part of Result 1, with focused tenant isolation / validation tests. Keep work in one coherent feature slice; avoid starting more M04-xx. No real student writes without owner authorization.
**VERIFICATION:** PR #40 three-result plan and stale data refresh [Chromium+Node PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43482385536), [backend gate PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43482385473), [PostgreSQL PASS](https://github.com/Arthur200014/testing-hosting/actions/runs/43482385655). Production effect NOT_VERIFIED; previous PR #39 checks PASS.

## Non-negotiable context
- Existing Timeweb **App Platform** deployment with private managed PostgreSQL; do not create VPS/Compose infrastructure, re-import owner-confirmed students/homework/lessons or request manual migration after code deploy.
- Owner confirmed previous import and health; no independent current production deploy check. Live student submit and teacher grade NOT_RUN by owner decision (M04-06 deferred); do not block product work. Production restore NOT_RUN, only isolated restore with separate permission/cost approval.
- **Do not change** `EGA/config/manage.html`, GAS, public URLs, live student data, secrets or old history in this branch. Switching writer to PG later requires explicit owner approval.
- Teacher UI/API source: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-report.mjs`, `platform/student.html`, `platform/src/Platform.Api/Program.cs`. Read only relevant lines/tests.
- New phase order and acceptance rules are in `RELEASE_PLAN.md`; `TASK_BOARD.md` is an archive. No extra project-management commits or microtasks. Preserve last 8 lesson report, 80/20 weights and null scores.
