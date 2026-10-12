# Decision Log

Record significant technical or product decisions here (newest at the bottom). Keep each entry short.

## Template
### NNN — Title (YYYY-MM-DD)
- **Context:** what problem or question came up
- **Decision:** what we chose
- **Alternatives considered:** and why not
- **Consequences:** trade-offs, follow-ups

---

### 001 — Money stored as integer kobo (initial)
- **Context:** Fees involve partial payments and discounts; floating-point rounding errors are unacceptable.
- **Decision:** Store all monetary values as integers in kobo; format only at display time.
- **Consequences:** All fee logic and tests use integers.

### 002 — PGlite for tests (initial)
- **Context:** Integration tests need a real database but must be fast and isolated.
- **Decision:** Use in-memory PGlite with the real Drizzle migrations for each test file.
- **Consequences:** Same SQL dialect as production Postgres; no Docker needed to run tests.

### 003 — Multi-tenant from day one: shared schema with `schoolId` (initial)
- **Context:** The product should become a SaaS serving many schools; retrofitting isolation later is risky.
- **Decision:** One database, shared schema, non-null `schoolId` on all tenant tables, scoped query helpers, cross-tenant tests on every route. SaaS business features deferred to Phases 11–13.
- **Alternatives considered:** database-per-school and schema-per-school — stronger isolation but costly migrations and hosting for many small schools.
- **Consequences:** Discipline required on every query; RLS considered as a safety net in Phase 1.

### 004 — Tenant resolved by subdomain (initial)
- **Context:** Requests must be mapped to a school before auth and data access.
- **Decision:** `<slug>.<APP_DOMAIN>` resolved in server middleware; `DEFAULT_SCHOOL_SLUG` fallback for single-school deployments; `*.lvh.me` for local dev.
- **Consequences:** Wildcard DNS and TLS needed in production; custom domains later.

### 005 — postgres.js as the Postgres driver (2026-10-10)
- **Context:** Drizzle needs a driver for dev/prod; PGlite covers tests only.
- **Decision:** `postgres` (postgres.js), Drizzle's primary recommendation. `useDb()` creates it lazily from `DATABASE_URL`; `setDb()` swaps in PGlite for tests. Both share the `Db` type.
- **Alternatives considered:** `pg` — works equally well, no advantage for us.
- **Consequences:** `DATABASE_URL` stays a plain env var (drizzle-kit and the seed read it too).

### 006 — In-process h3 harness for API integration tests (2026-10-10)
- **Context:** Every route needs integration tests against a real database, fast and without Docker or a Nuxt build per file.
- **Decision:** Server code imports h3/util functions explicitly (`import { defineEventHandler } from 'h3'`, relative imports for utils) instead of relying only on Nitro auto-imports. Tests mount the real tenant middleware and route handlers in a plain h3 app (`tests/helpers/app.ts`) backed by PGlite, and pick the tenant with the `Host` header. `#imports` is aliased to `tests/helpers/nitro-imports.ts` (mutable `useRuntimeConfig`).
- **Alternatives considered:** `@nuxt/test-utils` `setup({ server: true })` — boots a full Nuxt server per file and can't use PGlite easily.
- **Consequences:** Each new route must also be registered in `tests/helpers/app.ts`. Nitro behaviour not reproduced by h3 (e.g. route rules) is covered by E2E.

### 007 — `NUXT_`-prefixed tenant env vars (2026-10-10)
- **Context:** Plain `APP_DOMAIN` / `DEFAULT_SCHOOL_SLUG` read in `nuxt.config.ts` would be baked in at build time.
- **Decision:** `NUXT_APP_DOMAIN` and `NUXT_DEFAULT_SCHOOL_SLUG`, mapped to `runtimeConfig.appDomain` / `runtimeConfig.defaultSchoolSlug` and read at runtime. Refines #004.
- **Consequences:** One build can serve any domain; documented in `.env.example` and `docs/multi-tenancy.md`.

