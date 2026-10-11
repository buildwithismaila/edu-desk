# Phase 1 — Authentication & roles

**Status:** Done 2026-10-11 · Approved 2026-10-11 (all open-question recommendations accepted)
**Roadmap ref:** `docs/roadmap.md` → Phase 1

## Goal
School users log in on their school's subdomain with email + password. The session is bound to that school, every protected route checks role on the server, and each role sees only its own navigation. Admins can reset a user's password; users can change their own. No staff/parent management yet (Phases 3–4).

## User stories
- As **any user**, I log in at `<school>.lvh.me/login` with my email and password and land on the dashboard; I can log out from the sidebar.
- As **any user**, a wrong email or password shows one generic error ("Invalid email or password"), so the form doesn't reveal which accounts exist.
- As a **deactivated user**, I can't log in, and an existing session stops working on my next request.
- As **any user**, my Greenfield session does not log me in on `sunrise.lvh.me`; I must log in there separately (with a Sunrise account).
- As **any user**, I can change my password (current password required).
- As an **admin**, I see a Users page listing my school's users and can reset a user's password. I'm shown a one-time temporary password to pass on; the user must change it at next login.
- As a **non-admin**, opening an admin-only page redirects me to the dashboard with a "You don't have access to that page" toast; calling an admin API returns 403.
- As a **visitor** who isn't logged in, any page except `/login` redirects me to `/login?redirect=<page>`, and I return there after logging in.

## Roles
`shared/constants/roles.ts`: `ROLES = ['admin', 'principal', 'bursar', 'teacher', 'parent'] as const` with display labels (Admin / Proprietor, Principal / Head Teacher, Bursar, Teacher, Parent / Guardian). Class vs subject teacher is an *assignment* (Phases 3 and 6), not a role. Principal's section scope comes with Phase 2/3.

## Schema changes
New file `server/database/schema/users.ts`; the first **tenant table**.

```ts
export const userRole = pgEnum('user_role', ROLES)

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: uuid().notNull().references(() => schools.id, { onDelete: 'restrict' }),
  email: text().notNull(),               // stored trimmed + lowercase
  name: text().notNull(),
  role: userRole().notNull(),
  passwordHash: text().notNull(),         // scrypt via nuxt-auth-utils
  isActive: boolean().notNull().default(true),
  mustChangePassword: boolean().notNull().default(false),
  lastLoginAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, t => [unique('users_school_email_unique').on(t.schoolId, t.email)])
```
- The unique index starts with `schoolId`, so it also serves "users of this school" queries.
- `deletedAt` (soft delete) is added with staff management in Phase 3.
- Migration `0001_users` via `pnpm db:generate`.

## Session design (nuxt-auth-utils 0.5.31)
- Sealed cookie `nuxt-session`, host-only (no `Domain` attribute), `SameSite=Lax`, `Secure` in production, `maxAge` 7 days (see open question 6).
- Session data: `user: { id, name, role, mustChangePassword }` (sent to the client) and `secure: { schoolId }` (server-only; excluded from `/api/_auth/session`).
- Types augmented in `shared/types/auth.d.ts` (`#auth-utils` → `User`, `SecureSessionData`).
- `NUXT_SESSION_PASSWORD` (≥ 32 chars): added to `.env.example`. In dev the module writes one to `.env` if missing; Playwright and CI pass a fixed test value.

### Tenant binding
- **`server/plugins/session-tenant.ts`** registers `rejectForeignSession` on nuxt-auth-utils' `fetch` hook. When `/api/_auth/session` (also used by SSR) sees a session whose `secure.schoolId` isn't the host's school, it clears the session and returns 401. (Browsers won't send a host-only cookie to another subdomain anyway; this handles copied or replayed cookies.) *Changed during implementation:* the spec had a `01.session.ts` middleware, but h3 re-reads the request cookie after `clearSession()`, so middleware can't hide the session from later handlers in the same request.
- **`requireUser(event)`** (`server/utils/auth.ts`):
  1. Calls `requireTenant`.
  2. Reads the session; 401 if there's none; 401 + clear the session if the school doesn't match.
  3. Loads the user **from the DB, scoped to the school**; 401 + clear the session if the user is missing or inactive.
  4. Returns the fresh user, so role and active-status changes take effect immediately (one indexed query per request).
- **`requireRole(event, roles)`**: `requireUser`, then 403 if the role isn't allowed.

