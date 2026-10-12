# Testing Strategy

Testing is part of building, not a separate phase. A sub-step is not done until its tests exist and `pnpm check` is green.

## Test layers
| Layer | Tool | Location | What it covers |
|---|---|---|---|
| Unit | Vitest (node env) | `tests/unit/` | Pure logic in `server/services/` and `shared/`: grading, result computation, ranking, fee balances, admission numbers, Zod schemas, formatters |
| Integration (API) | Vitest + PGlite | `tests/integration/` | Every API route against an in-memory Postgres with real migrations applied: validation, auth, role permissions, DB effects |
| Nuxt (component) | Vitest + `@nuxt/test-utils` (`mountSuspended`) | `tests/nuxt/` | Composables and components with real logic (score-entry grid, forms, role-based nav) |
| End-to-end | Playwright | `tests/e2e/` | Critical user journeys in a real browser, desktop **and** mobile (375px) viewports |

Use Vitest **projects** so unit/integration run in the fast node environment and only `tests/nuxt/` uses the Nuxt environment.

## Rules
1. **Test-first for business logic.** For anything in `server/services/` (grading, results, ranking, fees, promotion): write failing tests from `docs/domain.md` first, then implement.
2. **Every API route gets integration tests** for at least: unauthenticated → 401; wrong role → 403; invalid input → 400 with field errors; happy path → correct response **and** correct DB state; not found → 404 where applicable.
3. **Permission matrix tests:** for each feature, a table-driven test asserting which roles can access each route (`it.each`). A teacher must not read/write another teacher's subject scores; a parent must not see another family's child; a bursar must not touch scores.
4. **Edge cases are mandatory** where relevant: ties in ranking, a student with missing scores, zero scores vs blank, scores above max, grading-band boundaries (39/40, 74/75, 100), partial payments, overpayment, carried-forward arrears, discount > bill, soft-deleted records, a student who changes arm mid-session.
5. **Isolated tests.** Each integration test file gets a fresh PGlite database (migrations applied). Use factories in `tests/factories/` — no reliance on seed data or test order. Integration tests simulate the tenant by setting the request host (e.g. `greenfield.lvh.me`).
6. **No fake passes.** Never skip, `.only`, delete, or loosen assertions to get green. Never mock the thing under test. Mock only external boundaries (time via `vi.useFakeTimers`, future SMS/payment gateways).
7. **Regression tests for bugs.** Every bug fixed gets a test that fails before the fix and passes after.
8. **E2E stays focused.** Only critical journeys (below); use `data-testid` selectors; seed via API/factories in `beforeEach`; run on desktop + mobile projects. Both projects share one E2E database in parallel: use unique names per run/project, clean up what a test creates, and let only one project change school-wide state (decision 024). Use `gotoHydrated()` before clicking on a freshly loaded page.
9. **Cross-tenant tests on every route.** Factories always create **two schools**. For each route assert: a School B user cannot read, list, update or delete School A records (expect 404, and no DB change); list endpoints never return another school's rows; a School A session sent to School B's host is rejected (401); injecting `schoolId` in a body or query is ignored.
10. **Coverage:** aim for ≥ 90% on `server/services/` and `shared/`; don't chase coverage on UI glue.

## Critical E2E journeys (grow as phases complete)
- Tenant isolation: logged in on `greenfield.lvh.me`, visiting `sunrise.lvh.me` requires a fresh login and shows only Sunrise data; unknown subdomain shows the 404 page
- Login and logout for each role; redirected away from pages the role can't access
- Admin sets up session/term, class arms and subjects
- Admin admits a student with a guardian; parent can log in
- Class teacher takes attendance on a mobile viewport
- Subject teacher enters scores → class teacher submits → principal publishes → parent sees the report card
- Bursar generates bills, records a partial payment, prints a receipt; balance and debtors list update
- End-of-session promotion moves students to the next class

## Before finishing any sub-step
Run `pnpm check`. Before finishing a phase, also run `pnpm test:e2e`. Report the test counts (passed/failed/skipped) in your summary.