### 008 — Tenant error responses: 404 unknown, 403 suspended (2026-10-10)
- **Context:** Requests for an unknown or suspended school must stop before any route runs, with a clear page for visitors.
- **Decision:** `00.tenant.ts` throws `TENANT_ERRORS.notFound` (404 "School not found") for unknown/reserved/foreign hosts and `TENANT_ERRORS.suspended` (403 "School suspended"). Both live in `shared/constants/tenant.ts`; `app/error.vue` matches on them to choose its page and never shows a school name. Schools are cached per slug for 30s (existing schools only). Framework/asset paths (`/_nuxt/`, `/__nuxt*`, `/_ipx/`, `/_fonts/`, `/api/_nuxt_icon/`, `/favicon.ico`) bypass the middleware.
- **Alternatives considered:** 503 for suspended — reads as an outage rather than an account state.
- **Consequences:** A suspension takes up to 30s to apply. Nuxt 5 renders server-middleware errors as JSON; revisit before upgrading (see PROGRESS known issues).

### 009 — E2E against a production build and its own database (2026-10-11)
- **Context:** E2E must not touch dev data and should be close to production.
- **Decision:** Playwright `globalSetup` creates (if missing), migrates and seeds `edudesk_test` (`E2E_DATABASE_URL`, else `DATABASE_URL` renamed). The web server is `pnpm build && node .output/server/index.mjs` on port 3100 with env passed explicitly; readiness waits on the port because a bare-IP request has no school (404). Chromium maps `*.lvh.me` to 127.0.0.1, so no public DNS is needed. CI (GitHub Actions) runs `pnpm check` and E2E against a Postgres 18 service.
- **Consequences:** First local E2E run includes a full build (~1–2 min).

### 010 — No Postgres row-level security in the MVP (2026-10-11)
- **Context:** The roadmap asked to decide on RLS as a safety net for tenant isolation in Phase 1.
- **Decision:** Don't enable RLS now. Isolation is enforced by `requireTenant` + `whereSchool()` on every tenant query + mandatory cross-tenant integration tests on every route.
- **Alternatives considered:** RLS keyed on `SET LOCAL app.school_id` — needs a transaction per request around every query, which fights postgres.js pooling and every `useDb()` call; little benefit while all code is tenant-scoped.
- **Consequences:** Revisit before Phase 11, when platform (cross-tenant) code first exists.

### 011 — Sessions: sealed host-only cookie, bound to the school, user re-loaded per request (2026-10-11)
- **Context:** Users log in per school subdomain; a session must never work on another school's host.
- **Decision:** nuxt-auth-utils sealed cookie, host-only (no `Domain`), `SameSite=Lax`, 7 days, `Secure` except under `nuxt dev` / the http E2E server. Session holds `user {id, name, role, mustChangePassword}` and server-only `secure.schoolId`. `requireUser` rejects (401 + clear) a school mismatch and re-loads the user from the DB (scoped), so deactivation and role changes apply immediately. The built-in `/api/_auth/session` (also used by SSR) rejects foreign sessions via the `fetch` hook (`server/plugins/session-tenant.ts`) — not middleware, because h3 re-reads the request cookie after `clearSession()`.
- **Alternatives considered:** DB-stored sessions — revocable on logout, but another table and a lookup per request; not needed for the MVP.
- **Consequences:** Logout can't revoke a copied cookie until it expires (PROGRESS known issue; add a `sessionVersion` column if needed). One indexed user query per authenticated request.

### 012 — In-memory login throttling (2026-10-11)
- **Context:** Login must resist password guessing without new infrastructure.
- **Decision:** `server/utils/login-throttle.ts`: 5 failures per (school, email) and 50 per IP in a 15-minute window → 429 with `Retry-After`; success clears the account counter. Unknown emails still run a scrypt verify so timing doesn't reveal accounts. Wrong password and unknown email give the same 401; "account disabled" (403) only after a correct password.
- **Consequences:** Single-instance memory; uses the socket IP. Revisit both when choosing hosting (proxy / multiple instances).

