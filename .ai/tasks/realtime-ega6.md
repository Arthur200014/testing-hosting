# Reusable realtime layer for EGA task 6

Status: IN_PROGRESS

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

Planning. Ten `EGA/6/` pages use Firebase Realtime Database with inline ES
modules. `dz1.html`, `dz2.html`, and `dz3.html` do not use Firebase; they submit
results through Google Apps Script. No application files have been changed.

## Decisions

- User confirmed that the pilot includes only `EGA/6/`.
- Keep Firebase, public URLs, UI, and Google Apps Script behavior unchanged.
- Extract transport and lifecycle helpers first; keep game state schemas,
  transactions, validation, drawing semantics, and rendering in each page.
- Keep page-owned root namespaces (`sharedGuides` or `sharedInteractives`),
  stroke paths, member IDs and payloads. Parameterize refs and subscriptions;
  do not impose one state shape on all pages.
- Use an isolated Firebase emulator for multi-client behavior checks; do not
  create sessions or submit results in production services.

## Relevant files

- `EGA/6/correct.html`, `EGA/6/formula.html`, `EGA/6/gaid.html`,
  `EGA/6/mix.html`.
- `EGA/6/найди ошибку-1.html`, `EGA/6/найди ошибку-2.html`.
- `EGA/6/триг-теория.html`, `EGA/6/триг-уравнения-практика.html`.
- `EGA/6/что не так-1.html`, `EGA/6/что не так-2.html`.

## Completed

- Read repository workflow and navigation rules.
- Confirmed the ten realtime pages and three non-realtime homework pages with
  targeted read-only research.

## Current step

Prepare a fail-closed browser harness before application changes.

## Next step

1. Start an isolated RTDB emulator. Connect the client before its first database
   operation. Before navigation, block production RTDB and Apps Script requests,
   including WebSockets, beacons and queued result flushes. Fulfill student-code
   JSONP validation with a deterministic test identity inside the harness;
   never contact the real Apps Script endpoint.
2. Capture a safe baseline. Add one `EGA/6/` Firebase lifecycle module and first
   migrate `что не так-1.html` and `что не так-2.html`; then migrate the other
   eight in bounded groups without changing paths or schemas.
3. Check all ten URLs, module loads, path/schema invariants, two independent
   teacher/student contexts, sync, presence, reconnect, drawing/erase where
   applicable, reload, cleanup, and console/network deltas. Obtain fresh review.

## Verification

Initial Git worktree was clean. Targeted file and Firebase usage inspection ran
read-only. An independent read-only plan review found the path and test-isolation
risks now recorded here. No implementation, emulator, or browser behavior check
has run yet.

## Open questions / risks

- Validate the emulator injection seam before any RTDB operation and verify the
  new relative module loads from every unchanged public HTML URL.
- `gaid.html` uses child-level listeners, while other pages use value listeners;
  keep subscription event type configurable.
- Some pages auto-flush queued Apps Script results on load or pagehide; a fresh
  browser profile alone is not a sufficient write barrier.

## Last updated

2026-10-04: Mapped the pilot and refined the plan after independent review.
