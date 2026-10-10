# Edu Desk — School Management System (MVP)

MVP school management app for Nigerian private schools with Nursery, Primary and Secondary (JSS/SSS) sections. Built **multi-tenant-ready** (many schools, one app, fully isolated) so it can become a SaaS. Built with Nuxt, Nuxt UI and the Nuxt ecosystem, **one phase at a time**, with tests written alongside every feature.

## Docs index — read the relevant file before working on a task
| File | Read it when |
|---|---|
| `PROGRESS.md` | **Start of every session** — what's done, what's next, known issues |
| `docs/roadmap.md` | Starting or planning a phase (scope, acceptance criteria, required tests) |
| `docs/architecture.md` | Writing any code (stack, folder layout, conventions, patterns) |
| `docs/domain.md` | Anything touching classes, terms, scores, grading, results, fees, roles |
| `docs/multi-tenancy.md` | Anything touching data access, sessions, routing by subdomain, schools, files, or SaaS features |
| `docs/testing.md` | Writing or running tests (strategy, tools, what must be tested) |
| `docs/decisions.md` | Making or questioning a technical decision; append new decisions here |
| `docs/features/` | One spec per phase, written by you during planning, approved by me |

## How we work (always follow)
1. **One phase at a time.** Only work on the phase I name. Never build features from later phases.
2. **Spec before code.** At the start of a phase, write `docs/features/NN-<name>.md` (goal, user stories, schema changes, API routes, pages/components, test plan, open questions). **Stop and wait for my approval.**
3. **Small sub-steps, test as you go.** For each sub-step: write/update tests → implement → run `pnpm check` → fix until green → summarise what changed + what I should check in the browser → suggest a conventional commit message.
4. **Never** skip, delete, `.only`, or weaken a test to make it pass. If a test seems wrong, explain why and ask me.
5. **Verify against current docs.** Check nuxt.com / ui.nuxt.com / orm.drizzle.team when unsure about an API. Don't guess from memory.
6. **Ask before installing** any package not listed in `docs/architecture.md`.
7. **Tenant isolation is non-negotiable.** `schoolId` comes only from `event.context.school` — never from client input. All tenant data access goes through the scoped helpers in `server/utils/tenant.ts`. Every route gets a cross-tenant test.
8. **Keep it MVP.** Simplest thing that works. No unrequested features or abstractions.
9. **Keep docs alive.** End of each phase: update `PROGRESS.md`, append decisions to `docs/decisions.md`, and update `docs/domain.md` / `docs/architecture.md` if anything changed.
10. If these docs seem wrong or a better approach exists, say so — don't silently deviate.

## Commands
- `pnpm dev` — dev server; open `http://greenfield.lvh.me:3000` (seeded demo school) or `http://sunrise.lvh.me:3000` (second school for isolation checks)
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` — Drizzle migrations + seed
- `pnpm test:unit` — Vitest unit + server/API integration tests
- `pnpm test:nuxt` — Vitest component/composable tests in the Nuxt environment
- `pnpm test:e2e` — Playwright end-to-end tests
- `pnpm typecheck` / `pnpm lint`
- `pnpm check` — lint + typecheck + unit + nuxt tests (run after **every** sub-step)
- Run `pnpm test:e2e` at the end of every phase and whenever a phase touches a critical flow.

## Definition of done (every phase)
- Acceptance criteria in `docs/roadmap.md` met and checked off in the phase spec.
- Required tests from the roadmap written and passing; `pnpm check` and `pnpm test:e2e` green.
- Works on desktop and a 375px-wide mobile screen.
- Every server route validates input, enforces roles and tenant isolation, and has tests proving all three.
- Seed data updated so the feature is demoable immediately.
- `PROGRESS.md` updated; a short manual test checklist given to me.
