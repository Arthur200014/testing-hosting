# Reusable realtime layer for EGA task 6

Status: COMPLETE

## Goal

Extract the shared realtime behavior used by task 6 interactives into a reusable
layer while preserving their observable behavior.

## Scope

Pilot limited to confirmed realtime pages under `EGA/6/`. Firebase remains the
transport. Public page URLs stay the same.

## Non-goals

`OGA/6/`, unrelated interactives, UI changes, Google Apps Script changes, and a
new realtime transport.

## Current state

Ten `EGA/6/` Firebase pages now use `realtime-lifecycle.js` for Firebase
initialization, session paths/references and value subscriptions. The matching
presence lifecycle is shared by the two `что не так` and two `найди ошибку`
pages. Other pages retain their own presence ordering and payloads. The
non-Firebase `dz1.html`, `dz2.html`, and `dz3.html` remain unchanged.

## Decisions

- User confirmed that the pilot includes only `EGA/6/`.
- Keep Firebase, public URLs, UI, and Google Apps Script behavior unchanged.
- Extract transport and lifecycle helpers first; keep game state schemas,
  transactions, validation, drawing semantics, and rendering in each page.
- Keep page-owned root namespaces (`sharedGuides` or `sharedInteractives`),
  stroke paths, member IDs and payloads. Parameterize refs and subscriptions;
  do not impose one state shape on all pages.
- `formula.html` and `mix.html` store strokes under `state/strokes`; the other
  pages use a root-level `strokes` path. `mix.html` reads strokes in its state
  subscription rather than a separate stroke subscription.
- Preserve page-specific disconnect ordering and error handling. Only pages
  with matching semantics use the shared presence helper; `gaid.html` keeps
  its child-event listeners and disconnect-before-write behavior.
- Use an isolated Firebase emulator for multi-client behavior checks; do not
  create sessions or submit results in production services.

## Relevant files

- `EGA/6/correct.html`, `EGA/6/formula.html`, `EGA/6/gaid.html`,
  `EGA/6/mix.html`.
- `EGA/6/найди ошибку-1.html`, `EGA/6/найди ошибку-2.html`.
- `EGA/6/триг-теория.html`, `EGA/6/триг-уравнения-практика.html`.
- `EGA/6/что не так-1.html`, `EGA/6/что не так-2.html`.
- `EGA/6/realtime-lifecycle.js`.

## Completed

- Read repository workflow and navigation rules.
- Confirmed the ten realtime pages and three non-realtime homework pages with
  targeted read-only research.
- Extracted the shared lifecycle and migrated all ten realtime pages without
  changing their public URLs, UI markup/styles, Firebase configuration, GAS
  endpoints or page-owned game and drawing rules.
- Ran deterministic checks, isolated emulator/browser verification and an
  independent regression review.

## Current step

Implementation and verification complete.

## Next step

For future scale-out, reuse the lifecycle contract only where each page's
path, listener and presence semantics match. Keep new pilots separately scoped.

## Verification

Initial Git worktree was clean. All ten inline modules and the shared module
parse successfully; `git diff --check` passes. Outside each inline module, the
HTML/CSS and Firebase configuration match `HEAD` byte-for-byte. A bare Firebase
SDK import-use check passes on all ten pages.

A fail-closed local Chromium/RTDB-emulator harness compared original `HEAD` and
migrated pages. All ten public URL paths returned HTTP 200, reached the end of
their modules and produced zero page errors in both versions. Console and
blocked-network observations matched: nine Google Fonts requests and one
MathJax request were blocked in each run by the safety firewall. No production
Firebase or Apps Script request succeeded. The harness fulfilled student-code
JSONP locally and blocked external RTDB HTTP, GAS beacons and WebSockets before
navigation.

Two independent contexts on `что не так-1.html` synchronized teacher/student
lobby state and presence, a stroke appeared in both clients and erase removed
it from both. A student reload and rejoin changed online presence 2 → 1 → 2.
The distinct shared-presence branch on `найди ошибку-1.html` also passed a
two-client lobby/presence/reload check. An independent reviewer inspected the
module and all ten diffs and found no confirmed regression or scope creep.

## Open questions / risks

- The all-page check is a smoke test, not a complete gameplay run on every
  page. Artificial transport-drop reconnection, role-switch races and full
  gameplay on the other eight pages were not exercised. Production result
  submission was deliberately not exercised.
- The emulator hook is fail-closed for malformed settings and is used only by
  the isolated test harness. The default production Firebase transport is
  unchanged.

## Last updated

2026-10-04: Implemented and verified the EGA/6 pilot; independent review found
no confirmed regressions.