## Scoped tenant helpers (`server/utils/tenant.ts`)
Added now that there's a real tenant table:
- `whereSchool(table, school, ...conditions)` → `and(eq(table.schoolId, school.id), ...conditions)`. Every query on a tenant table uses it.
- Inserts set `schoolId: requireTenant(event).id` explicitly; no helper needed yet.
- Integration tests prove a lookup by another school's id finds nothing.

## Passwords
- `hashPassword` / `verifyPassword` from nuxt-auth-utils (scrypt).
- Rule: minimum 8 characters, maximum 128 (`shared/schemas/auth.ts`). No complexity rules (NIST guidance).
- Temporary password on admin reset: `generateTemporaryPassword()` in `server/utils/password.ts`. 10 chars from an alphabet without look-alikes (no `0/O/1/l/I`), using `crypto.randomInt`.
- **Seed:** the seed script runs outside Nitro (`tsx`), where nuxt-auth-utils' `#imports` doesn't exist. So the seed stores a **precomputed scrypt hash** of the demo password (`server/database/seed/demo-password.ts`). An integration test proves `verifyPassword(DEMO_PASSWORD_HASH, DEMO_PASSWORD)` is true. The seed refuses to run when `NODE_ENV=production`.

## Login throttling
In-memory limiter in `server/utils/login-throttle.ts`: **5 failed attempts per (school, email) in 15 minutes → 429** "Too many attempts, try again in N minutes". It also caps attempts per IP at 50 / 15 min. A success clears the key. It's single-instance memory, which is fine for the MVP. Note in PROGRESS to move to shared storage if we scale out (see open question 5).

## API routes
All tenant-scoped via `requireTenant`. Bodies Zod-validated with `readValidatedBody` (400 with field errors). `schoolId` is never read from input.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{ email, password }`. Finds the user by `(school, lower(email))`, verifies the password, sets the session, updates `lastLoginAt`, returns `{ user }`. Unknown email or wrong password → 401 "Invalid email or password". Inactive + correct password → 403 "Your account is disabled. Contact your school admin." Throttled → 429. |
| POST | `/api/auth/logout` | any (idempotent) | Clears the session; 200 even if not logged in. |
| POST | `/api/auth/password` | any logged-in | `{ currentPassword, newPassword }`. Wrong current → 400 (field error); new = current → 400. Success: rehash, `mustChangePassword = false`, session `user` refreshed. |
| GET | `/api/users` | admin | Users of the current school: `id, name, email, role, isActive, mustChangePassword, lastLoginAt`, sorted by name. Never `passwordHash`/`schoolId`. No pagination yet (small staff lists; Phase 3 adds it). |
| POST | `/api/users/[id]/reset-password` | admin | `id` validated as uuid. Another school's id / unknown → 404. Own id → 400 (use change password). Sets a new temporary password + `mustChangePassword = true`; returns `{ temporaryPassword }` once. |

The client reads the session through nuxt-auth-utils' built-in `GET /api/_auth/session` (`useUserSession()`). Logout uses our `POST /api/auth/logout` so it goes through the tested route.

## Pages, layouts & components
- **`app/middleware/auth.global.ts`** (client route middleware):
  - Not logged in on a non-public page → `/login?redirect=…`.
  - Logged in on `/login` → `/`.
  - `user.mustChangePassword` → `/account/password` (until changed).
  - `to.meta.roles` set and the user's role not in it → `/` + toast "You don't have access to that page".
  - `PageMeta` augmented with `roles?: Role[]` and `public?: boolean`.
- **`app/pages/login.vue`**: `layout: 'auth'`, `public: true`. Form uses `method="post"` and the submit stays disabled until hydrated, so an early native submit can't put the password in the URL. School name (via `useSchool()`) above a `UForm` (`loginSchema`) with email + password and a submit button with loading state. Shows API errors (401/403/429) in a `UAlert`. `data-testid`s: `login-email`, `login-password`, `login-submit`, `login-error`.
- **`app/pages/account/password.vue`**: change-password form (current, new, confirm). Shows a notice when `mustChangePassword`. Success toast, then to `/`.
- **`app/pages/users/index.vue`**: `roles: ['admin']`. `UTable` (name, email, role badge, status, last login). Row action "Reset password" → confirm `UModal` → modal showing the temporary password with a copy button (`data-testid="temp-password"`). Hidden for the admin's own row.
- **`app/pages/index.vue`**: "Welcome to {school}", plus the user's name and role.
- **`app/utils/navigation.ts`**: `navigationFor(role)`. Dashboard (all roles), Users (admin). Later phases add items with their `roles`. Each item has a `data-testid="nav-<key>"`.
- **`app/layouts/default.vue`**: sidebar nav from `navigationFor(user.role)`. Sidebar footer `LayoutUserMenu` (`UDropdownMenu`: name + role label, "Change password", "Log out"); `data-testid="user-menu"`, `logout`.

## Seed (`pnpm db:seed`, idempotent upsert by `(schoolId, email)`; resets password and flags)
Demo password for every seeded user: **`password123`** (dev/E2E only; printed by the seed).

| School | Email | Name | Role | Notes |
|---|---|---|---|---|
| greenfield | `admin@greenfield.test` | Adaeze Okafor | admin | |
| greenfield | `principal@greenfield.test` | Emeka Nwosu | principal | |
| greenfield | `bursar@greenfield.test` | Fatima Bello | bursar | |
| greenfield | `teacher@greenfield.test` | Tunde Adeyemi | teacher | |
| greenfield | `parent@greenfield.test` | Ngozi Eze | parent | |
| greenfield | `inactive@greenfield.test` | Musa Ibrahim | teacher | `isActive = false` |
| sunrise | `admin@sunrise.test` | Bola Ogunleye | admin | for isolation checks |

## Test plan
Helpers:
- `tests/factories/users.ts`: `createUser(db, school, overrides?)` hashes the given password (default `password123`) with the real `hashPassword`.
- `tests/helpers/app.ts`: mounts `01.session.ts` and the new routes. Adds `login(app, host, email, password)` → cookie string, and passes a `cookie` header on requests.
- `#imports` test alias re-exports the real nuxt-auth-utils session/password utils (no mocks), with a fixed test `session.password`. `server.deps.inline: ['nuxt-auth-utils']` lets the alias apply inside the package.

