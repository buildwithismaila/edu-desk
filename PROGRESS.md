# Progress

## Current status
- **Current phase:** Phase 10 complete — the MVP phases (1–10) are done. Phases 11–13 (SaaS) start only after a pilot school completes a full term (docs/roadmap.md).
- **Last updated:** 2026-10-14

## Completed phases
<!-- For each finished phase:
### Phase N — Name (date)
- Built: ...
- Tests added: ... (unit / integration / e2e counts)
- Decisions: see docs/decisions.md #...
- Known issues / tech debt: ...
-->

### Phase 10 — Dashboards & promotion (2026-10-14)
- Built: staff dashboard (`/api/dashboard`, `DashboardStats`): students by section and gender, today's attendance (taken / not taken, rate), term fees (expected, collected, outstanding, %, today, debtors) and result-entry progress (sheets complete, arms by status), from the detail services; bursar gets students and fees only. End-of-session promotion per class arm: `promotion_runs` (unique per arm and session) and `student_promotions`; default placement (next level's same-name arm, across sections; last level graduates); repeat / withdraw / graduate exceptions; one transaction; already-enrolled students skipped; undo until the next session is current; session delete guard; `/promotion` and `/promotion/[armId]` (outcome and class per student, set all, summary, confirm, undo), profile outcome badge, Promotion in the School setup nav; seed: SSS 3A (3 students) and the 2027/2028 session.
- Tests (totals): 1330 unit + integration (PGlite) / 94 Nuxt component / 59 E2E tests × desktop + mobile (viewport-specific and desktop-only skips), plus the school-state project.
- Decisions: see docs/decisions.md #040–#041
- Found while building: deleting a session that only has graduation records would have hit a foreign-key error (now a 409 guard, tested); the seed-twice tests in `db.test.ts` hit the 5s default as the demo grew (comment upserts batched, and those two tests now have an explicit 30s budget).

### Phase 9 — Parent portal (2026-10-14)
- Built: `requireOwnChild` (404 unless the parent's own, non-removed child in this school) at the start of every parent route; `/api/me/children` cards with this term's attendance, fee balance and latest published report card; child overview, published results list, attendance for any term, the term's bill (reversed payments flagged, no reasons, no ledger) and receipts under `/api/me/children/[id]/…`; dashboard child cards, `/my-children/[id]` with Results · Attendance · Fees tabs (tab kept in the URL), parent receipt page, shared `Receipt` component, read-only `BillSummary` for parents, report card "Back to my child"; seed: Primary 3A complete and published (Somto Eze's report card), Primary 3A registers.
- Tests (totals): 1277 unit + integration (PGlite) / 85 Nuxt component / 54 E2E tests × desktop + mobile (viewport-specific and desktop-only skips), plus the school-state project. New: the parent IDOR suite (every parent route × another family, removed child, another school, foreign payment, no session, staff roles).
- Decisions: see docs/decisions.md #039
- Spec change: parents' nav stays "Dashboard" only (the dashboard is the children list).
- Found while building: nothing in the app; a first E2E run had 4 unrelated failures from the machine sleeping mid-run (`ERR_NETWORK_IO_SUSPENDED`), all green on re-run.

### Phase 8 — Fees & payments (2026-10-13)
- Built: integer-kobo money helpers (`parseNaira`, `formatNaira`); fee items per class level per term (replace, copy between terms, optional items); idempotent bill generation with carry-forward of arrears/credit from the previous term; refresh (items on bills without payments, carry-forward on all); optional items and fixed/percent discounts (capped at the items); append-only payments with per-year receipt numbers (concurrency-safe), reversal with a reason, no edit/delete routes; receipts (printable A4, REVERSED stamp); student ledger across terms; debtors list (printable) and term collections (by level, method, day) that reconcile; bursar still kept out of academics (tested); optional outstanding-fees line on report cards (school setting, frozen on publish); pages: Fee items, Bills, student Fees, Receipt, Debtors, Collections; Fees nav group; seed: items for every level, bills for every student, payments in every state (full, part, credit, reversal, discount) and carried-forward arrears/credit.
- Tests (totals): 1254 unit + integration (PGlite) / 77 Nuxt component / 51 E2E tests × desktop + mobile (viewport-specific and desktop-only skips), plus the school-state project.
- Decisions: see docs/decisions.md #037–#038
- Found while building: the in-process test app answered unknown `/api` routes with 200 (a stand-in for Nuxt's renderer), so "payments have no edit route" couldn't be proven — unknown `/api` routes are now 404 as in Nitro; generated routes had wrong relative import depth (caught by the tests); the seed got slow again (fee inserts batched).

### Phase 7 — Results & report cards (2026-10-13)
- Built: pure results computation (subject totals with ABS = 0, averages over offered subjects, competition ranking by exact average, subject positions and stats, third-term cumulative average, completeness); Draft → Submitted → Published per (term, arm) with return-to-draft (reason) and unpublish; submitting needs complete sheets and locks scores; publishing stores frozen report-card snapshots; manual unlock refused while results hold the lock; principal's comments; report card and broadsheet API; `/results` (status per arm), arm page (completeness, ranked table, actions, principal's comments), printable A4 report cards (one per page), landscape broadsheet, single report card (parents too, published only), "Report card" link in My children, Results nav; guards for arms/sessions with results or locks; seed: every JSS 1A subject filled except Chidera's English Exam, a tie, principal's comments.
- Tests (totals): 1176 unit + integration (PGlite) / 71 Nuxt component / 48 E2E tests × desktop + mobile (viewport-specific and desktop-only skips).
- Decisions: see docs/decisions.md #034–#036
- Found while building: the results page used `<ResultsResultsActions>`, but Nuxt names `components/results/ResultsActions.vue` `ResultsActions` (a folder prefix repeated in the file name is dropped), so no workflow buttons showed — caught by E2E; `students/[id].vue` beside a new `students/[id]/` folder would have become a parent route (moved to `[id]/index.vue`); a failed E2E run left data that blocked the next (the journey now resets JSS 1A first, and re-seeding restores the demo gap); the school-setup E2E switched the current term while the results journey ran in parallel (the switch now lives in `current-term.spec.ts`, in a `school-state` Playwright project that runs after desktop and mobile); the seed got slow enough to time out a test (score and rating inserts batched).

