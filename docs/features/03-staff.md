# Phase 3 — Staff management

**Status:** Done 2026-10-12 · Approved 2026-10-12 (all open-question recommendations accepted)
**Roadmap ref:** `docs/roadmap.md` → Phase 3

## Goal
Admins manage the school's staff accounts: add, edit, change role, deactivate/reactivate, remove, reset password. For each session, admins (and principals) assign a **class teacher** to each class arm and a **subject teacher** to each subject taught in an arm. These assignments decide what each teacher can see and do in later phases:
- Phase 5: a class teacher takes attendance for their own arm;
- Phase 6: a subject teacher enters scores for their own subjects and arms.

Teachers see their own classes on the dashboard.

## User stories
- As an **admin**, I add a staff member with name, email, optional phone and role. I get a one-time temporary password to give them, and they must change it at first login (as with a Phase 1 reset).
- As an **admin**, I edit a staff member's name, email, phone and role.
- As an **admin**, I **deactivate** a staff member: they can't log in, and an existing session stops at their next request. I can **reactivate** them later.
- As an **admin**, I **remove** a staff member who has left. They disappear from the staff list and their assignments are cleared. Their record is kept (soft delete) for history (scores they entered, payments they received).
- As an **admin**, I can't deactivate, remove or demote myself, and the school always keeps at least one active admin.
- As an **admin** or **principal**, I choose a session (default: current) and a class arm, then set its class teacher and the teacher for each subject of that arm's section.
- As an **admin** or **principal**, I see which arms still have no class teacher and which subjects have no teacher.
- As a **teacher**, my dashboard shows "My classes" for the current session: the arm(s) I'm class teacher of, and the subject + arm pairs I teach.
- As a **bursar** or **parent**, I can't see staff management or assignments (403 / redirected).

## Decisions baked in (see open questions)
- **Staff are `users` rows** with role admin, principal, bursar or teacher. There is no separate staff table. Parents (Phase 4) are users too, but never appear on the Staff page.
- **Assignments are per session.** A teacher can be class teacher of several arms. An arm has at most one class teacher per session. A subject in an arm has at most one teacher per session.
- **Who can be assigned:** active, non-removed staff with role **teacher, principal or admin** (not bursar, not parent).
- **A subject can only be assigned to an arm in the same section.** For example, an SSS subject goes to an SSS arm. SSS department subjects can go to any SSS arm, because students pick their department subjects (Phase 4).
- **Assignments survive deactivation**, flagged "inactive teacher" in the UI so the admin reassigns. **Removing** a staff member deletes their assignments.

## Schema changes (migration `0003_staff`)
```ts
// users
phone: text(),                                   // normalised +234…, optional
deletedAt: timestamp({ withTimezone: true }),    // soft delete (removed staff)
// unique(schoolId, email) stays as is: a removed account keeps its email (see open question 3)

classTeacherAssignments: id, schoolId, sessionId → academicSessions (cascade),
  classArmId → classArms (cascade), userId → users (restrict)
  unique(schoolId, sessionId, classArmId)                 ← one class teacher per arm per session

subjectTeacherAssignments: id, schoolId, sessionId → academicSessions (cascade),
  classArmId → classArms (cascade), subjectId → subjects (cascade), userId → users (restrict)
  unique(schoolId, sessionId, classArmId, subjectId)      ← one teacher per subject per arm per session
  index(schoolId, sessionId, userId)                      ← "my classes"
```
- Deleting a session, arm or subject (Phase 2 routes) removes its assignments. Later phases add their own guards: an arm with students (Phase 4), a subject with scores (Phase 6).
- **Removed users** (`deletedAt` set):
  - can't log in (same 401 as an unknown email);
  - `requireUser` rejects their session;
  - they're excluded from staff lists and assignment pickers.

## Rules (in `server/services/staff.ts` / `assignments.ts`)
- **Email:** trimmed and lowercased, unique per school among **all** users, including parents and removed staff (409 "This email is already used by another account"). This keeps login unambiguous.
- **Phone:** optional, normalised with `normalisePhone` (Phase 2).
- **Guards**, all 409 with a clear message:
  - an admin can't deactivate, remove or change the role of **their own** account;
  - an action that would leave the school with **no active admin** is refused.
- **Role change:**
  - to bursar: the user's assignments are removed (bursars can't be assigned);
  - to another assignable role: assignments are kept.

  Both happen in the same transaction as the role change.
- **Remove:** sets `deletedAt` and `isActive = false` and deletes all their assignments, in one transaction. There's no undo in the UI (open question 3).
- **Assignment writes:**
  - the arm, subject, session and user must all belong to the school (else 404 for arm/session, 400 for subject/user);
  - the user must be assignable;
  - the subject's section must equal the arm's level section (400).