### 013 — Seed uses a precomputed demo password hash (2026-10-11)
- **Context:** The seed runs with `tsx` outside Nitro, where nuxt-auth-utils' `hashPassword()` (`#imports`) isn't available.
- **Decision:** `server/database/seed/demo-password.ts` holds a scrypt hash of `password123` made with the same settings; a test verifies it. The seed refuses to run when `NODE_ENV=production`.
- **Consequences:** Regenerate the hash if the scrypt settings change (the test will fail).

### 014 — nuxt-auth-utils server utils as Nitro auto-imports (amends 006) (2026-10-11)
- **Context:** Nuxt type-checks API handlers in the app context too (typed `$fetch` route types), where `#imports` is the app's and lacks server-only utils.
- **Decision:** Server code calls `getUserSession`, `clearUserSession`, `replaceUserSession`, `hashPassword`, `verifyPassword` as auto-imported globals (declared in both contexts). The Vitest unit project registers the real implementations as globals (`tests/helpers/nitro-globals.ts`); everything else stays explicitly imported per 006. The harness also mirrors Nitro's JSON error body (`message` included).
- **Consequences:** New auto-imported server utils used in routes must be added to `nitro-globals.ts`.

### 015 — School structure: fixed sections, per-section subjects, editable departments (2026-10-11)
- **Context:** Phase 2 needs a model for sections, class levels, arms, SSS departments and subjects.
- **Decision:** Sections are a fixed enum (`nursery | primary | jss | sss`, from docs/domain.md). Class levels and arms are per-school rows. Each subject belongs to one section (Mathematics in Primary, JSS and SSS is three rows). SSS departments are an editable table, seeded Science/Arts/Commercial; only SSS subjects may have one (DB check constraint). Nursery has no numeric grading scale (skill ratings in Phase 7).
- **Alternatives considered:** a sections table (no school needs other sections); one subject row shared across sections (complicates teacher assignment and grading per section).
- **Consequences:** Schools without a nursery delete those levels. Teacher assignment (Phase 3) and scores (Phase 6) reference section-specific subjects.

### 016 — Setup data: admin writes, staff reads, hard delete with guards, case-insensitive names (2026-10-11)
- **Context:** Who may change school setup, and what happens when setup records are removed.
- **Decision:** Only admins write setup data and see the settings pages; staff (not parents) read it through the APIs; every logged-in user reads the current session/term. Setup rows are hard-deleted; deletes that would orphan data return 409 (current session, level with arms, department with subjects; later phases add arm-with-students, subject-with-scores). Names are unique per school ignoring case (checked in services; the DB constraint is case-sensitive).
- **Consequences:** Principals can't edit assessment/grading yet — revisit if pilots ask.

