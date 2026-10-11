# Architecture & Conventions

## Stack (approved packages)
- **Nuxt** (latest stable, v4 `app/` directory structure), TypeScript strict, **pnpm**
- **Nuxt UI** (latest) + Tailwind CSS; icons via Iconify (`i-lucide-*`)
- **PostgreSQL** + **Drizzle ORM** + drizzle-kit migrations; **postgres** (postgres.js) driver in dev/prod
- **@electric-sql/pglite** — in-memory Postgres for fast, isolated tests (same dialect as production)
- **nuxt-auth-utils** — sealed cookie sessions, `hashPassword` / `verifyPassword`
- **Zod** — shared schemas for `UForm :schema` on the client and `readValidatedBody` / `getValidatedQuery` on the server
- **@vueuse/nuxt**, **@nuxt/eslint**, **@nuxt/image**
- **Vitest**, **@nuxt/test-utils**, **@vue/test-utils**, **happy-dom**, **@playwright/test**
- **h3** (1.15.x, same version Nitro uses) — imported explicitly in server code so API routes can be integration-tested in a plain h3 app
- **typescript** (pinned to 6.0.x until typescript-eslint supports TS 7) + **vue-tsc** for `nuxt typecheck`; **tsx** to run the seed script; **@iconify-json/lucide** (icons bundled locally)
- Pinia (`@pinia/nuxt`) only if `useState`/composables become insufficient — ask first.

## Folder layout
```
app/
  pages/               # route pages, grouped by feature folder
  components/<feature>/
  composables/
  layouts/             # default (dashboard), auth, print
  middleware/          # auth + role guards (client)
  pages/platform/      # (Phase 11) platform admin area
server/
  middleware/          # 00.tenant.ts — resolves school from subdomain
  api/<feature>/       # Nitro routes: index.get.ts, [id].patch.ts, ...
  api/platform/        # (Phase 11) platform-only routes, outside tenant scope
  database/
    schema/            # one file per feature, re-exported from index.ts
    migrations/
    seed/
  services/            # business logic (pure where possible) — results, fees, promotion
  utils/               # db, tenant (requireTenant + scoped queries), requireRole, errors, pagination
shared/
  schemas/             # Zod schemas (client + server)
  types/
  constants/           # roles, states of Nigeria, default grading scales
tests/
  unit/                # pure logic (services, utils, schemas)
  integration/         # API routes against PGlite
  nuxt/                # components & composables (Nuxt environment)
  e2e/                 # Playwright journeys; e2e/support/ holds globalSetup (E2E database) and URL helpers
  factories/           # test data builders (createStudent, createClassArm, ...)
  helpers/             # PGlite test DB, in-process h3 test app, #imports stand-in (decision 006)
docs/
```

## Conventions
- **Business logic lives in `server/services/`** as plain, testable functions. API routes stay thin: validate → authorise → call service → return.
- **Multi-tenancy:** follow `docs/multi-tenancy.md`. `schoolId` comes only from `event.context.school`; tenant tables are queried only through `server/utils/tenant.ts` helpers; cross-school lookups return 404.
- Every API route: resolve tenant with `requireTenant(event)`, Zod-validate input, call `requireRole(event, [...roles])`, return typed data, throw `createError` with proper status codes (400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict).
- Database access only on the server. Use transactions for multi-table writes (admission, payments, promotion, publishing results).
- Every school-owned table has a non-null `schoolId` FK, `createdAt`, `updatedAt`; unique constraints and main indexes start with `schoolId`. Students, staff and payments are **soft-deleted** (`deletedAt`).
- **Money is integer kobo** (₦1 = 100 kobo). Format with `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })`. Never use floats for money.
- Dates shown as `DD/MM/YYYY`, timezone `Africa/Lagos`.
- Use Nuxt UI components (`UDashboardGroup` & related dashboard components, `UTable`, `UForm`, `UModal`, `USlideover`, `useToast`) rather than custom ones.
- Mobile-first and lightweight: paginate tables server-side, avoid heavy libraries, keep pages fast on slow networks.
- Add `data-testid` attributes to key interactive elements to keep E2E selectors stable.
- Uploaded files are stored under `schools/<schoolId>/…` and served only after a tenant check.
- Shared app data with an explicit `useFetch` key lives in a composable (e.g. `useSchool()` → `GET /api/school`, key `school`).
- Check APIs with the Nuxt and Nuxt UI MCP servers (`.mcp.json`) before relying on memory.
- Printable pages (report cards, receipts, broadsheets) use a dedicated `print` layout with A4 print CSS — no PDF library in the MVP.
