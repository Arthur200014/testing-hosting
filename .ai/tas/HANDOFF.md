# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-03 single-lesson planning (one-time + linked to an individual/group class), reference screens 07 and 12–13 — functional slice complete, visual fidelity PARTIAL.
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`3058420`](https://github.com/Arthur200014/testing-hosting/commit/3058420783a66c4e01aaff1992e39825cea3d2d2), [PR #56](https://github.com/Arthur200014/testing-hosting/pull/56) merged.
**NEXT_ACTION:** UI-03 — **постоянные правила повторяющегося расписания (ScheduleRule), отдельно от экземпляров Lesson** по `15_class_schedule` и только 1–2 подходящим следующим PNG/JSON из набора `23–26` и `37–41`. Спроектировать tenant-scoped правило (класс, дни недели, начало, длительность, часовой пояс, активность), безопасные create/list/edit/disable API и форму/сводку слотов класса, обработку пересечений, тесты PostgreSQL/Chromium. Не создавать задним числом реальные/фиктивные уроки: правило задаёт слоты, а существующий UI-03 планировщик создаёт отдельные конкретные Lesson. Проверить повторную загрузку, сохранение и отмену без записи; после этого UI-03 календарь день/неделя/месяц. Не начинать весь календарный этап одним PR.
**VERIFICATION:** PASS — [Chromium 43661636362](https://github.com/Arthur200014/testing-hosting/actions/runs/43661636362) on `f370393` (all functional browser changes; subsequent patch only CSS padding); PASS — [PostgreSQL integration 43661846075](https://github.com/Arthur200014/testing-hosting/actions/runs/43661846075) + [TAS CI 43661846057](https://github.com/Arthur200014/testing-hosting/actions/runs/43661846057) on final `8ed4d7c`. Browser captures `07_onetime_create.png`, `12_lesson_create_top.png`, `13_lesson_create_bottom.png` manually viewed; PARTIAL visual match. NOT_RUN: pixel-perfect diff, production Timeweb, actual video/notifications/payments.

## Reference material

Original [`Meleto_Reference_Pack.zip`](https://chatgpt.com/library?file_id=libfile_2a4feb1037c08191997ce235ce5fd686&account_id=personal) in ChatGPT Library (74 PNG + `screen_specs.json`); materialize only 2–3 specific images and JSON entries for the next action. `MELETO_SCREEN_INDEX.md` gives names and paths.

## Completed slices

- [PR #48–55](https://github.com/Arthur200014/testing-hosting/pull/55): individual and group classes, tenant-safe CRUD, member enrolments, revisions, archive, invitations; Meleto screens 01–06, 09, 31–33 (PARTIAL visual).
- [PR #56](https://github.com/Arthur200014/testing-hosting/pull/56): `Lesson` gains nullable `IndividualClassId` / `GroupClassId`, optional title/description (max 50/1000), additive `20261115190000_LessonClassLinks` migration and EF snapshot. Existing imported unlinked lessons remain unchanged; composite tenant FKs reject foreign classes. `TeacherLessonService` ensures current members, only approved group members, not archived; preserves idempotency, safe pairs and existing lessons-with-homework; created scheduled participants have `Unknown` attendance. `TeacherHistoryReader` exposes links and metadata. `teacher.html` adds one-time/class planning form date/start/end, duration presets, topics text and participant checkboxes, confirm cancel, class-specific schedule list and nearest lesson; browser tests capture 07/12/13. `teacher-data.mjs` invalidates lessons on success; `meleto-fidelity.css` styles planner. **Not yet supported:** recurrence or recurring `ScheduleRule`, open-date lessons, real meeting/recording/chat, topic material linkage, day/week/month calendar. Recording toggle remains disabled.

## Constraints

Follow `AGENTS.md` and only current `NEXT_ACTION`. No broad repo/PNG scans; no live student records, imports, GAS/Sheets or production writes. User expects one substantial connected milestone per “Продолжай”, not microtasks. No forced pushes. A green GitHub CI is NOT a verified Timeweb deployment; visual match not pixel-perfect.