### 017 — Defaults per school and "only one current" in the database (2026-10-11)
- **Context:** New schools need the docs/domain.md defaults; exactly one session/term must be current.
- **Decision:** `applySchoolDefaults()` fills each category (class levels, departments, assessment split, each section's grade bands) only if the school has none of it — idempotent and never overwrites a school's edits; used by the seed and (Phase 12) onboarding. Partial unique indexes (`WHERE is_current`) allow one current session and one current term per school; `setCurrentTerm()` unsets then sets inside a transaction, and the session follows the term.
- **Consequences:** The database rejects a second current row even if code is wrong.

### 018 — Logos in Nitro fs storage, served per tenant (2026-10-11)
- **Context:** Schools upload a logo; files must stay isolated per school.
- **Decision:** Nitro storage mount `uploads` (fs driver, `.data/uploads`); key `schools/<schoolId>/logo.<ext>` built from the tenant, never from input. Uploads up to 1 MB, type detected from the file signature (PNG/JPEG/WebP). `GET /api/school/logo` streams the host school's logo (`Cache-Control: public, max-age=86400`); URLs carry `?v=<logoUpdatedAt>`. No resizing.
- **Alternatives considered:** S3-compatible storage — more setup than the MVP needs; the mount can be swapped later.
- **Consequences:** Production needs `.data` on a persistent volume and included in backups.

### 019 — PATCH routes validate the merged record (2026-10-11)
- **Context:** Partial updates can be valid on their own but invalid combined with saved values (term end before the saved start; moving an SSS department subject to JSS).
- **Decision:** PATCH bodies are validated, merged with the saved row, and the result is validated again with the full schema (`assertValid`) before writing. List replacements (assessment split, grading scale) validate the whole list first and replace it in one transaction.
- **Consequences:** A rejected update never changes the database.

### 020 — Dialogs via useOverlay; raw schemas; callbacks returning `unknown` (2026-10-12)
- **Context:** Settings pages need many small name/confirm dialogs.
- **Decision:** `useNameDialog()` / `useConfirmDialog()` (`app/composables/useDialogs.ts`) open `NameDialog` / `ConfirmDialog` with Nuxt UI's `useOverlay` and await the result. Zod schemas passed as overlay props go through `markRaw()`: `useOverlay` stores props reactively, and a proxied Zod schema throws on its read-only `_zod` property (found by E2E: Save silently did nothing). Callbacks that return a typed `$fetch(...)` are typed `() => unknown`, not `() => Promise<unknown>` (TS2321 "excessive stack depth" with ~45 typed routes).
- **Consequences:** Both rules are noted in docs/architecture.md.

### 021 — Staff are users; deactivate vs remove (2026-10-12)
- **Context:** Staff need accounts; leavers must lose access but their history must stay.
- **Decision:** Staff are `users` rows with a staff role (no separate table). **Deactivate** (`isActive = false`) is temporary: no login (403 "disabled"), sessions stop at the next request, assignments kept. **Remove** is a soft delete (`deletedAt`): treated like an unknown email at login (401), hidden from lists, assignments deleted, record and email kept. Emails are unique per school across all accounts (staff, parents, removed). New staff and admin resets get a one-time temporary password and must change it at first login.
- **Alternatives considered:** freeing a removed account's email for reuse — would need a partial unique index and makes "restore" ambiguous.
- **Consequences:** Re-hiring a removed person needs a manual restore (no UI in the MVP).

### 022 — Self and last-active-admin guards (2026-10-12)
- **Context:** An admin must not lock themselves or the school out.
- **Decision:** An admin can't deactivate, remove or change the role of their own account (409). Deactivating, removing or demoting an admin is refused if it would leave no active admin (`wouldLeaveNoActiveAdmin`, 409). Through the API the actor is always an active admin, so the second rule only matters when two admins change each other concurrently; the check runs in a transaction that locks the school's admin rows (`SELECT … FOR UPDATE`). Tests call the service directly to reach it.
- **Consequences:** Concurrent admin changes queue instead of racing.

### 023 — Teaching assignments per session (2026-10-12)
- **Context:** Later phases decide what a teacher can see (attendance: class teacher; scores: subject teacher).
- **Decision:** `class_teacher_assignments` (one per arm per session) and `subject_teacher_assignments` (one teacher per subject per arm per session), both DB-unique. Admins and principals manage them; teachers, principals and admins can be assigned (active, not removed); a subject must be in the arm's section. Deleting a session, arm or subject removes its assignments; becoming a bursar or being removed deletes a user's assignments; deactivation keeps them (flagged in the UI). `GET /api/me/assignments` (current session) is the contract Phases 5–6 build on.
- **Alternatives considered:** per-term assignments (more admin work for rare mid-year changes); copying from the previous session (deferred until pilots ask).
- **Consequences:** Mid-year changes are reassignments; who entered each score is recorded in Phase 6.

### 024 — E2E against a shared database: per-project data, cleanup, hydration waits (2026-10-12)
- **Context:** Desktop and mobile projects run in parallel against one seeded E2E database; pages are server-rendered.
- **Decision:** Tests that change data use names unique per run/project (or a different record per project), clean up after themselves (via the UI, or `page.request` in a `finally` when cleanup must survive a failed assertion), and only one project changes school-wide state such as the current term. Tests that click right after navigating use `gotoHydrated()` (waits for the Vue app to mount): a click on server-rendered HTML before hydration does nothing. Long journeys set their own timeout.
- **Consequences:** Reruns start from the seeded state; fewer flaky clicks.