### Unit (`tests/unit/`)
- `auth-schemas.test.ts`: `loginSchema` (email normalised to lowercase/trimmed; invalid email; empty password). `changePasswordSchema` (7/8/128/129-char boundaries; confirm mismatch; new = current rejected).
- `password.test.ts`: `generateTemporaryPassword` length, alphabet (no look-alikes), and two calls differ.
- `roles.test.ts`: `ROLES` / labels complete; `hasRole(user, roles)`.
- `login-throttle.test.ts` (fake timers): 5 failures → blocked; window expiry unblocks; success resets; separate keys per school + email; IP cap.

### Integration (PGlite, `tests/integration/`)
- **`auth-login.test.ts`**:
  - Valid login → 200, `Set-Cookie` `nuxt-session` with `HttpOnly`, `SameSite=Lax` and no `Domain`; body has no `passwordHash`/`schoolId`; `lastLoginAt` set.
  - Email case/whitespace-insensitive.
  - Wrong password and unknown email → identical 401 bodies.
  - Inactive user: correct password → 403, wrong password → 401.
  - **School A credentials on School B's host → 401.**
  - Same email in two schools, each with its own password → each logs in only on its own host.
  - Invalid body → 400 with field errors.
  - `schoolId` in body ignored.
  - 6th failed attempt → 429.
- **`auth-session.test.ts`**:
  - Session cookie works for `GET /api/users` as admin.
  - **School A session sent to School B's host → 401 and the cookie is cleared.**
  - User deactivated after login → next request 401.
  - Role changed after login → the new role applies immediately.
  - Logout → subsequent request 401; logout without a session → 200.
- **`auth-password.test.ts`**:
  - Wrong current → 400.
  - Too short → 400.
  - Success → old password fails and new works; `mustChangePassword` cleared.
  - Unauthenticated → 401.
- **`users.test.ts`**:
  - Permission matrix (`it.each` over all roles + anonymous) for `GET /api/users` and `POST /api/users/:id/reset-password`: admin 200, others 403, anonymous 401.
  - List contains only the current school's users, sorted, with no sensitive fields.
  - Reset: returns a temporary password that logs in, sets `mustChangePassword`, old password fails.
  - **Reset with School B's user id on School A's host → 404 and School B's hash unchanged.**
  - Own id → 400; non-uuid id → 400.
- **`tenant-scope.test.ts`**: `whereSchool` returns only the given school's rows.
- **`seed.test.ts`** (extend `db.test.ts`): seed creates the users above, is re-runnable, and the demo hash verifies against `password123`.