### Phase 6 — Score entry (2026-10-13)
- Built: score sheets per (term, arm, subject) with one row per component cell, explicit ABS, whole numbers 0…max; bulk save of changed cells in one transaction with per-cell errors; subject-teacher access to assigned pairs (current term), admin/principal cover (any term of the current session), earlier sessions read-only; manual lock/unlock per (term, arm) covering scores, ratings and comments; SSS department filtering; Nursery skill ratings; class teacher's trait ratings (1–5) and comments; assessment split frozen once scores exist; subject/session delete guards; `/scores` (sheets with progress and locks), keyboard `ScoreGrid` (Enter/↓/↑/Tab, live total and grade, unsaved-changes guard), `/scores/ratings`, My classes score progress, Scores nav; seed: JSS 1A Maths complete (one ABS), JSS 1B Maths half, JSS 1A ratings, Nursery 1A Numeracy, Sunrise sheet.
- Tests (totals): 1099 unit + integration (PGlite) / 63 Nuxt component / 45 E2E tests × desktop + mobile (viewport-specific and desktop-only skips).
- Decisions: see docs/decisions.md #032–#033
- Found while building: nothing new in the app; one E2E locator filtered by text that the action itself changed (fixed in the test).

### Phase 5 — Attendance (2026-10-12)
- Built: daily registers per class arm (DB-unique per arm and day, concurrent-safe), present/absent/late with everyone present by default; class teacher takes and edits today's register for their arm; admin/principal back-fill or correct any date in the current term and delete mistaken registers; complete-register validation; term summary per arm and per student (late counts as present, marks across arms); `/attendance` (one-tap mobile register, sticky save), `/attendance/summary`, attendance card on the student profile, register status + "Take register" in My classes, Attendance nav; delete guards for arms/sessions with attendance; seed: 10 past JSS 1A registers at Greenfield, 2 at Sunrise; E2E setup widens the current term to include the run date.
- Tests (totals): 1004 unit + integration (PGlite) / 57 Nuxt component / 41 E2E tests × desktop + mobile (viewport-specific and desktop-only skips).
- Decisions: see docs/decisions.md #030–#031
- Found while building: a bare `$fetch` inside `useAsyncData` during SSR doesn't forward the request, so the tenant was unknown ("School not found") — caught by E2E, fixed with `useRequestFetch()`.

### Phase 4 — Students & guardians (2026-10-12)
- Built: students with per-session enrolment, admission numbers `PREFIX/YEAR/NNNN` (per-year counter, manual numbers allowed, prefix on School profile); guardians as parent accounts (phone required and unique, email optional), siblings sharing guardians; login by email or phone; admission in one transaction with existing or new guardians (temporary password shown once) and optional photo; paginated, searchable, filterable list (URL query) scoped by role (teacher: own arms; bursar: no personal details; parent: own children only, 404 elsewhere); profile with edit, change class, private photo, add/edit/unlink guardian, guardian password reset, remove (soft); CSV import with dry run, row-level errors and all-or-nothing commit, template download; "My children" on the parent dashboard; Students nav; arm/session delete guards; seed: 40 Greenfield students (siblings, shared guardians), 3 Sunrise students.
- Tests (totals): 912 unit + integration (PGlite) / 51 Nuxt component / 37 E2E tests × desktop + mobile (74 listed; viewport-specific and desktop-only skips).
- Decisions: see docs/decisions.md #025–#029
- Found while building: the login page sent the parsed form data (`login` as `{ email }`/`{ phone }`), so every login failed — caught by E2E, fixed, now covered by a Nuxt test; typed `useFetch` on `/api/students/${id}` inferred `{}` (also matches `/api/students/import`); Vitest workers crashing natively under memory pressure (decision 029).