## API routes
All routes:
- resolve the tenant with `requireTenant`;
- Zod-validate input (400 with `fieldErrors`);
- never read `schoolId` from input;
- return 404 for another school's ids.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/staff` | admin, principal | Staff (not parents, not removed). `id, name, email, phone, role, isActive, mustChangePassword, lastLoginAt`, sorted by name. `?status=active\|inactive` optional. |
| POST | `/api/staff` | admin | `{ name, email, phone?, role }` → 201 `{ staff, temporaryPassword }`; `mustChangePassword = true` |
| GET | `/api/staff/[id]` | admin, principal | One staff member + their assignments for `?sessionId=` (default: current session) |
| PATCH | `/api/staff/[id]` | admin | `{ name?, email?, phone?, role? }` with the guards above |
| POST | `/api/staff/[id]/deactivate` | admin | Guards; idempotent |
| POST | `/api/staff/[id]/reactivate` | admin | Idempotent |
| DELETE | `/api/staff/[id]` | admin | Remove (soft delete) with guards |
| POST | `/api/users/[id]/reset-password` | admin | (Phase 1, unchanged) now 404 for removed users |
| GET | `/api/assignments` | admin, principal | `?sessionId=` (default current) → `{ session, arms: [{ classArmId, label, section, classTeacher: {id,name,isActive} \| null, subjects: [{ subjectId, name, teacher \| null }] }] }`. Every arm with every subject of its section, so gaps show as `null`. |
| PUT | `/api/class-arms/[id]/class-teacher` | admin, principal | `{ sessionId?, userId: uuid \| null }`; null clears |
| PUT | `/api/class-arms/[id]/subject-teachers` | admin, principal | `{ sessionId?, assignments: [{ subjectId, userId \| null }] }`. Sets or clears the listed subjects for this arm in one transaction; unlisted subjects are unchanged. |
| GET | `/api/me/assignments` | admin, principal, teacher | The caller's own assignments for the current session: `{ session, classTeacherOf: [{classArmId,label}], subjects: [{subjectId,name,classArmId,label}] }` |

- `GET /api/users` (Phase 1) is **removed**: the Staff list replaces it, and nothing else uses it.
- `sessionId` defaults to the current session. If there's no current session and none is given → 400 "Set a current term first".

## Pages & components
- **`/staff`** (admin, principal; principals get read-only). Replaces `/users`, which now redirects to `/staff`.
  - Table: name, email, phone, role, status (Active / Inactive / Must change password), last login.
  - Filter: All / Active / Inactive, plus a name search (client-side).
  - Admin row actions: Edit, Reset password, Deactivate/Reactivate, Remove. The admin's own row has no destructive actions.
  - "Add staff" opens a dialog. On save, a modal shows the temporary password once, with a copy button.
- **`/staff/[id]`** (admin, principal): details, plus "Class teacher of" and "Teaches" for the selected session.
- **`/assignments`** (admin, principal):
  - a session select (default current);
  - a class-arm list grouped by section, with a warning badge on arms missing a class teacher or subject teachers;
  - the selected arm shows a class teacher select and a subject table, one row per subject of the section, each with a teacher select;
  - "Save" sends one `PUT …/subject-teachers`.

  On mobile the arm list becomes a select above the editor.
- **Dashboard** (`/`): admins, principals and teachers see a **"My classes"** card (from `/api/me/assignments`), or "No classes assigned for 2026/2027".
- **Nav:**
  - admin: Dashboard, **Staff**, **Assignments**, School setup;
  - principal: Dashboard, Staff, Assignments;
  - teacher, bursar, parent: Dashboard.

## Seed (demo)
- **Greenfield staff:**
  - existing: Adaeze (admin), Emeka (principal), Fatima (bursar), Tunde (teacher), Musa (inactive teacher);
  - **added:** Chioma Obi, Yusuf Lawal, Grace Ekpo and Ibrahim Sani (teachers), Kemi Balogun (teacher, `mustChangePassword`);
  - phones on a few.
- **Assignments for 2026/2027:**
  - Tunde: class teacher of JSS 1A; teaches Mathematics in JSS 1A and JSS 1B;
  - Chioma: class teacher of JSS 1B; teaches English in JSS 1A and 1B;
  - Yusuf: Physics in SSS 1A/1B;
  - Grace: class teacher of Primary 3A;
  - Emeka (principal): Civic Education in SSS 1A;
  - other arms stay unassigned, so the gaps show.
- **Sunrise:** admin only (unchanged).
- Re-runnable: upserts by natural keys.

## Test plan
### Unit
- `staff-schemas.test.ts`: create/patch schemas (email normalised, phone normalised, role must be a staff role, name length).
- `assignment-rules.test.ts`: pure helpers.
  - `isAssignableRole`;
  - `wouldLeaveNoActiveAdmin(admins, change)` covers deactivate, remove and demote, for the last admin and when other admins exist.

### Integration (PGlite, two schools per file)
- **`staff.test.ts`:**
  - **permission matrix** over all 5 roles + anonymous, for every route;
  - **create:** 201 with a temporary password that logs in and forces a change; the email is stored lowercase; a duplicate email (including a parent's or a removed account's) → 409; a parent role → 400;
  - **list:** excludes parents, removed staff and the other school's staff; the status filter works;
  - **patch:** name/email/phone/role; email uniqueness; role → bursar drops assignments; teacher → principal keeps them;
  - **guards:** self-deactivate, self-remove and self-demote → 409; deactivating, removing or demoting the last active admin → 409; allowed when another active admin exists;
  - **deactivate:** login → 403 "disabled"; an existing session → 401 on the next request; reactivate → login works;
  - **remove:** login → 401 (as unknown email); session → 401; hidden from lists; assignments deleted; reset-password → 404;
  - **cross-tenant:** another school's staff id → 404 on every `[id]` route, nothing changed; `schoolId` in the body ignored.
