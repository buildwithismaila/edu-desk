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

### 025 — Student CSV import: all-or-nothing, guardians by phone, no bulk passwords (2026-10-12)
- **Context:** Schools bring existing students from spreadsheets (up to 1,000 rows, 1 MB). A half-imported file is hard to fix, and a list of parent passwords is risky to print.
- **Decision:** `POST /api/students/import?dryRun=true` reports every error (spreadsheet row numbers, header = row 1). A real import re-checks the file and imports everything in one transaction, or nothing (400 with the errors). Guardians are matched by phone to active parents (siblings share one; existing parents are reused, not changed); a phone that belongs to staff is an error. New parent accounts get one random password per import, hashed once and never shown (`mustChangePassword`); the admin uses "Reset password" when a parent wants to log in. Rows with a typed admission number are inserted first, so generated numbers skip them.
- **Alternatives considered:** importing the valid rows and reporting the rest (partial state, re-import duplicates); a temporary password per parent (up to 1,000 scrypt hashes in one request, and a printed password list).
- **Consequences:** Imported parents can't log in until the admin resets their password. A concurrent admission that takes a number or phone makes the import fail with 409 instead of half-applying.

### 026 — Guardians are parent users; login by email or phone (2026-10-12)
- **Context:** Many Nigerian parents have a phone but no email they use. Siblings share parents.
- **Decision:** A guardian is a `users` row with role `parent` (no separate table), linked to students through `student_guardians` (relationship, primary flag). Phone is required and unique per school among active accounts (partial unique index); email is optional, so `users.email` became nullable (staff still require one). The login form takes `{ login, password }`: an email or a Nigerian phone in any common format. New guardians added through admission get a one-time temporary password, shown once.
- **Alternatives considered:** a separate `guardians` table with optional accounts (two places for the same person once they log in).
- **Consequences:** Guardian contact changes apply to all their children. A phone used by a staff account can't be a guardian's.

### 027 — Students: per-session enrolment and role-scoped visibility (2026-10-12)
- **Context:** Later phases (attendance, scores, results, promotion) need a student's class per session, and parents' and staff's views differ.
- **Decision:** `student_enrolments` holds one class arm per student per session; lists and profiles use the current session. Admin/principal see all students; the bursar sees all without date of birth, state of origin, LGA and address (NDPA); teachers see the arms they're class or subject teacher of; parents see their own children. A student outside the viewer's scope is a 404, so their existence isn't revealed. Students are soft-deleted. Photos are private (`/api/students/[id]/photo` after the same check, `Cache-Control: private`).
- **Consequences:** Phase 9 promotion adds next-session enrolments; deleting a session or arm with enrolments is refused (409).

### 028 — Admission numbers: PREFIX/YEAR/NNNN with a per-year counter (2026-10-12)
- **Context:** Schools expect sequential numbers and often have an old register to carry over.
- **Decision:** `schools.admissionPrefix` (2–6 letters/digits, default from the name, editable) + the admission session's first year + a counter in `admission_counters (schoolId, year)` incremented inside the admission transaction (upsert), skipping numbers already taken. A manually typed number is allowed if unused (case-insensitive). Only the prefix is configurable in the MVP.
- **Consequences:** A failed admission doesn't use a number; changing the prefix only affects new numbers.

### 029 — Unit test workers: Liftoff only, at most 2 (2026-10-12)
- **Context:** Every integration file starts a fresh worker process that compiles PGlite's WASM and runs scrypt logins. On the 8 GB dev machine, workers crashed natively ("Fatal process out of memory: Zone", `WebAssembly.Memory(): could not allocate memory`).
- **Decision:** The unit project runs with `execArgv: ['--liftoff-only']` (no TurboFan tier-up for WASM; also faster) and `maxWorkers: 2`.
- **Alternatives considered:** one PGlite per worker reused across files (`isolate: false` + template database) — the real fix for memory and run time, left for later (PROGRESS.md).
- **Consequences:** Crashes are rarer but can still happen when the machine is busy; rerun.

