# Roadmap (MVP)

Each phase lists scope, acceptance criteria and the **minimum** tests required. Write the detailed spec in `docs/features/NN-<name>.md` before coding.

---

## Phase 0 — Project setup
**Scope:** Nuxt + Nuxt UI + TypeScript strict + pnpm, ESLint, Drizzle + Postgres connection, migration and seed scripts, `.env.example`, **tenant foundation** (`schools` table with slug/status, `00.tenant.ts` subdomain middleware, `DEFAULT_SCHOOL_SLUG` fallback, `server/utils/tenant.ts` helpers, `*.lvh.me` dev setup, seed two demo schools: `greenfield` and `sunrise`, school-not-found page), base layouts (dashboard with collapsible sidebar, auth, print), theme colour config, full test tooling (Vitest projects, PGlite helper, `@nuxt/test-utils`, Playwright with desktop + mobile projects), `pnpm check` script, GitHub Actions CI running `pnpm check` and E2E.
**Acceptance:** app runs; `greenfield.lvh.me` and `sunrise.lvh.me` each resolve to their school (name shown in the layout); unknown subdomain shows 404; dashboard layout renders on desktop and mobile; `pnpm check` and `pnpm test:e2e` green; CI passes.
**Tests:** one sample test per layer proving the tooling works (unit, PGlite integration with migrations applied, Nuxt component, Playwright home page on both viewports); unit tests for subdomain parsing (reserved slugs, ports, fallback); integration tests for tenant middleware (known, unknown, suspended school); two-school factory helper.

