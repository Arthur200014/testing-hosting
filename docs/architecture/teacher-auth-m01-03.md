# M01-03 — server-side teacher authentication baseline

**Date:** 2026-11-11. **Status:** isolated PostgreSQL + API integration PASS; staging/production NOT_RUN.

## What exists

- `TeacherUser.PasswordHash` uses the ASP.NET Core Identity `PasswordHasher<TeacherUser>` (versioned salted password hash, not plaintext).
- A teacher JWT is valid for at most the configured `Jwt:LifetimeMinutes` (1–15 min) and carries `sub` (teacher GUID), `jti` (DB session GUID), `workspace_id`, `membership_id`, `role=teacher`, `workspace_role`. It has no implicit student privileges.
- Each teacher request authorized with policy `teacher` revalidates `TeacherSessions` and current membership, role, active teacher/workspace flags, expiration, revocation and token/workspace consistency **from PostgreSQL**. Role or workspace deactivation invalidates access immediately, even when the JWT signature is still valid.
- Per-IP rate limiting on login uses the configured `StudentSessions` permit/window limits via a separate `teacher-sessions` limiter; failed, unknown, cross-tenant and inactive logins receive a generic 401.
- New endpoints:
  - `POST /api/v1/teacher-sessions` body `{workspace,email,password}` → temporary bearer JWT or 401;
  - `GET /api/v1/teacher/me` → scoped identity only (no list of students);
  - `POST /api/v1/teacher-sessions/logout` → server-side session revocation.
- Migration `20261111120000_TeacherSessions` adds nullable `TeacherUsers.PasswordHash` and persistent `TeacherSessions`, without changing legacy student membership or importing data.
- The `teacher-bootstrap` Docker Compose service is **admin-profile only**, invoked explicitly using `--bootstrap-teacher`. It provisions an initial workspace owner without any public sign-up route; it refuses overwrite, reactivation and duplicate active owners.

## Private first-owner setup (only on an isolated, trusted server)

First set secrets in an ignored `.env` per `platform/README.md`, run `docker compose up -d db` and `docker compose run --rm migrate`. Then provision the owner from a trusted shell, without putting the password in a command argument or Git:

```bash
export TEACHER_BOOTSTRAP_WORKSPACE='new-school'
export TEACHER_BOOTSTRAP_EMAIL='owner@example.invalid'
read -rsp 'Teacher password (16+ characters): ' TEACHER_BOOTSTRAP_PASSWORD
echo
export TEACHER_BOOTSTRAP_PASSWORD
docker compose --env-file .env --profile admin run --rm teacher-bootstrap
unset TEACHER_BOOTSTRAP_PASSWORD
```

Use real owner email and workspace slug **only in the privileged environment**, not in example fixtures or Git. The command must run **after** the migration. Restrict Docker host access and secret-visibility: a Docker administrator can inspect process environments.

For the **local loopback only** API, use JSON `POST /api/v1/teacher-sessions` with the workspace/email/password and send the returned access token as `Authorization: Bearer ...` to `/api/v1/teacher/me`. Outside a loopback connection, **TLS and a protected reverse proxy are mandatory**; do not send passwords over public HTTP or expose port 5432. Do not log request bodies or access tokens.

## Boundaries and future tasks

- **No teacher student/lesson/homework/subscription read/write API yet.** No `getTeacherFormData` exposure; existing `EGA/config/manage.html` and GAS remain the production interface and source of truth.
- No public teacher invitation, password reset, email verification, refresh tokens, session-management UI or role-change endpoint. `TeacherUser` / `WorkspaceMembership` are the authoritative DB roles. A second teacher must **not** be provisioned by reusing the first-owner bootstrap; invitation/onboarding is planned for M06 with audited admin controls.
- Teacher auth currently uses the platform JWT issuer/audience/signing key with a distinct `role` and DB authorization. Configure keys via secret management; future independent teacher auth issuer/key rotation is an optional security hardening.
- The `manage` browser's single-user `localStorage` cache is still **not tenant-safe**. M04 must clear/isolate it on teacher login/logout before providing any private package. Never treat old client-side verifyTeacher or GAS admin hash as server auth.
- Session rows are retained for revocation checks; add privacy-conscious expiry cleanup and audited operations in M02/M04 before scale. The current session row is an auth event, not a complete CRUD audit trail.
- Multi-subject `Subject`/`StudentEnrollment` from [M01-02](./tenant-subject-model-v1.md) remain designed, **not migrated**. Do not loosen workspace boundaries.

## Verification

[GitHub Actions PostgreSQL integration](https://github.com/Arthur200014/testing-hosting/actions/runs/43005907321): **66/66 PASS** including successful login, generic wrong credentials, cross-tenant forged signed claims, student-role denial, logout/instant revocation, inactive workspace and changed role, viewer rejection, rate-limit, and privileged bootstrap. [TAS scoped CI](https://github.com/Arthur200014/testing-hosting/actions/runs/43005907193): backend PASS, gate PASS.

**NOT_RUN:** production, HTTPS staging, live `manage`, real Sheets import, external email/SSO, restore/backup. The GitHub runners used isolated PostgreSQL test data only.

**NEXT_ACTION:** M01-04 — fresh read-only source diagnostics, including 17 previously blocking homework assignment rows; no real data writes.
