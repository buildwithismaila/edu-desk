# Phase 0 — Project setup

**Status:** Approved 2026-10-10 (all open-question recommendations accepted; GitHub repo creation decided in sub-step 6)
**Roadmap ref:** `docs/roadmap.md` → Phase 0

## Goal
A running Nuxt 4 app with the full toolchain (lint, typecheck, four test layers, CI) and the **tenant foundation** in place: every request is resolved to a school by subdomain before anything else runs, so all later phases are tenant-scoped from their first line of code. No auth, no school features yet.

## User stories
- As a **developer**, I can clone the repo, copy `.env.example`, run `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev`, and open `http://greenfield.lvh.me:3000`.
- As a **developer**, I can run `pnpm check` and `pnpm test:e2e` locally and get green results, and CI runs the same on every push/PR.
- As a **visitor** to `greenfield.lvh.me`, I see the dashboard layout with "Greenfield" school name; on `sunrise.lvh.me` I see "Sunrise".
- As a **visitor** to an unknown subdomain (`nope.lvh.me`), I see a "School not found" page (HTTP 404).
- As a **visitor** to a suspended school's subdomain, I see a "School suspended" page (HTTP 403).
- As a **visitor on a phone (375px)**, the dashboard layout is usable: sidebar collapses behind a toggle.
- As an **operator of a single-school pilot**, I can set `DEFAULT_SCHOOL_SLUG` and serve the school on the bare domain.

## Toolchain & versions (checked 2026-10-10 via npm)
| Package | Version | Notes |
|---|---|---|
| nuxt | 4.6.x | v4 `app/` structure, TS strict |
| @nuxt/ui | 4.11.x | includes Tailwind v4; dashboard components |
| drizzle-orm / drizzle-kit | 0.45.x / 0.31.x | |
| @electric-sql/pglite | 0.5.x | tests only |
| @nuxt/test-utils | 4.3.x | `defineVitestProject` for the nuxt project |
| vitest | 5.0.x | projects: `unit`, `nuxt` |
| @playwright/test | 1.64.x | Chromium only (desktop + mobile projects) |
| @nuxt/eslint, @vueuse/nuxt, @nuxt/image, zod, happy-dom, @vue/test-utils | latest | all on the approved list |

Local machine: Node 24.15, pnpm 11.5, PostgreSQL 18 installed natively (no Docker needed).
I will re-verify each config API against nuxt.com / ui.nuxt.com / orm.drizzle.team while implementing.

### ⚠️ Packages NOT on the approved list — need your OK (rule 6)
| Package | Why |
|---|---|
| `postgres` (postgres.js) | Postgres driver for Drizzle in dev/prod. Drizzle needs *some* driver; postgres.js is Drizzle's primary recommendation. (Alternative: `pg`.) |
| `typescript`, `vue-tsc` | Required by `nuxt typecheck`. |
| `tsx` | Runs `server/database/seed/index.ts` (TS + path aliases). Node 24's native type-stripping can't resolve aliases / extensionless imports. |
| `@iconify-json/lucide` | Bundles Lucide icons locally so icons don't fetch from the Iconify API at runtime (better on slow networks). Optional. |

Not adding `dotenv` — `drizzle.config.ts` and the seed use Node's built-in `process.loadEnvFile()`. Not adding coverage tooling yet (`@vitest/coverage-v8`) — propose it in the phase that adds the first service.

## Schema changes
New file `server/database/schema/schools.ts` (re-exported from `schema/index.ts`). `schools` is the **tenant root**, not a tenant table, so it has no `schoolId`.

```ts
export const schoolStatus = pgEnum('school_status', ['active', 'suspended'])

export const schools = pgTable('schools', {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  status: schoolStatus().notNull().default('active'),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})
```
- Profile fields (logo, address, motto, contacts) are Phase 2. Subscription states (`trial`, `read_only`, …) are Phase 13 — the enum is extended then.
- First migration generated with `pnpm db:generate` and committed in `server/database/migrations/`.

