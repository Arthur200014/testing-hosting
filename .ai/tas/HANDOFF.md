# TEACHER AI STUDENT — HANDOFF

**UPDATED:** 2026-11-15
**ACTIVE_PLAN:** [RELEASE_PLAN.md](./RELEASE_PLAN.md) — UI-04, Meleto ref 17.
**ACTIVE_TASK:** UI-04 IN_PROGRESS — topic completion/progress milestone finished.
**ACTIVE_BRANCH:** main; [PR #71](https://github.com/Arthur200014/testing-hosting/pull/71) merged, no open implementation branch.
**LAST_IMPLEMENTATION_COMMIT / MERGED_SHA:** `e79203d8746e87699abb61c52a5e690caaa6f584`.
**RELEASE_STATE:** MERGED; FRONTEND_DEPLOY PASS; isolated acceptance PASS. Timeweb native auto-deploy from main confirmed by owner; exact running revision/deployment completion not independently verified.
**NEXT_ACTION:** Continue UI-04 ref 17: inspect existing native task/assignment model and add workspace/class-scoped topic-to-task association plus real “Без задания” filter (do not confuse task template and student assignment). Then link topics to particular lessons. Keep one reviewable scenario and isolated API/PostgreSQL/Chromium verification; do not reopen Timeweb access as a blocker.

## Owner clarification — overrides previous release blocker

Owner explicitly confirmed Timeweb automatically deploys latest main commits and authorized isolated testing + continued roadmap work when the panel is inaccessible. AGENTS.md now records this mode. No need to obtain production credentials/a live test workspace or inspect the blocked panel to proceed. Independent Timeweb revision remains UNKNOWN; LIVE_WRITE_NOT_RUN is a limitation, not a release blocker in this mode. Production safety remains unchanged.

## UI-04 topic completion — PR #71

- **Implemented:** nullable CompletedAt + CompletionRevision (additive migration `20261116040000_TeacherTopicCompletion`); teacher-only POST /api/v1/teacher/class-topics/completion with workspace/active-class checks, expected revision, safe immediate replay preserving timestamp, stale update 409. Individual/group topics can be marked completed and reopened. UI adds completed filter, scoped progress count and status labels.
- **Legacy loading fixed:** imported nonpersistent class cards show program unavailable instead of waiting for resources never requested. No conversion/import or new records in the owner's workspace.
- **Changed paths:** platform/class-program-ui.mjs + tests, teacher.html, Classes/TeacherClassTopicService.cs, Program.cs, persistence migration/snapshot, TeacherSessionTests.cs, calendar-real-browser.mjs and native-homework-browser.mjs; AGENTS.md records owner mode. The existing mock-browser journal selector was ambiguous between two actions; it now selects the named visible journal button.
- **LOCAL PASS:** 11 Node tests (program UI + cached teacher data), JS syntax and git diff check.
- **CI PASS on `a164fdac87f82b74fea8d00aec13eb395b9d656b`:** [TAS CI 43760457953](https://github.com/Arthur200014/testing-hosting/actions/runs/43760457953), [PostgreSQL integration 43760458084](https://github.com/Arthur200014/testing-hosting/actions/runs/43760458084), [Chromium + real isolated API/PostgreSQL 43760457961](https://github.com/Arthur200014/testing-hosting/actions/runs/43760457961). Browser covers empty filter, complete/reopen/complete, progress, persisted reload/re-login, material/order preservation. API covers invalid requests, replay/stale revisions, group completion, archive rejection and foreign tenant isolation.
- **FRONTEND_DEPLOY PASS:** merged-code [Pages 43760776038](https://github.com/Arthur200014/testing-hosting/actions/runs/43760776038). Published [teacher UI](https://arthur200014.github.io/testing-hosting/platform/teacher.html).
- **VISUAL PARTIAL:** reference 17 and generated 17_class_program_real.png (browser artifact) inspected. Functional completion/progress implemented; forms/layout are not pixel-matched.
- **TIMEWEB:** native auto-deploy owner-confirmed, independent latest API revision UNKNOWN. **LIVE_WRITE_NOT_RUN** per approved isolated-test mode. No production business data, credentials, invitations or notifications changed.

## Scope retained / safety

Earlier UI-04 topics PR #70 `ca67374713dd85ff13af9528ac23b9fb9caa5ba4`; class materials #68 `2418bdc`, lesson materials #69 `980bb5a`, class homework #67 `ace061b`. Detailed earlier release evidence remains in Git history.

Topic-to-task/assignment and lesson relationships, “Без задания”, binary uploads, recordings, billing and chat remain incomplete; UI-04 is not DONE. Existing real owner/student records remain read-only during acceptance. Never retarget reset/seed/import/calendar-real-browser.sh to production, repeat historical imports, change credentials/configuration or switch writers incidentally. Use synthetic isolated workspaces and keep secrets/personal data out of Git, artifacts and chat.
