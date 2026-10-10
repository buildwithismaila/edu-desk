# Progress

## Current status
- **Current phase:** Phase 0 — Project setup (in progress: sub-steps 1–2 done — scaffold, test tooling)
- **Last updated:** 2026-10-10

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
- `pnpm-workspace.yaml` has a TEMPORARY `minimumReleaseAgeExclude` for nuxt 4.6.1 packages (fixes Windows dev 500 in 4.6.0). Remove after 2026-10-11.
- `typescript` pinned to 6.0.x until typescript-eslint supports TS 7.
- `test:unit` uses `--passWithNoTests` until the first unit/integration tests land (sub-step 3) — remove it then.
- Nuxt-environment tests: first `mountSuspended` per file takes ~10s (cold Nuxt app boot); `nuxt` Vitest project has `testTimeout: 30_000`. Investigate if the nuxt suite gets slow.