**Seed** (`pnpm db:seed`, idempotent upsert by slug):
| slug | name | status | purpose |
|---|---|---|---|
| `greenfield` | Greenfield Academy | active | main demo school |
| `sunrise` | Sunrise Schools | active | isolation checks |
| `hillside` | Hillside College | suspended | demo the suspended page (see open question 4) |

## Tenant foundation
### Constants — `shared/constants/tenant.ts`
- `RESERVED_SLUGS = ['www', 'admin', 'api', 'app', 'mail', 'support', 'platform']`
- `SLUG_PATTERN` — lowercase letters, digits, hyphens; 3–40 chars; no leading/trailing hyphen.

### Host parsing — `server/utils/tenant-host.ts` (pure function, unit tested)
`resolveTenantSlug(host, { appDomain, defaultSlug })` → `{ kind: 'school', slug } | { kind: 'none' }`
1. Normalise: lowercase, strip `:port`, strip trailing `.`.
2. Host must equal `appDomain` or end with `.<appDomain>`; otherwise `none`.
3. No subdomain (bare domain) or `www` → `school` with `defaultSlug` if set, else `none`.
4. Exactly one subdomain label that matches `SLUG_PATTERN` and is not reserved → `school`.
5. Anything else (reserved like `admin`, multi-level `a.b.lvh.me`, invalid chars, empty host) → `none`.

`admin.<APP_DOMAIN>` resolves to `none` (404) until Phase 11.