### Phase 3 — Staff management (2026-10-12)
- Built: staff accounts on `users` (phone, soft delete); add with one-time temporary password, edit, role change, deactivate/reactivate, remove; self and last-active-admin guards (row-locked); class-teacher and subject-teacher assignments per session (DB one-per rules, section and eligibility checks, cascades); `/api/me/assignments`; Staff page (replaces Users; `/users` redirects), staff detail, Assignments page with gap warnings, My classes on the dashboard, role-based nav; seed: five more teachers and demo assignments with gaps.
- Tests (totals): 202 unit / 456 integration (PGlite) / 38 Nuxt component / 30 E2E tests x desktop + mobile (4 viewport-specific skips).
- Decisions: see docs/decisions.md #021–#024
- Found while building: the last-admin guard is only reachable by concurrent requests (now row-locked); E2E clicks before hydration did nothing (added `gotoHydrated`).

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
- Phase 9 — approve the spec, then sub-step 1 (requireOwnChild, parent routes and the IDOR suite)

## Known issues / tech debt
- `typescript` pinned to 6.0.x until typescript-eslint supports TS 7.
- Nuxt-environment tests: first `mountSuspended` per file takes 20–35s on the dev machine (cold Nuxt app boot); `nuxt` Vitest project raised to `testTimeout` and `hookTimeout: 60_000`. Investigate if the nuxt suite gets slow.
- Unit project has `hookTimeout: 60_000`: PGlite boot + migrations in `beforeAll` exceeds 10s when several integration files start in parallel.
- Nuxt 5 / `future.compatibilityVersion: 5`: errors thrown in server middleware return JSON instead of rendering `error.vue` (nuxt.com error-handling docs). The tenant 404/403 pages rely on today's behaviour — revisit `00.tenant.ts` before upgrading.
- Sessions are sealed cookies (nuxt-auth-utils): logout can't revoke a copied cookie server-side; it stays valid until it expires (7 days). Deactivating the user does revoke it (`requireUser` checks the DB). If needed later: a `sessionVersion` column checked in `requireUser`, bumped on logout/password change.
- Login throttle is in-memory (single instance) and uses the socket IP (`getRequestIP` without `X-Forwarded-For`). Behind a reverse proxy, all users share the proxy's IP and the per-IP cap (50 failures / 15 min) would apply to everyone. Revisit both when choosing hosting.
- Production build got slow on the dev machine (3+ min, mostly the Nitro step; ~1 min in Phase 0). Playwright webServer timeout raised to 10 min and `expect` timeout to 10 s (scrypt logins under parallel browsers take seconds). Investigate the Nitro build time if it keeps growing.
- TypeScript TS2321 ("excessive stack depth") with typed `$fetch` (~45 routes): a callback typed `() => Promise<unknown>` that returns a `$fetch(...)` call makes TS compare the route-inferred response type and overflow. Type such callbacks as `() => unknown` (see `NameDialogOptions.submit`, `run()` in settings pages). Watch for it as routes grow.
- `pnpm test:unit` takes ~3.5 min (34 files; each integration file boots PGlite and runs migrations, and permission matrices log in many users with real scrypt). If it keeps growing: share one migrated PGlite per worker (template DB), or lower scrypt cost in the test runtime config only.
- E2E needs a production build (~3.5 min, up to 10+ min when the machine is busy, e.g. with `pnpm dev` running). Tip: `pnpm build`, start `.output/server/index.mjs` on port 3100 with the E2E env from `playwright.config.ts`, and Playwright reuses it locally.
- Vitest unit workers crashed natively (exit 0x80000003, "Fatal process out of memory: Zone") while V8 tiered PGlite's WASM up to TurboFan in several workers at once on this 8 GB machine. Fixed with `execArgv: ['--liftoff-only']` on the unit project (baseline WASM compiler only; also ~20% faster). With 3 workers it still sometimes ran out of memory (`WebAssembly.Memory(): could not allocate memory`, scrypt "Deriving bits failed"), so `maxWorkers: 2` too. It still happens occasionally when the machine is busy (e.g. `pnpm dev` + browser open): "Zone Allocation failed" in a worker starting a file; rerun. Real fix (not done): one migrated PGlite per worker reused across files (`isolate: false` + a template database), which also cuts the ~4 min run time.
- `users.email` is nullable since Phase 4 (guardians may have a phone only); staff always have one (createStaffSchema requires it).