### Nuxt (`tests/nuxt/`)
- `navigation.test.ts`: `navigationFor` for each role (admin has Users; others don't).
- `layouts.test.ts` (extend): the default layout renders the nav for the session user's role and the user menu with name + role label.
- `login-page.test.ts`: renders the school name; shows field errors on empty submit; shows the API error message from a mocked `/api/auth/login` 401 (`registerEndpoint`).

### E2E (`tests/e2e/`, desktop + mobile)
- `auth.spec.ts`:
  - For each seeded greenfield role (`test.describe` loop): log in → dashboard shows the user's name; nav shows only that role's items (Users only for admin); log out → back at `/login`.
  - Wrong password → error shown.
  - Inactive user → disabled message.
  - Visiting `/` while logged out → `/login?redirect=/`, and after login → `/`.
- `forbidden.spec.ts`: a teacher opening `/users` lands on `/` with the "no access" toast.
- `tenant.spec.ts` (extend): logged in on greenfield, visiting `sunrise.lvh.me/` shows the Sunrise login page. The Greenfield admin's credentials fail there; `admin@sunrise.test` works and shows only Sunrise.
- Existing `home` / `layout` specs log in first (shared `loginAs(page, role)` helper in `tests/e2e/support/`).

## Implementation sub-steps
Each ends with `pnpm check` green, a summary, browser checks and a commit message.
1. **Spike + plumbing.** Install `nuxt-auth-utils`. Prove the real session/password utils run in the Vitest harness (alias + inline). Session types, `NUXT_SESSION_PASSWORD` in `.env.example` / Playwright / CI. If the spike fails I stop and come back with options.
2. **Schema + seed:** roles constant, `users` table + migration, `whereSchool`, user factory, demo password hash, seeded users; schema/seed/scope tests.
3. **Login / logout / session binding:** schemas, throttle, `01.session.ts`, `requireUser` / `requireRole`, login/logout routes; unit + integration tests.
4. **Password routes:** change password, users list, admin reset; integration tests incl. permission matrix and cross-tenant.
5. **Frontend:** login page, global middleware, role nav, user menu, change-password page, Users page; Nuxt tests.
6. **E2E + docs:** auth/forbidden/tenant specs, update existing specs; `PROGRESS.md`, decisions (RLS, session design, throttle, seed hash), `architecture.md`, manual checklist.

## Acceptance checklist
- [x] Each seeded role logs in on greenfield and sees only its nav; logout works
- [x] Protected pages redirect other roles; protected APIs return 401 / 403
- [x] School A session/credentials rejected on School B's host
- [x] Deactivated users can't log in or keep using a session
- [x] Admin resets a password; the user is forced to change it at next login
- [x] Users can change their own password
- [x] RLS decision logged in `docs/decisions.md`
- [x] Seed has a user per role (+ inactive, + Sunrise admin) and stays re-runnable
- [x] Works at 375px (login, user menu, Users table)
- [x] `pnpm check` and `pnpm test:e2e` green
- [x] CI green

## Open questions
1. **Login identifier.** Email only for now (as the roadmap's `unique(schoolId, email)` implies)? Many Nigerian parents use phone numbers more than email. I recommend email-only in Phase 1 and deciding "email **or** phone" login in Phase 4, when guardians are created. Making `email` nullable then is an easy migration. OK?
2. **Users page in Phase 1.** The roadmap needs "admin resets passwords" but staff management is Phase 3. I propose a minimal admin-only Users page (list + reset password only; no create/edit/deactivate), which Phase 3 grows into staff management. It also gives the forbidden-page test a real admin-only page. OK, or API-only until Phase 3?
3. **Reset flow.** Admin sees a one-time temporary password and the user must change it at next login (no email/SMS in MVP). OK?
4. **Postgres RLS (roadmap asks to decide now).** I recommend **not** enabling RLS in the MVP. It needs a per-request transaction with `SET LOCAL app.school_id` on every query, which fights postgres.js pooling and every `useDb()` call. Our isolation is enforced by `whereSchool` + `requireTenant` + mandatory cross-tenant tests on every route. Revisit RLS as a safety net before Phase 11 (platform admin), when cross-tenant code first exists. I'll log it as decision 010. Agree?
5. **Login throttling.** The roadmap's scaling notes ask for per-IP / per-school rate limits. I propose the simple in-memory limiter above (5 failures per school+email, 50 per IP, per 15 minutes) now, rather than a new package. OK?
6. **Session length.** 7 days fixed (log in again weekly), no "remember me". Shared staff-room computers are common, so shorter is safer, but parents on phones prefer longer. 7 days OK?
7. **Inactive-user message.** Show "account disabled" (403) only when the password is correct; otherwise the generic 401. This confirms the account exists only to someone who knows the password. OK?
8. **Seeded demo password** `password123` for all seeded users (seed refuses to run in production). OK?
9. **Packages.** Only `nuxt-auth-utils` (already approved). Its `@adonisjs/hash` dependency comes with it; nothing else is needed.