### 030 — Attendance: daily registers per arm, class teacher today, admin/principal back-fill (2026-10-12)
- **Context:** Class teachers must take a register on a phone in under a minute; mistakes and absent teachers happen.
- **Decision:**
  - **Registers:** `attendance_registers` is DB-unique per (school, arm, date) and tied to the current term; `attendance_marks` is DB-unique per (register, student).
  - **Saving:** a save must cover exactly the arm's active students. It runs in one transaction, and a concurrent first save becomes an update, so there's never a second register.
  - **Who and when:** the class teacher (current session assignment) takes today's register only. Admin and principal can take or correct any date in the current term up to today, and delete a mistaken register. Any other teacher gets 403; unknown or foreign arms get 404.
  - **Summaries:** built from each student's own marks across all arms in the term. Late counts as present.
  - **Dates:** no weekday or holiday calendar.
  - **Today:** Africa/Lagos, computed on the server.
- **Alternatives considered:** one row per student per day without a register (can't tell "not taken" from "everyone absent", and no "days opened"); a holiday calendar (more admin work, unnecessary while days count only when a register is taken).
- **Consequences:**
  - Arms and sessions with registers can't be deleted (409).
  - Past terms are read-only.
  - The E2E global setup widens the current term to include the run date.

### 031 — Pages use `useAsyncData` + explicitly typed `$fetch` for query-driven API calls (2026-10-12)
- **Context:** Pages whose request depends on the URL (arm, date) need to skip the call until a choice exists. Inferred `$fetch` types on these routes hit TS2321.
- **Decision:**
  - Use `useAsyncData(key, () => cond ? requestFetch<T>(…) : null, { watch: [...] })`.
  - `requestFetch = useRequestFetch()`: during SSR a bare `$fetch` doesn't forward the request, so the tenant ("School not found") and the session would be missing. E2E found this.
  - Take `T` from `InternalApi[route][method]` (`nitropack/types`).
- **Consequences:** No request is made until a choice exists, and the types stay exact.

### 032 — Score entry: one row per cell, explicit absent, bulk save of changed cells (2026-10-13)
- **Context:** Teachers enter CA1/CA2/Exam for a whole class at once, often on slow connections. Blank, zero and absent must stay different, and invalid scores must never be stored.
- **Decision:**
  - **Storage:** `score_entries` holds one row per (term, student, subject, component). A blank cell has no row. `absent` is explicit (score null; a DB check enforces score xor absent). Rows don't store the arm, so a student who changes arm keeps their scores.
  - **Saving:** the grid sends only changed cells. The server checks every cell (on the sheet, a known component, 0…max) and refuses the whole save with `cellErrors` if any is wrong. Otherwise it upserts or deletes in one transaction.
  - **Who:** the assigned subject teacher (current term), or admin and principal (any term of the current session).
  - **Locks:** `score_locks` per (term, arm) make scores, ratings and comments read-only (409) until admin or principal unlocks them. Phase 7's publish will create the lock.
  - **Freeze:** the assessment split can't be changed once scores exist (409).
- **Alternatives considered:** one row per student and subject with a JSON of components (hard to validate against the split, no FK per component); auto-saving each cell (more requests on slow networks, half-saved sheets).
- **Consequences:** Changing the split mid-year needs a per-session snapshot (post-MVP). Subjects and sessions with scores can't be deleted.

### 033 — Ratings, comments and Nursery ratings (2026-10-13)
- **Context:** The report card needs affective/psychomotor ratings, a class teacher's comment, and a skill-based result for Nursery.
- **Decision:**
  - **Traits:** a fixed list in `shared/constants/traits.ts`, rated 1–5 in `trait_ratings` (term, student, trait), entered by the class teacher of the arm (current session) or admin/principal.
  - **Comments:** the class teacher's comment lives in `term_comments`; the principal's comment is added in Phase 7.
  - **Nursery:** `nursery_ratings` holds one rating per (term, student, subject), and Nursery sheets use rating mode.
- **Consequences:** Configurable traits are post-MVP. Clearing a comment deletes the row, so Phase 7 must set columns to null instead once the principal's comment shares the row.

### 034 — Results: pure computation, a per-arm workflow, frozen published report cards (2026-10-13)
- **Context:** Results must match hand-calculated examples. Parents may only see what the principal published, and a published card shouldn't silently change.
- **Decision:**
  - **Computation:** `computeArmResults` (pure, `shared/utils/results.ts`) does the work: averages over offered subjects, competition ranking by exact average, per-subject positions and stats, cumulative average in the third term.
  - **Statuses:** `result_statuses` holds one row per (term, arm); no row means Draft. A returned arm keeps its row with the reason.
  - **Transitions:** `transitionResults` defines who may do what, and both the API and the buttons use it. Submit needs complete sheets and adds the score lock. Publish writes `published_results` (one JSON report card per student) in one transaction. Unpublish deletes the snapshots. Return to draft removes the lock. A manual unlock is refused while results hold it.
  - **Reading:** staff read live results before publishing and snapshots after. Parents read only snapshots.
- **Alternatives considered:** always computing live (published cards could change after a grading-scale edit); storing computed numbers per student and subject (more tables, the same risk).
- **Consequences:**
  - A correction after publishing is: unpublish → return to draft → fix → submit → publish.
  - Report card content is versioned by the snapshot shape (`ReportCard` type); later phases (fees) add fields, and old snapshots simply lack them.

### 035 — Report cards and broadsheets are print-styled pages (2026-10-13)
- **Context:** Schools print report cards on A4 and file broadsheets.
- **Decision:** The pages use the `print` layout, plain tables, A4 `@page` rules and `break-after: page` per card, with no PDF library. The browser's "Save as PDF" covers digital copies.
- **Consequences:** The output looks slightly different in each browser's print engine (checked in Chromium). The parent's card is the same component.

### 036 — E2E: school-wide state changes run last, on their own (2026-10-13)
- **Context:** Desktop and mobile run in parallel against one database. Switching the current term (school setup) made the parallel results journey publish into the wrong term (403) and show the wrong status.
- **Decision:** Tests that change state every other test relies on, such as the current term, live in their own spec (`current-term.spec.ts`). That spec runs in a `school-state` Playwright project that depends on `desktop` and `mobile`, so it runs after them and alone. Tests that write data also restore it at the start as well as the end, so a failed run can't block the next.
- **Consequences:** The E2E run takes slightly longer. Decision 024 (per-project data, cleanup) still applies.

### 037 — Fees: bills from fee items, live carry-forward, discounts capped at the items (2026-10-13)
- **Context:** Bursars bill every student each term and need balances that always reconcile, arrears that follow the student, and room to fix fee changes after billing.
- **Decision:**
  - **Bills:** `fee_items` are set per (term, class level). `bills` are one per (term, student). `bill_lines` hold the item lines plus one `carry_forward` line, which is the previous term's balance and negative for credit.
  - **Generate and refresh:** generating creates only the missing bills. Refreshing re-syncs item lines on bills without payments (keeping chosen optional items) and carry-forward lines on every bill.
  - **Discounts:** fixed in kobo or percent in basis points, applied to items only and together capped at the items total, so a discount can never create credit.
  - **One source of truth:** every balance (bill, ledger, debtors, collections, report card) comes from the pure `billBalance`.
- **Alternatives considered:** a stored running balance per student (it drifts unless every write updates it); arrears as a separate account (more tables, and the carry-forward line does the job).
- **Consequences:** Fee changes after payments are adjusted bill by bill (optional items, discounts). The carry-forward line reflects the old bill until the next refresh.

### 038 — Payments are append-only, with per-year receipt numbers (2026-10-13)
- **Context:** Money records must be auditable: no edits, no deletes.
- **Decision:**
  - **Append-only:** `payments` has no update or delete route. A tested 404 proves there's no such route, and the test app now returns 404 for unknown `/api` routes, like Nitro. A mistake is reversed once, with a reason (`reversedAt`, `reversedById`, `reversalReason`), and reversed payments don't count as paid.
  - **Receipt numbers:** `RCT/YEAR/NNNNNN`, from `receipt_counters`, incremented in the payment's transaction, so concurrent payments get unique numbers.
  - **Online payments later:** `channel` (`manual`) and `gatewayReference` are ready for them.
- **Consequences:** A wrong payment shows twice in the ledger (payment and reversal). Receipts show REVERSED with the reason.

### 039 — Parent portal: one own-child guard, parent-shaped responses (2026-10-13)
- **Context:** Parents may only ever see their own children, and some staff data (reversal reasons, who took the money, the ledger, optional-item choices) isn't for them.
- **Decision:**
  - **Routes:** parent views live under `/api/me/children/[id]/…` (overview, results, attendance, fees, a payment's receipt), parent role only. Each handler calls `requireOwnChild` first: 404 unless an active guardian link to a non-removed child exists in the host school, so a child's existence is never revealed.
  - **Shapes:** the services return parent-shaped data built from the staff services (`billDetails`, `getPayment`, `studentAttendanceSummary`, published snapshots), dropping staff-only fields rather than reusing the staff routes.
  - **Receipts:** a payment is found by id and then must belong to the child in the path, else 404.
  - **Tests:** one IDOR suite runs every parent route against another family's child, a removed child, another school's child and payment, a sibling's payment, no session and every staff role.
- **Consequences:** Staff routes stay unchanged. A new parent view means a new route under `/api/me/children/[id]/` with `requireOwnChild` and an entry in the IDOR suite.

### 040 — Promotion per class arm, DB-enforced once per session, undo until the new session starts (2026-10-14)
- **Context:** End-of-session promotion must be transactional and must not run twice for the same session, yet mistakes need fixing before the new session begins.
- **Decision:**
  - **Tables:** `promotion_runs`, unique per (school, from-session, arm), and `student_promotions`, unique per (school, from-session, student), with outcome and target arm.
  - **One transaction:** promoting inserts the run (`ON CONFLICT DO NOTHING`, so a concurrent second run gets 409), the next-session enrolments for promoted and repeating students, and the outcomes.
  - **Undo:** deletes the enrolments the run created and the run (its outcomes cascade), allowed only while the next session isn't current.
  - **Target session:** the next session by name.
  - **Status:** graduated or withdrawn status comes from the latest outcome, with no new column on `students`.
  - **Rules:** placement and validation are pure (`shared/utils/promotion.ts`) and shared by the UI and the API.
- **Alternatives considered:**
  - whole-school promotion in one go (harder to review, and one bad class blocks all);
  - a `students.status` column (duplicates what the outcomes record);
  - final promotion without undo (fixing mistakes student by student).
- **Consequences:** A session with promotion records can't be deleted. After the switch, promotions are final; individual moves use "Change class".

### 041 — Dashboard numbers come from the detail services (2026-10-14)
- **Context:** Dashboard figures must match the pages they summarise.
- **Decision:** `getDashboard` calls `collections`, `debtors`, `listScoreSheets` and `listResultArms` rather than re-aggregating. Only students and today's attendance are counted directly, with `todayAttendance` (late = present, as in the term summary). Integration tests compare the dashboard with the detail endpoints.
- **Consequences:** One extra query or so per block; numbers can't drift from the detail pages.

### 042 — Production: one VPS with Docker Compose, Caddy on-demand TLS, nightly encrypted off-site backups (2026-10-14)
- **Context:** A pilot school needs Edu Desk live over HTTPS on its own subdomain, with data that survives the server, run by one person with modest Linux skills and budget.
- **Decision:**
  - **One VPS running Docker Compose** (`deploy/`): postgres, a one-shot `migrate` (drizzle-kit, from the build stage of the `Dockerfile`), the app (runtime stage, non-root), Caddy, a `backup` service and a `tools` profile for `pnpm school:create`.
  - **HTTPS:** Caddy's on-demand TLS issues a certificate on the first visit to a hostname, after asking `/api/_tls/allowed`. That allows the bare domain, www and existing schools (any status), so one wildcard DNS record suffices and nobody can make us request certificates for made-up names.
  - **Backups:** nightly `pg_dump` + uploads tar, encrypted with gpg (AES-256) and copied with rclone to S3-compatible storage (Cloudflare R2): 14 daily and 8 weekly copies, plus a heartbeat ping. `restore.sh` has a drill mode (into a separate database) that CI runs on every push.
  - **Monitoring:** server faults are logged as JSON lines (route and school, no query strings or bodies), and `/api/_health` is watched by an external uptime monitor.
- **Alternatives considered:**
  - managed hosting with Supabase for the database: less upkeep, but about $25 a month more, and it doesn't host the app (the move is a backup, a restore and a new `DATABASE_URL`);
  - wildcard certificates by DNS challenge (needs a DNS-provider plugin and API keys);
  - Sentry (a new package; revisit when there are several schools).
- **Consequences:** We run the server: monthly updates, a restore drill each term (docs/deploy.md). One instance only, so the in-memory login limiter stays valid.

### 043 — Trust X-Forwarded-For only behind our proxy (2026-10-14)
- **Context:** Behind Caddy every request comes from the proxy's address, so the per-IP login limit would lock out everyone after 50 failures anywhere.
- **Decision:** `NUXT_TRUST_PROXY=true` (set in the production compose file) makes the login limit use the first `X-Forwarded-For` address. Caddy replaces any value a visitor sends. Without the setting the header is ignored, since a client could fake it. Tested both ways.
- **Consequences:** Never set it when the app is reachable without the proxy in front.

### 044 — Parent logins in bulk, as printed one-time slips (2026-10-14)
- **Context:** Decision 025 kept the CSV import from creating usable parent passwords, which was right for the import but meant 300 one-by-one resets before a pilot. Parents need a way in.
- **Decision:**
  - **A separate, explicit admin action:** the Parent logins page generates one-time passwords for every parent without a login, one class's, or chosen parents, and returns them once for printing (8 slips per A4).
  - **Status:** `users.temporaryPasswordAt` records when a temporary password was shown (resets, new accounts, slips), so the page tells "no login yet" from "slip given, not used yet".
  - **Slips at home stay valid:** "all" and "class" skip parents with a slip already, so slips sent home aren't invalidated; chosen parents are regenerated, and active parents only with `includeActive`.
  - **Hashing:** done 8 at a time.
- **Alternatives considered:** SMS or email delivery (no provider yet; next with messaging); passwords at import (decision 025's reasons still hold).
- **Consequences:** The slips page holds the passwords only in memory. Leaving it before printing means generating again for those parents.

### 045 — Fee invoices are prints of the live bill (2026-10-14)
- **Context:** Schools send parents a bill with bank details at the start of term.
- **Decision:** An invoice is rendered from the bill at print time (the same `billDetails`/`billBalance` as the fees pages), with the school's bank accounts (`schools.bankAccounts`, at most two) and the admission number as the payment reference. No invoice table, no numbers, nothing stored.
- **Consequences:** Reprinting later shows the current balance. If schools need numbered, frozen invoices (e.g. for accounting), that's a later change.

### 046 — Login limiter in the database; a database client per request on Cloudflare (2026-10-15)
- **Context:** Cloudflare Workers runs many short-lived instances that don't share memory, and a Worker can't reuse one request's database connection in another request.
- **Decision:**
  - **Limiter:** the failed-login counters move from memory into a `login_failures` table (not a tenant table: the school is part of each key), with the same rules and tests as decision 012.
  - **Database client:** `useDb()` asks a provider (`server/plugins/request-db.ts`, using Nitro's async context) for the current request's client. On Cloudflare, that's a client per request from the Hyperdrive binding `DB`, closed after the response with `waitUntil`; elsewhere it falls back to the shared pool as before.
  - **Uploads:** stored on disk on Node and in the R2 binding `UPLOADS` on Cloudflare, chosen at build time from `NITRO_PRESET`. `readUpload()` normalises Buffer and ArrayBuffer.
  - **Visitor IP:** `NUXT_TRUST_PROXY=cloudflare` reads `CF-Connecting-IP`.
- **Consequences:** Every login now does one or two small writes. The limiter would also be correct with several VPS instances. Route code is unchanged.

### 047 — Serverless start: Cloudflare Workers (free) + Supabase (free) + R2, VPS path kept (2026-10-15)
- **Context:** No budget for a server before the first paying schools; the owner prefers not to manage one.
- **Decision:**
  - **Hosting:** the app on Workers rather than Pages, because Workers supports wildcard routes for school subdomains and Smart Placement next to the database.
  - **Data:** Supabase Postgres through Hyperdrive, with uploads and encrypted nightly backups (GitHub Actions) in R2.
  - **Deploys:** after CI passes, migrations first, then deploy, then a health check.
  - **Previews:** a separate Worker whose database role can read everything but write only `users.last_login_at` and `login_failures`.
  - **Supabase pausing:** an uptime monitor on `/api/_health` doubles as the keep-alive.
  - **Free plan CPU:** the 10 ms CPU limit is measured on the first deploy; exceeding it means choosing Workers Paid (~$5/month) or lighter hashing, together, never silently.
  - **The VPS path stays:** the Docker setup is still built and booted in CI.
- **Alternatives considered:** Cloudflare Pages (no wildcard custom domains); Vercel (the Hobby plan isn't for commercial use); a VPS (preferred later, with decision 042).
- **Consequences:** Two deploy targets to keep working; CI builds both. Moving to a VPS later is a backup, a restore and DNS (docs/deploy-cloudflare.md section 10).

### 048 — Offline attendance: an installable app, an outbox on the phone, the school's copy wins (2026-10-26)
- **Context:** Many schools have weak or no mobile signal in the morning, when the register is taken.
- **Decision:**
  - **Installable app:** `@vite-pwa/nuxt` (Workbox) precaches the app's files and keeps opened pages (network first, then the saved copy). It never caches `/api` data, except the icon endpoint, which holds no school data.
  - **Data on the phone:** the app keeps its own copies in IndexedDB (a small wrapper, no package), per school host and user: the teacher's classes, today's lists, and an outbox of registers waiting to send. They're sent when the app opens, when the phone comes back online, every minute while some are waiting, and on "Send now".
  - **Server:** `PUT /api/attendance/register` takes `offline: { baseVersion }`, which allows a 3-day late window and runs a version check inside the save. A mismatch returns 409 with the school's register and writes nothing.
  - **Stale pages:** a page served from the phone can be from an earlier day, so the attendance page checks the date with the server, and uses the phone's copies when offline.
  - **Logout:** wipes the store and the saved pages, after a warning about unsent registers.
- **Alternatives considered:** background sync in the service worker (not supported on iPhones; the page-driven retry works everywhere); comparing `updatedAt` (millisecond JSON vs microsecond database timestamps).
- **Consequences:**
  - Offline works only after one online visit, and only on https or localhost (browsers allow service workers only on secure origins). The demo's `--lan` mode (plain http on the Wi-Fi address) has no offline mode.
  - A phone's clock decides the register's date; the 3-day window and the "Sent late" label limit the risk.

### 049 — Results withheld per term until its fees are paid; payments clear the oldest debt first (2026-10-26)
- **Context:** Many schools give out results only once fees are cleared. The owner wants only the terms that are owed held back, not every result.
- **Decision:**
  - **The setting:** `schools.withholdResultsUntilPaid` (off by default).
  - **The rule:** a term is owed when any of the child's outstanding debt lands on it, counting payments against the oldest debt first (`owedByTerm`, pure and unit-tested). It's checked live on every parent request, so there's no "unlock" step. The parent results list, the report card route and the dashboard card all enforce it.
  - **Release:** per student and term (`result_releases`), by admin or bursar.
- **Alternatives considered:** withholding every result while anything is owed (the owner preferred per term); comparing each term's own bill balance (wrong once arrears are carried forward and paid on a later bill); a stored "withheld" flag (would go stale when payments are recorded or reversed).
- **Consequences:** Paper report cards are still the school's call (staff printing is unchanged).
