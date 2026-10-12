# Progress

## Current status
- **Current phase:** Phase 2 — School setup — all sub-steps done; awaiting push + CI and your manual check
- **Last updated:** 2026-10-12

## Completed phases
<!-- For each finished phase:
### Phase N — Name (date)
- Built: ...
- Tests added: ... (unit / integration / e2e counts)
- Decisions: see docs/decisions.md #...
- Known issues / tech debt: ...
-->

### Phase 2 — School setup (2026-10-12)
- Built: school profile + logo (Nitro fs storage, signature check, tenant-scoped serving); sessions with three terms, term dates, atomic set-current (DB partial unique indexes); class levels (reorder) and arms; SSS departments and per-section subjects; assessment split (sum 100) and grading scales (contiguous 0–100) with atomic replacement; `applySchoolDefaults` for new schools; five admin settings pages, School setup nav group, current session/term in the top bar, logo in sidebar and login; demo seed (Greenfield 2026/2027 First Term current, arms, subjects; Sunrise own arms).
- Tests (totals): 179 unit / 333 integration (PGlite) / 32 Nuxt component / 24 E2E tests x desktop + mobile (4 viewport-specific skips).
- Decisions: see docs/decisions.md #015–#020
- Bugs found while building: Zod schema proxied by useOverlay made dialog Save silently fail (E2E; fixed with markRaw); tenant cache showed a renamed school's old name for 30s (fixed with forgetTenantSchool); TS2321 with typed $fetch callbacks (convention in architecture.md).

### Phase 1 — Authentication & roles (2026-10-11)
- Built: `users` table (first tenant table) + `whereSchool()` scoping; nuxt-auth-utils sessions bound to the school (host-only cookie, `secure.schoolId`, `fetch` hook + `requireUser` reject foreign sessions); `requireUser` / `requireRole` re-load the user per request; login (generic 401, disabled 403, throttled 429), logout, change password, admin users list + temporary-password reset with forced change; login/change-password/Users pages, global auth middleware with role page meta, role-based sidebar nav, user menu; seeded users per role (+ inactive, + Sunrise admin; password `password123`).
- Tests (totals): 97 unit / 80 integration (PGlite) / 22 Nuxt component / 18 E2E tests × desktop + mobile (33 run, 3 viewport-specific skips).
- Decisions: see docs/decisions.md #010–#014
- Security fixes found while building: foreign-school session visible via `/api/_auth/session` (fixed with the `fetch` hook); an early (pre-hydration) login submit would have put the password in the URL (forms now `method="post"`, submit disabled until hydrated).

### Phase 0 — Project setup (2026-10-11)
- Built: Nuxt 4 + Nuxt UI app (TS strict, ESLint), Drizzle + Postgres with `schools` table, migrations and idempotent seed (greenfield, sunrise, hillside-suspended); tenant foundation (`resolveTenantSlug`, `00.tenant.ts` middleware with 30s cache, `requireTenant`, `GET /api/school`, `NUXT_DEFAULT_SCHOOL_SLUG` fallback); dashboard/auth/print layouts, `SchoolBrand`, `useSchool()`, tenant error page (404 not found / 403 suspended); four test layers; GitHub Actions CI (check + E2E on Postgres 18); Nuxt and Nuxt UI MCP servers in `.mcp.json`.
- Tests added: 52 unit / 22 integration (PGlite) / 10 Nuxt component / 6 E2E tests × desktop + mobile (10 run, 2 viewport-specific skips). CI green.
- Decisions: see docs/decisions.md #005–#009
- Known issues / tech debt: see below

## Next up
- Push Phase 2 and confirm CI; then Phase 3 — Staff management (spec first)

## Known issues / tech debt
- `typescript` pinned to 6.0.x until typescript-eslint supports TS 7.
- Nuxt-environment tests: first `mountSuspended` per file takes 20–35s on the dev machine (cold Nuxt app boot); `nuxt` Vitest project raised to `testTimeout` and `hookTimeout: 60_000`. Investigate if the nuxt suite gets slow.
- Unit project has `hookTimeout: 60_000`: PGlite boot + migrations in `beforeAll` exceeds 10s when several integration files start in parallel.
- Nuxt 5 / `future.compatibilityVersion: 5`: errors thrown in server middleware return JSON instead of rendering `error.vue` (nuxt.com error-handling docs). The tenant 404/403 pages rely on today's behaviour — revisit `00.tenant.ts` before upgrading.
- Sessions are sealed cookies (nuxt-auth-utils): logout can't revoke a copied cookie server-side; it stays valid until it expires (7 days). Deactivating the user does revoke it (`requireUser` checks the DB). If needed later: a `sessionVersion` column checked in `requireUser`, bumped on logout/password change.
- Login throttle is in-memory (single instance) and uses the socket IP (`getRequestIP` without `X-Forwarded-For`). Behind a reverse proxy, all users share the proxy's IP and the per-IP cap (50 failures / 15 min) would apply to everyone. Revisit both when choosing hosting.
- Production build got slow on the dev machine (3+ min, mostly the Nitro step; ~1 min in Phase 0). Playwright webServer timeout raised to 10 min and `expect` timeout to 10 s (scrypt logins under parallel browsers take seconds). Investigate the Nitro build time if it keeps growing.
- TypeScript TS2321 ("excessive stack depth") with typed `$fetch` (~45 routes): a callback typed `() => Promise<unknown>` that returns a `$fetch(...)` call makes TS compare the route-inferred response type and overflow. Type such callbacks as `() => unknown` (see `NameDialogOptions.submit`, `run()` in settings pages). Watch for it as routes grow.