### Middleware — `server/middleware/00.tenant.ts`
- Skips framework/asset paths: `/_nuxt/`, `/__nuxt` (incl. `/__nuxt_error`, which Nuxt fetches internally to render `error.vue`), `/_ipx/`, `/_fonts/`, `/api/_nuxt_icon/`, `/favicon.ico`.
- `none` or unknown slug → `createError({ statusCode: 404, statusMessage: 'School not found' })`.
- `suspended` → `createError({ statusCode: 403, statusMessage: 'School suspended' })`.
- `active` → `event.context.school = { id, slug, name, status }` (typed via `H3EventContext` augmentation in `server/types/`).
- Lookup via `findTenantSchool(slug)` in `server/utils/tenant.ts`, cached in a module-level `Map` with a 30s TTL (existing schools only, so random subdomains can't grow it); `clearTenantCache()` exported for tests.
- Reads `runtimeConfig` via `import { useRuntimeConfig } from '#imports'`; Vitest aliases `#imports` to `tests/helpers/nitro-imports.ts`.

### Helpers — `server/utils/tenant.ts`
- `requireTenant(event): TenantSchool` — returns `event.context.school` or throws 404. The only sanctioned way to get `schoolId`.
- Scoped query helpers (`where schoolId = …`) are added in **Phase 1** alongside the first tenant table (`users`), so they're built and tested against a real table rather than speculatively now.

### DB access — `server/utils/db.ts`
- `useDb()` returns a Drizzle instance (postgres.js driver, `DATABASE_URL`), created lazily.
- `setDb(db)` lets integration tests inject a PGlite-backed Drizzle instance. Shared type `Db` covers both drivers.

## API routes
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/school` | public (no auth until Phase 1) | Returns `{ slug, name }` of the current tenant (never `id` or status). Used by the layout to show the school name. |

No input, so no Zod schema; tenant comes only from `requireTenant(event)`.

## Pages, layouts & components
- `app/app.vue` — `<UApp>` + `<NuxtLayout>`.
- `app/app.config.ts` — theme: `ui.colors.primary = 'green'`, `neutral = 'slate'` (see open question 5).
- `app/layouts/default.vue` — dashboard: `UDashboardGroup` + `UDashboardSidebar` (collapsible on desktop, slideover on mobile, `data-testid="sidebar-toggle"`) + `UDashboardPanel`/`UDashboardNavbar`. Sidebar header shows `<SchoolBrand>`. Nav: a single "Dashboard" item (role-based nav is Phase 1).
- `app/layouts/auth.vue` — centred card for login (used from Phase 1).
- `app/layouts/print.vue` — plain white, A4 `@page` CSS, hides everything with `.no-print`.
- `app/components/layout/SchoolBrand.vue` (`<LayoutSchoolBrand>`) — fetches `/api/school` via `useSchool()` (`app/composables/useSchool.ts`: `useFetch` with key `school`, shared with the index page), shows name (`data-testid="school-name"`, hidden when the sidebar is collapsed).
- `app/pages/index.vue` — placeholder dashboard home ("Welcome to {school name}").
- `app/error.vue` — 404 → "School not found" (`data-testid="error-not-found"`), 403 suspended → "School suspended" (`data-testid="error-suspended"`), else a generic error. No school name shown (there is no valid tenant).

## Config & scripts
- `nuxt.config.ts`: modules `@nuxt/ui`, `@nuxt/eslint`, `@vueuse/nuxt`, `@nuxt/image`, `@nuxt/test-utils/module`; `typescript.strict`; `vite.server.allowedHosts: ['.lvh.me']`; `runtimeConfig: { appDomain: 'lvh.me', defaultSchoolSlug: '' }`.
- `.env.example`:
  ```
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/edudesk
  NUXT_APP_DOMAIN=lvh.me
  NUXT_DEFAULT_SCHOOL_SLUG=
  ```
  (see open question 1 about the `NUXT_` prefix)
- `drizzle.config.ts` → schema `server/database/schema/index.ts`, out `server/database/migrations`.
- `package.json` scripts:
  | Script | Command |
  |---|---|
  | `dev` / `build` / `preview` | nuxt defaults (`postinstall: nuxt prepare`) |
  | `db:generate` / `db:migrate` | `drizzle-kit generate` / `drizzle-kit migrate` |
  | `db:seed` | `tsx server/database/seed/index.ts` |
  | `lint` | `eslint .` |
  | `typecheck` | `nuxt typecheck` |
  | `test:unit` | `vitest run --project unit` (unit + integration, node env) |
  | `test:nuxt` | `vitest run --project nuxt` |
  | `test:e2e` | `playwright test` |
  | `check` | `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:nuxt` |
- `vitest.config.ts` — two projects: `unit` (`tests/unit/**`, `tests/integration/**`, environment `node`) and `nuxt` (`defineVitestProject`, `tests/nuxt/**`, environment `nuxt` / happy-dom).
- `playwright.config.ts`:
  - Projects: `desktop` (Desktop Chrome) and `mobile` (Chromium, 375×667, touch).
  - `use.baseURL = http://greenfield.lvh.me:3000`; Chromium launched with `--host-resolver-rules=MAP *.lvh.me 127.0.0.1` so E2E doesn't depend on public DNS for `lvh.me`.
  - `globalSetup`: create (if missing), migrate + seed the E2E database — `E2E_DATABASE_URL`, else `DATABASE_URL` renamed to `edudesk_test`.
  - `webServer`: `pnpm build && node .output/server/index.mjs` on port 3100 (prod build, closer to reality), env passed explicitly; readiness waits on the port (a bare-IP URL would 404); `reuseExistingServer` locally.
- `.github/workflows/ci.yml` — on push + PR:
  - **check** job: Node 24, pnpm (via `pnpm/action-setup`), cached store, `pnpm install --frozen-lockfile`, `pnpm check`.
  - **e2e** job: Postgres 18 service container, migrate + seed, `playwright install --with-deps chromium`, `pnpm test:e2e`, upload HTML report on failure.

## Test plan
All tests live in the folders from `docs/testing.md`. Helpers:
- `tests/helpers/db.ts` — `createTestDb()`: new in-memory PGlite → Drizzle → apply the real migrations (`drizzle-orm/pglite/migrator`). Called once per test file.
- `tests/helpers/app.ts` — builds an h3 app with the real `00.tenant.ts` middleware and real route handlers, and `request(path, { host })` to call it with a `Host` header. Uses `setDb()` to point at the PGlite DB and `clearTenantCache()` between tests.
- `tests/factories/schools.ts` — `createSchool(db, overrides?)` (unique slug by default) and `createTwoSchools(db)` → `{ schoolA, schoolB }`.

### Unit — `tests/unit/tenant-host.test.ts` (`it.each` tables)
| Case | Input host | Options | Expected |
|---|---|---|---|
| plain subdomain | `greenfield.lvh.me` | — | school `greenfield` |
| with port | `greenfield.lvh.me:3000` | — | school `greenfield` |
| uppercase | `GreenField.LVH.me` | — | school `greenfield` |
| trailing dot | `greenfield.lvh.me.` | — | school `greenfield` |
| hyphenated slug | `st-marys.lvh.me` | — | school `st-marys` |
| each reserved slug | `admin.lvh.me`, `www`… | no fallback | none |
| `www` with fallback | `www.lvh.me` | default `greenfield` | school `greenfield` |
| bare domain, no fallback | `lvh.me:3000` | — | none |
| bare domain, fallback | `lvh.me` | default `greenfield` | school `greenfield` |
| multi-level | `a.b.lvh.me` | — | none |
| foreign domain | `greenfield.example.com` | — | none |
| suffix trick | `greenfield.evillvh.me` | — | none |
| invalid slug chars / too short / leading hyphen | `gr_een.lvh.me`, `ab.lvh.me`, `-x.lvh.me` | — | none |
| empty / missing host | `''`, `undefined` | — | none |
| fallback ignored when subdomain present | `sunrise.lvh.me` | default `greenfield` | school `sunrise` |

Also a small unit test for `SLUG_PATTERN` / `RESERVED_SLUGS` boundaries (3 and 40 chars ok, 2 and 41 rejected).

### Integration (PGlite) — `tests/integration/`
- `db.test.ts` (tooling sample): migrations apply on a fresh PGlite; `schools` table exists; duplicate `slug` insert rejected; `status` defaults to `active`; factory `createTwoSchools` creates two distinct schools.
- `tenant-middleware.test.ts`:
  - known active school host → `GET /api/school` 200 with `{ slug, name }` of **that** school; response has no `id`/`status`.
  - two schools: `schoolA` host returns A, `schoolB` host returns B (cross-tenant).
  - unknown slug → 404 "School not found".
  - suspended school → 403 "School suspended".
  - reserved subdomain (`admin.`) → 404 even if a school with that slug existed in the DB.
  - bare domain with `defaultSchoolSlug` set → that school; without it → 404.
  - `?schoolId=<B's id>` / `x-school` style overrides on A's host are ignored → still A.
  - asset path (`/_nuxt/x.js`) on an unknown host is not blocked by the middleware.
  - cache: status change is picked up after `clearTenantCache()` (no stale suspended/active leak between tests).
- `tenant-utils.test.ts`: `requireTenant` returns the context school; throws 404 when context is empty.

### Nuxt component — `tests/nuxt/`
- `SchoolBrand.test.ts` (tooling sample): `registerEndpoint('/api/school', …)` → renders the school name in `[data-testid=school-name]`; hidden when collapsed.
- `index-page.test.ts`: "Welcome to {school name}".
- `error-page.test.ts`: 404 → not-found, 403 "School suspended" → suspended, other 403/500 → generic.
- `layouts.test.ts`: default layout renders sidebar + slot content; print layout renders slot content.

### E2E (Playwright, desktop + mobile projects) — `tests/e2e/`
- `home.spec.ts` (tooling sample): `greenfield.lvh.me/` shows "Greenfield Academy" in `school-name`, dashboard layout visible.
- `tenant.spec.ts`:
  - `sunrise.lvh.me/` shows "Sunrise Schools" and not "Greenfield".
  - `nope.lvh.me/` → response status 404, `error-not-found` visible.
  - `hillside.lvh.me/` → response status 403, `error-suspended` visible.
- `layout.spec.ts`: desktop — sidebar visible and collapses via toggle; mobile — sidebar hidden, `sidebar-toggle` opens it, no horizontal scroll at 375px.

## Implementation sub-steps
Each ends with `pnpm check` green, a summary, browser checks and a commit message.
1. **Scaffold** — `git init`, Nuxt 4 + Nuxt UI app, TS strict, ESLint, `.gitignore`, `.env.example`, base `app.vue`/`app.config.ts`; scripts for lint/typecheck.
2. **Test tooling** — Vitest projects, one placeholder-free sample per layer wired as each layer gets real code; `pnpm check` script; Playwright config + desktop/mobile projects.
3. **Database** — Drizzle config, `schools` schema + first migration, `db.ts` (`useDb`/`setDb`), PGlite helper, school factories, seed script; `db.test.ts`.
4. **Tenant resolution** — constants, `resolveTenantSlug` (unit tests first), `00.tenant.ts`, `tenant.ts`, `GET /api/school`, integration tests.
5. **Layouts & error page** — default/auth/print layouts, `SchoolBrand`, index page, `error.vue`; Nuxt + E2E tests.
6. **CI** — GitHub Actions workflow; confirm green on GitHub.
7. **Docs** — `PROGRESS.md`, `docs/decisions.md` (driver, test harness approach, env var names, school status codes), `docs/architecture.md` (new packages), manual test checklist.

## Acceptance checklist
- [ ] `pnpm dev` runs; `greenfield.lvh.me:3000` and `sunrise.lvh.me:3000` show their own school name in the layout
- [ ] Unknown subdomain shows the 404 "School not found" page; suspended school shows the suspended page
- [ ] `DEFAULT_SCHOOL_SLUG` fallback works on the bare domain
- [ ] Dashboard layout renders on desktop and 375px mobile
- [ ] Auth and print layouts exist
- [ ] Theme colours configured in `app.config.ts`
- [ ] `pnpm db:generate` / `db:migrate` / `db:seed` work; seed is re-runnable
- [ ] `pnpm check` green; `pnpm test:e2e` green on both projects
- [ ] CI passes on GitHub
- [ ] `PROGRESS.md` and `docs/decisions.md` updated

## Open questions
1. **Env var names.** Nuxt only overrides `runtimeConfig` at runtime from `NUXT_`-prefixed vars; a plain `DEFAULT_SCHOOL_SLUG` read via `process.env` in `nuxt.config.ts` would be **baked in at build time**. I recommend `NUXT_DEFAULT_SCHOOL_SLUG` and `NUXT_APP_DOMAIN` (and plain `DATABASE_URL`, since drizzle-kit and the seed read it too), and updating `docs/multi-tenancy.md` accordingly. OK?
2. **Integration test harness.** To run API tests against PGlite in-process (fast, no Docker, no Nuxt build per file), server files will **explicitly import** h3/util functions (`import { defineEventHandler } from 'h3'`, `import { useDb } from '~~/server/utils/db'`) rather than rely solely on Nitro auto-imports, and tests mount handlers in a plain h3 app with an injected DB. The alternative (`@nuxt/test-utils` `setup({ server: true })`) boots a full Nuxt server per file and can't use PGlite easily. I recommend the in-process approach and will log it as a decision. OK?
3. **Status codes for blocked tenants.** Unknown → 404, suspended → 403 with a "School suspended" page. OK, or would you prefer 503 for suspended?
4. **Third seeded school.** I've added `hillside` (suspended) so the suspended page is demoable/E2E-testable without manual DB edits. Keep it?
5. **Theme.** Primary `green` (Nigerian flag), neutral `slate`. Any brand colour you'd rather use?
6. **Bare domain with no fallback** (`lvh.me:3000`) shows the 404 page until the marketing/signup site in Phase 12. OK?
7. **Git & GitHub.** The folder isn't a git repo yet. I'll `git init` in sub-step 1; for "CI passes" I need a GitHub repo — will you create it and add the remote, or should I use `gh repo create` (private)?
8. **Stray file.** There's a `multi-tenancy.md` at the repo root identical to `docs/multi-tenancy.md`. Delete the root copy?
9. **New packages** listed in the "NOT on the approved list" table — approve `postgres`, `typescript`, `vue-tsc`, `tsx`, and (optional) `@iconify-json/lucide`? I'll add the approved ones to `docs/architecture.md`.