- **`assignments.test.ts`:**
  - **permission matrix:** admin and principal allowed; teacher, bursar and parent → 403; anonymous → 401;
  - **class teacher:** set, replace and clear. There's at most one per arm per session (DB unique + replace semantics). The same teacher can hold two arms. Each session keeps its own assignments;
  - **subject teachers:** set several in one PUT; clearing with null; a subject from another section → 400; a duplicate subject in one request → 400; one teacher per subject per arm;
  - **eligibility:** a bursar, parent, inactive or removed user, or another school's user → 400;
  - another school's arm or session → 404; another school's subject → 400; nothing changed;
  - `GET /api/assignments` shows every arm and subject with gaps as null and only this school's data; `?sessionId=` picks the session; with no current session → 400;
  - deleting an arm, subject or session (Phase 2 routes) removes its assignments;
  - **`GET /api/me/assignments`:** a teacher sees only their own; a principal with assignments sees them; a bursar → 403.

### Nuxt
- `navigation.test.ts`: Staff/Assignments per role (admin both + setup; principal both; others neither).
- `my-classes.test.ts`: the dashboard card renders assignments, and the empty state.
- `assignment-editor.test.ts`: the subject rows, teacher selects, the "unassigned" warning, and the save payload.

### E2E (desktop + mobile)
- `staff.spec.ts`:
  - the admin adds a teacher, notes the temporary password, and logs out;
  - the new teacher logs in with it and is forced to change it;
  - the admin deactivates them, after which the teacher can't log in, then reactivates;
  - finally the admin removes them (cleanup).

  Names and emails are unique per run.
- `assignments.spec.ts`: the admin assigns a class teacher and a subject teacher to an arm. That teacher logs in and sees them under "My classes". The admin then clears both (cleanup).
- `forbidden.spec.ts` (extend): a bursar opening `/staff` or `/assignments` is redirected.
- `auth.spec.ts` (update): the admin nav shows Staff, Assignments and School setup, and the principal nav shows Staff and Assignments.

## Implementation sub-steps
1. **Schema + seed:**
   - migration `0003`;
   - removed users excluded in login, `requireUser` and reset-password;
   - factories;
   - seeded staff and assignments.
2. **Rules + staff API:** pure guard helpers (test-first) and the staff routes.
3. **Assignments API** and `/api/me/assignments`. Phase 2 deletes cascade the assignments.
4. **Frontend:**
   - the Staff page (replacing Users), staff detail, the Assignments page;
   - My classes on the dashboard;
   - the nav;
   - Nuxt tests.
5. **E2E + docs.**

## Acceptance checklist
- [x] Admin adds, edits, changes role, deactivates/reactivates and removes staff; temporary password on create
- [x] Deactivated and removed staff can't log in; existing sessions stop
- [x] Self and last-active-admin guards
- [x] One class teacher per arm and one teacher per subject per arm, per session (DB-enforced)
- [x] Assignments validated (school, section, eligible staff); visible per arm with gaps
- [x] Teachers see "My classes"; `/api/me/assignments` ready for Phases 5–6
- [x] Every route: validation, roles, tenant isolation tested
- [x] Works at 375px
- [x] Seed updated; `pnpm check` and `pnpm test:e2e` green
- [ ] CI green (after push)

## Open questions
1. **Who manages assignments?** I recommend admin **and principal**, since `docs/domain.md` gives principals "academics". Staff accounts (add/edit/deactivate/remove) stay **admin only**; principals get read-only staff pages. OK?
2. **Who can be assigned?** I recommend teachers, principals and admins: in small schools the principal or proprietor often teaches. Bursars and parents can't be assigned. OK?
3. **Remove vs deactivate.** Deactivate is temporary and reversible. Remove is a soft delete for leavers: hidden, assignments cleared, record kept for history. A removed account **keeps its email reserved**, so the email can't be reused for a new account. Re-hiring someone means asking me to restore the account; there's no "restore" UI in the MVP. OK, or would you rather removed emails be freed for reuse?
4. **Assignments per session** (not per term). A mid-year change is made by reassigning, and later phases record who entered each score. OK?
5. **No "copy assignments from last session"** in the MVP; admins set them up each session. It's easy to add later if pilots ask. OK?
6. **Staff list size:** no server-side pagination for staff. Schools have tens of staff, not thousands, so filtering and search happen in the browser. Students (Phase 4) will be paginated. OK?
7. **`/users` → `/staff`:** the Phase 1 Users page is replaced by Staff, `GET /api/users` is removed, and `/users` redirects. Reset password stays at `/api/users/[id]/reset-password` so it also works for parent accounts in Phase 4. OK?
8. **Staff fields:** name, email, optional phone and role only. No title, gender, qualifications or photo in the MVP. OK?
9. **Packages:** none new.
