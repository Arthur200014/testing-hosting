# Repository Context Map

Use this map to choose a starting area, then search for exact task-related files
or symbols. It is navigation guidance, not an inventory of all interactives.

## EGE interactives

Path: `EGA/`. Numbered subdirectories contain educational HTML interactives;
`EGA/config/` also exists. Search a relevant number or page first. Do not scan
the whole tree unless repository-wide analysis is required.

For shared realtime, identity, result transport, or homework transport work,
start at `shared/interactive/v1/` and
`docs/architecture/ega6-shared-runtime.md`. Files under `EGA/6/shared/v1/`
and `EGA/6/realtime-lifecycle.js` are compatibility re-exports, not a second
implementation. All ten EGA/6 realtime pages use this layer, and
`dz1.html`–`dz3.html` share auth/result transport. New or migrated pages in
EGA or OGA should enter through the top-level `interactive-runtime.js`;
`найди ошибку-1.html` and `найди ошибку-2.html` are the provider-neutral pilot.

## OGE interactives

Path: `OGA/`. Numbered subdirectories contain educational HTML interactives.
Search a relevant number or page first.

For a new shared realtime/data integration, reuse the public entry points in
`shared/interactive/v1/` rather than copying modules into `OGA/`.

## Codex configuration

- `AGENTS.md`: engineering and Git policy.
- `.codex/skills/orchestrate/`: delegation skill.
- `.codex/skills/typesafe-ai/`: TypeSafe skill.

## AI task memory and architecture

- `.ai/tasks/`: short, task-specific continuation notes.
- `docs/architecture/`: stable, verified architectural decisions.
- For migration from Google Apps Script/Sheets to ASP.NET Core/PostgreSQL,
  start at `docs/architecture/gas-postgres-migration-audit.md` and
  `.ai/tasks/gas-postgres-audit.md`; these record the audited API actions,
  sheet headers, auth risks, business rules, and safe migration order without
  containing row values or credentials.
- For the implemented ASP.NET Core/PostgreSQL foundation, start at
  `docs/architecture/platform-foundation.md`, `.ai/tasks/platform-foundation.md`,
  `platform/`, and `compose.yaml`. The first student-session API and the optional
  browser adapter exist, but legacy Apps Script/Firebase remain active by default.
- For the safe first migration slice of the `Ученики` sheet, start at
  `docs/architecture/student-directory-import.md` and
  `.ai/tasks/student-directory-import.md`. The local XLSX importer is not a
  production API and does not migrate other sheets.

## Targeted search prompts

- Realtime: search for Firebase initialization, session or room IDs, presence,
  student connection, synchronization, reconnect, and cleanup.
- Drawing: search for canvas, pointer or touch events, drawing state,
  synchronization, and eraser logic.
- Student identification: search for student code, `localStorage`, validation,
  and student name.
- Interactive navigation: search for links, `window.open`, `location`,
  `target="_blank"`, and game, start, or reset handlers.

These are search terms, not claims that every feature exists in every page. Open
only the files that the task and search results make relevant.

## TEACHER AI STUDENT — действующий Meleto UI

- Start: `.ai/tas/HANDOFF.md` → `.ai/tas/RELEASE_PLAN.md` → relevant stage in `.ai/tas/PHASE_CHECKLISTS.md`. Old Mxx/Pxx boards and `FOCUS_FIRST.md` from 11 November no longer set NEXT_ACTION.
- Reference: `.ai/tas/MELETO_REFERENCE.md` → `.ai/tas/MELETO_SCREEN_INDEX.md` → only the needed PNGs and `screen_specs.json` entries in the Library archive.
- Current teacher UI: `platform/teacher.html`, `platform/teacher-data.mjs`, `platform/teacher-mutation.mjs`, `platform/teacher-report.mjs`. Student UI: `platform/student.html`. Reuse existing session/auth and data patterns; these pages are not already Meleto-complete.
- Backend: `platform/src/Platform.Api/Program.cs`, `platform/src/Platform.Api/Persistence/PlatformDbContext.cs` and the relevant model/migration files. `LearningProgram` is not assumed to be a Meleto class; check its semantics before reusing it.
- Teacher and browser tests: relevant `platform/tests/` and `platform/*.test.mjs` only. Timeweb deployment behavior: `docs/ops/timeweb-autodeploy.md`. Existing API/schema foundations: `docs/architecture/platform-foundation.md`.
- Legacy `EGA/config/manage.html`/GAS remain separate. For data migration questions, use `docs/architecture/gas-postgres-migration-audit.md` and importer task notes; no new production import as part of UI work.

For UI-01 specifically: inspect the teacher page's navigation/rendering, data fetch, teacher read endpoints, workspace and program/student relations, then the two reference states `01_classes` / `02_learning_type`. Do not scan all of `platform/` or all 74 images.
