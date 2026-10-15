# Phase 10a — Pilot readiness

**Status:** Done (2026-10-14)
**Roadmap ref:** `docs/roadmap.md` → Phase 10a

## Goal
A real school can say yes on Monday and start using Edu Desk that week, safely:
1. **We can create the school:** a command creates a school and its first admin. No demo data is needed.
2. **It runs in production:** a reproducible deployment with HTTPS for every school's subdomain, migrations on deploy, and a health check.
3. **Its data survives anything:** nightly off-site backups of the database and uploaded files, with a restore we have actually rehearsed.
4. **We hear about problems before the school does:** errors are logged, and an uptime check is in place.
5. **Parents can actually get in:** logins are generated for all parents at once, with printable login slips.
6. **The bursar can bill parents:** printable fee invoices with the school's bank details, which parents can also open in the portal.
7. **The legal basics are covered:** a privacy policy, terms of use, and a data processing agreement template.

**Not in this phase:** SMS/WhatsApp messages, the score change history, online payment, and the platform admin UI (Phase 11). Self-service "forgot password" needs SMS or email, so it waits for messaging; this phase only points people to the school office.

## Decisions baked in (see open questions)
- **Hosting: one VPS running Docker Compose.** It runs three things:
  - the Nuxt app (Node, the `.output` build);
  - **PostgreSQL**, with its data on a volume;
  - **Caddy** for HTTPS.

  This is the cheapest option and everything is in one place. The setup is portable to any provider (Hetzner, DigitalOcean, Contabo, AWS Lightsail…).
- **HTTPS for every school's subdomain** uses Caddy's **on-demand TLS**:
  - a certificate is issued the first time `<slug>.<domain>` is visited;
  - Caddy first asks the app (`/api/_tls/allowed?domain=…`, internal only) whether that school exists, so nobody can make us request certificates for random names;
  - this needs only one DNS record (`*.<domain>` → the server), and no DNS-provider plugin.
- **Uploads** (logos, student photos) stay on the filesystem storage they already use (decision 018), on a Docker volume that the backups include. No new storage service.
- **Migrations run on deploy** through a small script that uses drizzle-orm's own migrator (`drizzle-orm/postgres-js/migrator`), so production needs no dev tool and no new package.
- **Backups:**
  - **Nightly:** `pg_dump` plus a tarball of the uploads, encrypted, copied **off the server** to S3-compatible object storage (Cloudflare R2 or Backblaze B2), with a cron job in a small container.
  - **Kept:** 14 daily and 8 weekly backups.
  - **Restore:** a `restore.sh`, and a **restore drill** in the runbook, done before the pilot starts and once a term after that.
- **Monitoring:**
  - **Structured logs:** server errors are logged as JSON, with school and route but no personal data.
  - **Uptime:** `/api/_health` checks the database. An external uptime monitor (free tier, e.g. UptimeRobot) checks it every few minutes and alerts you.
  - Sentry is optional (open question 4).
- **Creating a school:** `pnpm school:create`, run on the server.
  - **It sets up:** the school (slug, name), its defaults (`applySchoolDefaults`: grading, assessment split), and an admin account with a **temporary password** shown once and changed at first login.
  - **It refuses:** reserved slugs (`www`, `admin`, `api`, `app`, `mail`, `support`, `platform`, per `docs/multi-tenancy.md`) and slugs already taken.
  - Everything else the admin sets up in the app, as today: calendar, classes, subjects, fee items, students (CSV import), staff.
- **Parent logins (bulk):** a new **Parent logins** page for the admin.
  - **The list:** every parent with their children and a login status: *No login yet*, *Temporary password (not used)* or *Active*.
  - **Generate logins:** for all parents without a login, or for a class, or for selected parents. Each gets a temporary password, changed at first login. The passwords are shown **once**, as **printable login slips** (A4, 8 per page): school name and logo, parent name, children, the login address, username (phone number) and temporary password.
  - **Regenerating** a parent's login replaces the old temporary password.
  - **Never touched:** active parents who have set their own password, unless picked one by one, and then the admin confirms.
- **Forgot password:** the login page gets "Forgot your password? Ask your school office to reset it." The admin's existing reset (Phase 1) already works for staff and parents.
- **Fee invoices:**
  - **Bank accounts:** the School profile gains up to **two bank accounts** (bank, account name, account number).
  - **The invoice:** a **printable A4 invoice** per student and term shows the school header, student and class, bill lines (including arrears or credit brought forward), discounts, total, paid so far, **balance due**, the bank accounts, and "Use the admission number as the payment reference".
  - **Where it's printed:** from the student's Fees page, or for a **whole class** (one invoice per page) from Bills.
  - **Parents** see the same invoice in the portal's Fees tab.
  - An invoice is just a print of the live bill: no invoice numbers, nothing stored.
