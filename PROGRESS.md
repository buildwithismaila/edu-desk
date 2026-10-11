# Progress

## Current status
- **Current phase:** Phase 0 — Project setup (in progress: sub-steps 1–5 done — scaffold, test tooling, database, tenant resolution, layouts & error page)
- **Last updated:** 2026-10-11

## Completed phases
<!-- For each finished phase:
### Phase N — Name (date)
- Built: ...
- Tests added: ... (unit / integration / e2e counts)
- Decisions: see docs/decisions.md #...
- Known issues / tech debt: ...
-->

## Next up
- Phase 0 — Project setup

## Known issues / tech debt
- `typescript` pinned to 6.0.x until typescript-eslint supports TS 7.
- Nuxt-environment tests: first `mountSuspended` per file takes 20–35s on the dev machine (cold Nuxt app boot); `nuxt` Vitest project raised to `testTimeout: 60_000` in sub-step 3. Investigate if the nuxt suite gets slow.
- Unit project has `hookTimeout: 60_000`: PGlite boot + migrations in `beforeAll` exceeds 10s when several integration files start in parallel.
- E2E uses its own database (`edudesk_test`, created by Playwright `globalSetup`; override with `E2E_DATABASE_URL`). Playwright's webServer waits on the port, not a URL, because a bare-IP host has no school and answers 404.