## Phase 1 — Authentication & roles
**Scope:** users table (`unique(schoolId, email)`), login/logout with `nuxt-auth-utils` with the session bound to the school, `requireRole()` server util, client route middleware, role-based sidebar nav, seed admin, change password. Admin resets passwords (no email reset in MVP).
**Acceptance:** each role logs in and sees only its nav; protected pages/routes reject other roles.
**Tests:** unit for password/role utils; integration for login (valid, wrong password, inactive user, correct credentials on the wrong school's subdomain), session, logout, `requireRole` (401/403), School A session rejected on School B host; decide on Postgres RLS and log it in `decisions.md`; E2E login/logout per role and forbidden-page redirect.

## Phase 2 — School setup
**Scope:** school profile (name, logo, address, motto, contacts), sessions & terms (set current), sections, class levels, arms, subjects (by section/department), assessment config, grading scales, position-display toggle. Seed defaults from `docs/domain.md`.
**Acceptance:** admin configures a full school; only one current session/term; invalid grading scales and assessment configs are rejected.
**Tests:** unit for grading-scale validation (gaps, overlaps, not covering 0–100) and assessment config (must sum to 100); integration for all CRUD routes + "set current" uniqueness + permissions; E2E admin sets up session, term and a class arm.

## Phase 3 — Staff management
**Scope:** add/edit/deactivate staff with login accounts, assign roles, class-teacher ↔ class arm, subject-teacher ↔ subject + class arm assignments.
**Acceptance:** deactivated staff can't log in; assignments drive what teachers can see later.
**Tests:** integration for CRUD, deactivation blocking login, assignment rules (one class teacher per arm, no duplicate subject assignments), permissions.

## Phase 4 — Students & guardians
**Scope:** admission form (bio data, photo, state of origin, class arm, SSS department), auto admission number, guardians (create or link existing), parent accounts, student list with search/filters/pagination, profile page, simple CSV bulk import with a row-level error report.
**Acceptance:** students admitted and listed; siblings share a guardian; CSV import reports bad rows without importing partial garbage.
**Tests:** unit for admission-number generation, phone normalisation, CSV row validation; integration for admission (transactional), guardian linking, filters, soft delete, permissions; E2E admit student + guardian, parent logs in.

## Phase 5 — Attendance
**Scope:** class teacher's daily register (present/absent/late) for their arm — one tap per student, mobile-first; term attendance summary per student.
**Acceptance:** register takes under a minute on a phone; one register per arm per day; teachers can only mark their own arm.
**Tests:** unit for summary calculation; integration for marking, editing same day, duplicate prevention, wrong-teacher 403; Nuxt test for the register component; E2E on mobile viewport.

## Phase 6 — Score entry
**Scope:** subject teacher picks term → class arm → subject and enters CA1/CA2/Exam in a keyboard-friendly grid with per-cell validation and explicit save; class teacher enters affective/psychomotor ratings and comments; locking rules.
**Acceptance:** teachers only see their assigned subject/arm pairs; invalid scores can't be saved; locked scores can't be edited.
**Tests:** unit for score validation (blank vs 0, above max); integration for save (bulk upsert), assignment-based permissions, locking; Nuxt test for the grid (keyboard nav, validation display).

## Phase 7 — Results & report cards
**Scope:** results service (totals, grades, averages, positions with competition ranking, subject stats, third-term cumulative); Draft → Submitted → Published workflow; principal comments; printable A4 report card; class broadsheet.
**Acceptance:** results match hand-calculated examples; parents see only published results; report card prints cleanly on A4.
**Tests:** **test-first** unit suite for the results service covering every rule in `docs/domain.md` (ties, missing scores, band boundaries, toggled positions, cumulative average); integration for workflow transitions and permissions; E2E full journey from score entry to parent viewing the report card.

## Phase 8 — Fees & payments
**Scope:** fee items per class level per term, bill generation, discounts, record payments, payment reversal with reason, printable receipts, student ledger, arrears carry-forward, debtors list, term collections summary.
**Acceptance:** balances always reconcile; no payment can be edited or hard-deleted; bursar can't access academics.
**Tests:** **test-first** unit suite for balance calculation (partial, overpayment/credit, discounts, arrears, reversals) using integer kobo; integration for bill generation idempotency, payments, reversals, permissions; E2E bursar records a partial payment and prints a receipt.

## Phase 9 — Parent portal
**Scope:** parent dashboard listing their children → published report cards, attendance summary, fee balance and payment history. Read-only, mobile-first.
**Acceptance:** a parent sees only their own children's data.
**Tests:** integration proving parents cannot access other children (IDOR checks on every route); E2E on mobile viewport.

## Phase 10 — Dashboards & promotion
**Scope:** role-based dashboard (student counts, today's attendance rate, fees collected vs expected, result-entry progress); end-of-session promotion with per-student exceptions (repeat, withdraw, graduate SSS 3).
**Acceptance:** dashboard numbers match the underlying data; promotion is transactional and can't run twice for the same session.
**Tests:** unit for dashboard aggregations and promotion mapping (last class → graduate); integration for promotion transaction + idempotency; E2E promote a class.

---

## Phase 10a — Pilot readiness
**Scope:** create a school from the command line; Docker production stack (app, PostgreSQL, Caddy with on-demand TLS per school subdomain); migrations on deploy; health check; nightly encrypted off-site backups with a rehearsed restore; error logs and uptime monitoring; bulk parent logins with printable slips; printable fee invoices with the school's bank accounts (staff and parents); privacy, terms and DPA drafts.
**Acceptance:** a new school can be created and served over HTTPS on its subdomain; backups restore; parents can be given logins in bulk; invoices print with bank details.
**Tests:** unit for slug rules, TLS allow-list, invoice totals; integration for school creation (transactional), parent logins (one-time passwords, forced change, isolation), invoices (staff and parent IDOR); E2E parent logins and invoices; Docker image built in CI.

---

## Phase 10b — Serverless deployment
**Scope:** run Edu Desk on Cloudflare Workers (free plan) + Supabase (free plan) + R2, with no server to manage; per-request database clients through Hyperdrive, database-backed login rate limit, uploads in R2, Cloudflare visitor IP; GitHub Actions deploys (migrations first), read-only previews, nightly encrypted backups to R2 and a restore drill; the VPS path keeps working.
**Acceptance:** the deployed site works end to end; CPU per request measured against the free 10 ms limit; backups restore; the Docker job stays green.
**Tests:** unit for the database limiter and trust-proxy modes; integration for per-request database scoping and storage selection; a Cloudflare-preset build in CI.

---

## Phase 10c — Offline attendance
**Scope:** installable app (PWA) that opens without signal; class teachers take the daily register offline, saved on the phone and sent automatically when back online (up to 3 days late, labelled "sent late"); the school's copy always wins on conflict; logout wipes offline data. Score entry offline comes next.
**Acceptance:** a register taken offline arrives intact; never overwrites a newer school register; no API data cached by the service worker.
**Tests:** unit for the late window, outbox sync and storage; integration for late submission and version conflicts; E2E taking a register offline and syncing it.

---

# SaaS phases (start only after a pilot school completes a full term)
See `docs/multi-tenancy.md` for the full design.

## Phase 11 — Platform admin
**Scope:** `platform_admins` table and separate login at `admin.<APP_DOMAIN>`; list/create/suspend/reactivate schools; usage overview; audited, time-limited support impersonation.
**Acceptance:** platform admins can't use school logins and vice versa; every impersonated action is in the audit log.
**Tests:** integration for platform auth separation, school status changes affecting tenant access, impersonation audit; E2E suspend a school → its subdomain shows the suspended page.

## Phase 12 — Self-serve onboarding
**Scope:** signup on the root domain (slug validation + availability, reserved slugs), transactional creation of school + admin + default seed data, setup wizard, trial start, per-school data export.
**Acceptance:** a new school goes from signup to entering students in under 15 minutes.
**Tests:** unit for slug rules; integration for signup transaction (rollback on failure, duplicate slug 409), seeded defaults; E2E full signup → wizard → first student admitted.

## Phase 13 — Subscriptions & billing
**Scope:** plans and feature flags, per-active-student-per-term pricing, Paystack subscription invoices + verified idempotent webhooks, subscription states (`trial → active → past_due → read_only → suspended`) with grace periods, billing page for school admins.
**Acceptance:** state transitions follow the rules; `read_only` blocks writes but parents can still view published results.
**Tests:** **test-first** unit suite for invoice calculation and state machine; integration for webhook signature verification and idempotency, feature-flag enforcement on routes; E2E trial school upgrades to a paid plan (Paystack test mode).

---

## Post-MVP (do not build unless asked)
Online school-fee payment via Paystack subaccounts/split payments, custom domains per school, SMS/WhatsApp notifications, email, timetable, CBT, lesson notes, library, hostel, transport, payroll, offline/PWA, i18n.
