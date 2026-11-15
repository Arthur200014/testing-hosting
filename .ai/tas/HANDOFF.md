# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — Meleto UI-01…UI-08
**ACTIVE_TASK:** UI-01/02 visual fidelity: screens 01–04, 09, 31–33 completed as PARTIAL visual + PASS functional tests.
**ACTIVE_BRANCH:** `none`
**LAST_IMPLEMENTATION_COMMIT:** [`05ec9ce`](https://github.com/Arthur200014/testing-hosting/commit/05ec9ce8a471ad143410081a421c26929ea38f0a), [PR #54](https://github.com/Arthur200014/testing-hosting/pull/54) merged.
**NEXT_ACTION:** UI-02 **крупный связанный этап группового класса**: по оригинальным PNG и JSON specs `05_group_create_top`, `06_group_create_bottom` (позже `09_class_summary`) создать постоянную tenant-scoped модель группового `TeacherClass` и отдельную связь нескольких существующих `WorkspaceStudentMembership` (Enrollment). Обеспечить создание/просмотр/редактирование состава, защиту от дублей и чужих membership, архив/восстановление, одно сохранение + отмену без записи; синтетические PostgreSQL/browser проверки и скриншоты референсного размера. НЕ заменять группой парное занятие; не создавать новых реальных учеников, импортов, платежей или уроков. Не переписывать уже готовую индивидуальную модель и старые CRUD; миграции только совместимые. Начать с просмотра AGENTS.md, этого HANDOFF и только нужных классов/миграций/форм, потом 2 PNG/JSON, без скана repo.
**VERIFICATION:** PASS — [Native homework browser 43656530849](https://github.com/Arthur200014/testing-hosting/actions/runs/43656530849), [Homework import integration 43656530877](https://github.com/Arthur200014/testing-hosting/actions/runs/43656530877), [TAS task CI 43656530900](https://github.com/Arthur200014/testing-hosting/actions/runs/43656530900) on head `51f1363` before merge. Chromium synthetic 1348×926: list, create, 7 class tabs, editor + unsaved-confirm, monthly attendance/task stats (explicit known numerator/denominator, no-data = dash), month switch, archived cards, restore, invite issue/revoke, reload. Screenshots `09_class_summary.png`, `31_class_edit.png`, `32_class_statistics.png`, `33_class_archive.png` manually reviewed. NOT_RUN: production Timeweb, pixel-perfect image comparison.

## Reference archive (verified)

[`Meleto_Reference_Pack.zip`](https://chatgpt.com/library?file_id=libfile_2a4feb1037c08191997ce235ce5fd686&account_id=personal) exists in ChatGPT Library (~28 MB), includes 74 original PNGs, `screen_specs.json`. Materialize from Library when needed; extract only next 2–4 screenshots and matching JSON. [PDF](https://chatgpt.com/library?file_id=libfile_ccc37577a6288191a70a64fad74f0d67&account_id=personal) optional. [`MELETO_REFERENCE.md`](./MELETO_REFERENCE.md) and [`MELETO_SCREEN_INDEX.md`](./MELETO_SCREEN_INDEX.md) are only indexes.

## Achieved

- PR #48–52: individual class CRUD/settings/archive and safe hashed student invitation workflow (see Git history).
- [PR #53](https://github.com/Arthur200014/testing-hosting/pull/53): visual pass screens 01–04; `platform/teacher.html`, `platform/meleto-fidelity.css`, `platform/meleto-ui-browser.mjs`.
- [PR #54](https://github.com/Arthur200014/testing-hosting/pull/54): screenshot-based screens 09 and 31–33: class summary with 7 tabs, real nearest scheduled lesson vs absent recurring slots, tabbed information/invitations, edit with unsaved-warning, true monthly attendance and normalized legacy/native homework statistics with explicit “—” for no data, expandable pupils, archive with separate status/restoration; footer links to functioning TAS modules. Frontend only; no API/schema changes. Real licensed Meleto photo not copied; original CSS cover, unsupported boards/payments/video explicitly inactive. `platform/teacher.html`, `platform/meleto-fidelity.css`, `platform/meleto-ui-browser.mjs`.

## Working constraints

Follow `AGENTS.md`, context economy, test synthetic only, no forced pushes. User wants **substantial connected milestones per “Продолжай”**, not microtasks or a 15-minute lesson duration change. Preserve real students, passwords, existing imports, Google Sheets/GAS and production Timeweb. Visual fidelity remains **PARTIAL**, not pixel-perfect; never claim production deployed unless verified.
