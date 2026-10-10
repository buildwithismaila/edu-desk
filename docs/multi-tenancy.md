# Multi-Tenancy & SaaS Design

The app is built **tenant-ready from Phase 0**: one codebase and one database serve many schools, each fully isolated. SaaS business features (self-serve signup, billing, platform admin) come in Phases 11–13, after a pilot school has run a full term.

## Tenancy model
- **Shared database, shared schema, row-level isolation.** Every school-owned table has a non-null `schoolId` FK to `schools`.
- Composite indexes and unique constraints start with `schoolId` (e.g. `unique(schoolId, admissionNumber)`, `index(schoolId, classArmId)`).
- Optional safety net (decide in Phase 1, log in `decisions.md`): Postgres Row-Level Security keyed on a per-request `app.school_id` setting.

## Tenant resolution
- Each school has a unique `slug` and is served at `<slug>.<APP_DOMAIN>` (e.g. `greenfield.edudesk.ng`).
- `server/middleware/00.tenant.ts` reads the request host, extracts the subdomain, loads the school (cached briefly) and sets `event.context.school`. Unknown slug → 404 page. Suspended school → read-only or suspended page depending on status.
- Root domain (`edudesk.ng`, `www`) is the marketing/signup site; `admin.<APP_DOMAIN>` is reserved for the platform area (Phase 11). Reserved slugs: `www`, `admin`, `api`, `app`, `mail`, `support`, `platform`.
- **Single-school fallback:** if `NUXT_DEFAULT_SCHOOL_SLUG` is set and the host has no subdomain (or is `www`), use that school. This lets the pilot run on a plain domain.
- **Env vars:** `NUXT_APP_DOMAIN` (e.g. `lvh.me`, `edudesk.ng`) and `NUXT_DEFAULT_SCHOOL_SLUG` map to `runtimeConfig.appDomain` / `runtimeConfig.defaultSchoolSlug`. The `NUXT_` prefix is required so they are read at runtime rather than baked in at build time.
- **Local dev:** use `*.lvh.me` (resolves to 127.0.0.1), e.g. `http://greenfield.lvh.me:3000`. Configure Vite's `server.allowedHosts` to allow `.lvh.me`.

## Isolation rules (non-negotiable)
1. `schoolId` is **never** read from request bodies, query strings or route params. It comes only from `event.context.school`.
2. A user's session stores their `schoolId`. If it doesn't match `event.context.school.id`, treat the request as unauthenticated (401) and clear the session.
3. All tenant data access goes through `server/utils/tenant.ts` helpers (e.g. `requireTenant(event)` and scoped query functions that always add `where schoolId = …`). Raw unscoped queries on tenant tables are only allowed in platform code and seeds.
4. Looking up a record by id from another school returns **404** (not 403), so record existence isn't leaked.
5. Uploaded files are stored under `schools/<schoolId>/…` and served only after a tenant check.
6. Logs and errors never include student personal data.

## Users across schools
- Users (staff and parents) belong to exactly one school. Email/phone uniqueness is per school: `unique(schoolId, email)`.
- A parent with children in two schools has two accounts (one per subdomain). Revisit only if pilots ask for it.

## Platform layer (Phase 11)
- `platform_admins` table separate from school users; separate login at `admin.<APP_DOMAIN>`.
- Manage schools (create, suspend, reactivate), view usage (students, staff, storage), view subscriptions.
- **Support impersonation:** time-limited, requires a reason, every action written to an audit log, visible banner while active.

## Onboarding (Phase 12)
- Signup form: school name, desired slug (validated + availability check), proprietor name, email, phone, password.
- Creates the school, admin user and default seed data (class levels, grading scales, assessment config, affective/psychomotor traits) in one transaction.
- Setup wizard: logo & profile → current session/term → arms → subjects → invite staff. Starts a trial (default: 30 days).

## Subscriptions & billing (Phase 13)
- Pricing model: **per active student per term**, billed at the start of each term; plans gate features (SMS, online fee payment, CBT, multiple branches) and limits.
- Paystack (or Flutterwave) for collecting subscription payments; webhooks verified by signature and processed idempotently.
- Subscription states: `trial → active → past_due → read_only → suspended`. Grace period before `read_only`. **Never** hard-lock a school during results season without warning; in `read_only` parents can still view published results.
- Invoices and payment history visible to the school admin.

## School fee collection online (post-MVP)
- Use Paystack subaccounts / split payments so parent payments settle **directly into each school's bank account**; the platform never holds school funds. Optional platform fee per transaction.

## Data protection (NDPA 2023)
- Each school is the data controller; the platform is the processor. Terms of service include a data processing agreement.
- Per-school data export (CSV/JSON) and deletion on exit; encrypted backups; access to personal data restricted by role and audited for platform staff.

## Scaling notes
- Long-running work (results computation for a whole school, bulk imports, bill generation) should be designed so it can move to background jobs later; keep it in services, not in route handlers.
- Rate-limit login and public endpoints per IP and per school.