- **Legal pages:**
  - **Pages:** public `/privacy` and `/terms`, linked from the login page and the footer, plus a **data processing agreement** template in `docs/legal/` for each school to sign.
  - **Roles:** under the NDPA the school is the data controller and we process data on its behalf.
  - **Content:** written as plain-English drafts with placeholders for your business name and contact. **A lawyer should review them before the pilot.** I'm not a substitute for legal advice.

## Schema changes
- **`schools`:** add `bankAccounts` (jsonb, an array of at most 2 `{ bankName, accountName, accountNumber }`), default `[]`.
- **`users`:** no change. Login status comes from `mustChangePassword` plus the new `lastLoginAt` column, which login sets.
- One migration. As always, I'll run `db:migrate` on the dev DB straight after generating it.

## API routes
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/_health` | public | `{ ok: true }` if the database answers; 503 otherwise. No tenant needed |
| GET | `/api/_tls/allowed?domain=` | public (Caddy only; not routed from outside) | 200 if the domain is `<existing-slug>.<APP_DOMAIN>` or the bare domain; 404 otherwise |
| GET | `/api/parent-logins?classArmId&status&search&page` | admin | Parents with children, phone and login status |
| POST | `/api/parent-logins` | admin | `{ guardianIds }` or `{ classArmId }` or `{ all: true }`; returns slips `{ name, phone, children, temporaryPassword }` once. Skips active parents unless listed by id with `includeActive: true` |
| PATCH | `/api/school/profile` | admin | (extended) `bankAccounts` |
| GET | `/api/fees/bills/[id]/invoice` | admin, bursar, principal | Invoice data for one bill |
| GET | `/api/fees/invoices?termId&classArmId` | admin, bursar, principal | Invoice data for every bill in a class |
| GET | `/api/me/children/[id]/invoice?termId` | parent | The child's invoice (own child only, via `requireOwnChild`) |

Every tenant route:
- validates input with Zod;
- enforces roles;
- gets tenant isolation tests;
- for the parent route, gets an IDOR test.

## Pages & components
- **`/parent-logins`** (admin, under Students in the nav): filter by class or status, select parents, "Generate logins", then the printable slips page (`print` layout).
- **School profile:** a Bank accounts section.
- **`components/fees/Invoice.vue`:** the A4 invoice. Pages:
  - `/fees/bills/[id]/invoice` (one invoice);
  - `/fees/invoices?term&arm` (a whole class, one per page);
  - `/my-children/[id]/invoice?term=` (parent).
- **Login page:** the "Forgot your password?" note, and links to Privacy and Terms.
- **`/privacy` and `/terms`** (public, no school needed).

## Ops files (new)
- **`Dockerfile`:** multi-stage; pnpm build, then a slim Node runtime running `node .output/server/index.mjs`.
- **`deploy/docker-compose.yml`:** app, postgres, caddy, and backup containers with volumes.
- **`deploy/Caddyfile`:** on-demand TLS with the `ask` endpoint; the bare domain and `*.<domain>` reverse-proxy to the app.
- **`deploy/.env.example`:** every production variable, documented; cookie Secure on; `NODE_ENV=production`.
- **`scripts/migrate.ts`:** applies migrations at container start.
- **`scripts/create-school.ts`:** `pnpm school:create`.
- **`deploy/backup.sh`, `deploy/restore.sh`.**
- **`docs/deploy.md`:** the runbook:
  - first-time server setup (DNS, firewall, Docker);
  - deploy and update;
  - creating a school;
  - backups and the restore drill;
  - uptime monitor setup;
  - what to do when the site is down.

## Test plan
### Unit
- **Slug rules:** format, reserved words, length.
- **The TLS check:** which domains are allowed.
- **Login status:** derived from `mustChangePassword` and `lastLoginAt`.
- **Invoice totals:** come from `billBalance`, with arrears and credit lines included.
- **Bank account validation:** a 10-digit NUBAN account number, at most 2 accounts.

### Integration
- **Creating a school:**
  - all-or-nothing (school, defaults and admin, or nothing);
  - a taken slug → error, nothing created;
  - a reserved slug → error;
  - the admin must change their password at first login;
  - logging in on the new subdomain works.
- **`/api/_health`:** 200 with the DB up.
- **`/api/_tls/allowed`:** existing slug → 200; unknown, reserved or foreign domain → 404; a suspended school → 200, because the suspended page still needs HTTPS.
- **Parent logins:**
  - **Generating:** for all, by class, or by ids. Only parents without a login get one by default; active parents only when listed and `includeActive` is set.
  - **Passwords:** returned once and work for login; a regenerated one replaces the old.
  - **Status:** `lastLoginAt` set on login; status moves No login → Temporary → Active.
  - **Access and isolation:** admin only (others 403); another school's guardians or classes → 404/400.
- **Bank accounts:** saved and validated (account number, at most 2); admin only.
- **Invoices:**
  - **Content:** matches the bill (lines, discounts, arrears, paid, balance) and includes the bank accounts.
  - **Whole class:** one invoice per billed student.
  - **Roles:** teacher → 403.
  - **Parents:** own child only (another family's child, another school's, or a removed child → 404); no bill → 404 "No bill for this term".
  - **Tenancy:** cross-tenant tests on every route.

### Nuxt
- **`parent-logins` page:** statuses, selection, the Generate confirm, slips rendered.
- **`Invoice`:** lines, arrears, balance due, bank accounts, the reference note.
- **Login page:** the forgot-password note and the legal links.

### E2E
- **Admin parent logins:** generate logins for Primary 3A, see the slips, log in as one of those parents with the temporary password, and get forced to change it.
- **Bursar invoices:** print Somto's invoice, which shows the balance and bank account; print a class's invoices.
- **Parents:** open the invoice from the Fees tab.
- **Public:** `/privacy` and `/terms` load without logging in; no overflow at 375px.

### Ops checks (manual, recorded in the runbook)
1. Build the Docker image locally and boot the compose stack on a test machine.
2. Check that `<slug>.<domain>` gets a certificate and an unknown slug doesn't.
3. Take a backup, restore it into a fresh database, and log in.
4. Point the uptime monitor at `/api/_health`, stop the app, and check that the alert arrives.

A CI job also builds the Docker image, so a broken Dockerfile is caught early.

## Seed (demo)
- **Greenfield:** two demo bank accounts, so invoices show them; a few parents left with no login, so the Parent logins page has something to generate.
- **The logo:** the Greenfield logo (`docs/demo/greenfield-emblem.png`) is seeded, so demos and screenshots show it.

## Implementation sub-steps
1. **Ops foundations:** `/api/_health`, `/api/_tls/allowed`, `scripts/migrate.ts`, Dockerfile, compose, Caddyfile, env template, the Docker build in CI (tests first for the two routes).
2. **School onboarding:** the slug rules, the create-school service (one transaction), and `pnpm school:create` (tests first).
3. **Backups and runbook:** `backup.sh`, `restore.sh`, the backup container, and `docs/deploy.md` with the restore drill.
4. **Parent logins:** `lastLoginAt` (migration), the service and routes, the page and printable slips, the forgot-password note.
5. **Fee invoices:** bank accounts (migration), invoice routes for staff and parents, the `Invoice` component and pages.
6. **Legal pages, seed, E2E and docs;** then push and CI.

## Acceptance checklist
- [x] `pnpm school:create` creates a working school with an admin, refusing reserved or taken slugs
- [x] The Docker stack serves `<slug>.<domain>` over HTTPS with certificates only for existing schools
- [x] Migrations run on deploy; the seed still refuses to run in production
- [x] Nightly encrypted off-site backups; a restore rehearsed and documented
- [x] `/api/_health` and the uptime monitor are documented; server errors are logged
- [x] The admin can generate parent logins in bulk and print the slips; temporary passwords force a change
- [x] Printable fee invoices with bank details, for staff (single or whole class) and parents
- [x] Privacy, terms and DPA drafts in place (marked for legal review)
- [x] Every new route has role, validation and tenant tests; `pnpm check`, `pnpm test:e2e` and CI green

## Changes while building
- **Login rate limit:** behind Caddy, the per-IP login limit would have counted every visitor as one address (decision 043). `NUXT_TRUST_PROXY` fixes it, with tests.
- **Login status:** shown as *No login yet* / *Slip given, not used yet* / *Active*, using a new `users.temporaryPasswordAt` column (`lastLoginAt` already existed).
- **Migrations:** run with drizzle-kit in a one-shot `migrate` container (the build stage), not a separate script.
- **Legal pages:** `/privacy` and `/terms` are served on each school's address (linked from its login page); the bare domain has no site yet.
- **Forgot password:** the login page already said "Ask your school admin to reset it".
- **CI:** builds the image, boots postgres + migrations + app to a healthy state, takes a backup and restores it into a drill database on every push.

## Open questions (resolved 2026-10-14: all recommendations approved)
1. **Hosting:** one VPS with Docker Compose (app, PostgreSQL, Caddy, backups). Moving the database to a managed service (e.g. Supabase) later is a backup, a restore and a new `DATABASE_URL`.
2. **Domain:** not chosen yet. Everything uses `NUXT_APP_DOMAIN`; the runbook says where to set it.
3. **Off-site backups:** Cloudflare R2 (any S3-compatible storage works through the same settings).
4. **Error alerts:** no Sentry for now. JSON error logs plus an external uptime monitor.
5. **Bank accounts:** up to two per school.
6. **Login slips:** 8 per A4 page.
7. **Legal:** plain-English drafts with `[Business name]`, `[Contact email]` placeholders, marked for legal review.
8. **Packages:** none new.
