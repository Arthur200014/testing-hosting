# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-02 classes (individual + groups, settings, edit/archive, teacher/student invites) — functional package completed; screenshot fidelity PARTIAL.
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`d117a75`](https://github.com/Arthur200014/testing-hosting/commit/d117a750928c2e74145261645c226e33a836b9d4), [PR #55](https://github.com/Arthur200014/testing-hosting/pull/55) merged.
**NEXT_ACTION:** UI-03 — связанный пользовательский сценарий расписания/занятия по оригинальным PNG `07–08`, `11–15` (начать с 2–3 конкретных экранов и их JSON specs): **различать постоянное правило расписания и экземпляр занятия**, обеспечить безопасное создание разового урока для одного/нескольких существующих участников и привязку конкретного занятия к индивидуальному или групповому классу, сохраняя existing pair-lesson participation. После определения точных экранов — API/UI/синтетические PostgreSQL и Chromium regression, один связанный PR, не трогать production. Не добавлять фальшивые записи уроков, оплаты, чаты или записанные видео. В рамках UI-03 отдельно планировать календарь день/неделя/месяц, не пытаться весь этап одним бесконечным PR.
**VERIFICATION:** PASS — [browser 43659602664](https://github.com/Arthur200014/testing-hosting/actions/runs/43659602664), [PostgreSQL integration 43659602661](https://github.com/Arthur200014/testing-hosting/actions/runs/43659602661), [TAS task CI 43659602682](https://github.com/Arthur200014/testing-hosting/actions/runs/43659602682), on head `be1e50a` before squash-merge. Synthetic group scenario: select two students, prevent duplicates, add/remove/edit roster, capacity 3, manual approval toggle, archive/restore (with confirm), one-time secret code/reload, student accept; backend: idempotency, tenant isolation, invalid members/capacity, stale revision, pending approvals, revoke. Screenshots `05_group_create_top.png`, `06_group_create_bottom.png` manually inspected against original Meleto PNG. NOT_RUN: production Timeweb, pixel-perfect comparison or real email invitations.

## Reference material

Original [`Meleto_Reference_Pack.zip`](https://chatgpt.com/library?file_id=libfile_2a4feb1037c08191997ce235ce5fd686&account_id=personal) is in ChatGPT Library (74 PNGs, `screen_specs.json`); no need to ask user to re-upload. Materialize only next 2–3 PNGs and JSON records. [`MELETO_SCREEN_INDEX.md`](./MELETO_SCREEN_INDEX.md) is index, not archived screenshots.

## Completed functionality

- PR #48–52: individual classes, settings, tenant CRUD, optimistic revision/archive/restore and hashed invite confirmed via student JWT.
- PR #53–54: reference-based UI screens 01–04, 09 and 31–33, seven class tabs, monthly attendance/homework statistics with unknown as “—”; class edit/archive.
- **[PR #55](https://github.com/Arthur200014/testing-hosting/pull/55)**: new isolated `TeacherGroupClasses` and `TeacherGroupEnrollments` tables, additive `20261115180000_TeacherGroupClasses` migration and snapshot; group CRUD, idempotent create, roster mutations with active-new-member validation and preserved inactive historical rows, capacity 1–20, auto/manual approval, archive/restore, one-time seven-day hashed invite; group form/detail and student accept, group cached reads and tests. Files: `platform/src/Platform.Api/Classes/TeacherGroup{Class,Service}.cs`, `Persistence/{PlatformDbContext.cs,Migrations/*}`, `Program.cs`, `platform/{teacher.html,student.html,teacher-data.mjs,meleto-fidelity.css}`, focused synthetic tests. **Not a grouped lesson:** no new group calendar rule/lesson association yet. The recording setting remains disabled; custom cover CSS not original Meleto artwork; financial fields save conditions only, not invoices or payment.
 
## Safety and continuation

Read `AGENTS.md` and this file on `main`, scope to `NEXT_ACTION`, inspect needed symbols and 2–3 frames, never broad-scan EGA/OGA or all reference PNGs. User requests **substantial connected work per chat**, not microtasks or 15-minute lesson durations. Preserve legacy students, history, GAS/Sheets, completed imports and Timeweb production. No force pushes. CI success ≠ production deploy. Always distinguish visual PARTIAL from pixel-perfect.
