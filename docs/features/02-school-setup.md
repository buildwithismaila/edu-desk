# Phase 2 — School setup

**Status:** Done 2026-10-12 · Approved 2026-10-11 (all open-question recommendations accepted)
**Roadmap ref:** `docs/roadmap.md` → Phase 2

## Goal
An admin configures everything later phases need:
- the school's profile and logo;
- academic sessions with their three terms, and which session/term is current;
- class levels and arms;
- SSS departments and subjects;
- the assessment split (CA1/CA2/Exam);
- grading scales;
- whether positions are shown on report cards.

Every new school starts from the defaults in `docs/domain.md`, so a school is usable after only creating a session and some arms.

## User stories
- As an **admin**, I edit the school name, address, motto, phone and email, and upload a logo (PNG/JPEG/WebP, ≤ 1 MB). The logo appears in the sidebar and on the login page.
- As an **admin**, I create a session (e.g. `2026/2027`); its First, Second and Third terms are created with it. I set each term's start, end and "next term begins" dates.
- As an **admin**, I mark a term as current. Its session becomes current too, and the previous current session/term stop being current.
- As **any logged-in user**, I see the current session and term in the top bar.
- As an **admin**, I see the seeded class levels (Creche … SSS 3) grouped by section. I can rename, reorder, add or remove levels (a level with arms can't be removed), and add arms to a level (e.g. JSS 1 → A, B or Gold, Diamond).
- As an **admin**, I manage SSS departments (seeded Science, Arts, Commercial) and subjects per section. An SSS subject is either core (no department) or belongs to a department.
- As an **admin**, I edit the assessment components (default CA1 20, CA2 20, Exam 60). Saving is rejected unless the maxima sum to 100.
- As an **admin**, I edit the grading scale for Primary, JSS and SSS (seeded from `docs/domain.md`). Saving is rejected if the bands leave gaps, overlap, or don't cover 0–100.
- As an **admin**, I switch "show position in class" on or off for report cards.
- As a **non-admin**, I can't open the setup pages or call the write APIs (403). Staff can read the setup data later phases need.

## Decisions baked in (see open questions)
- **Sections are fixed:** `nursery | primary | jss | sss`, a Postgres enum (open question 1).
- **Nursery has no numeric grading scale:** nursery uses the fixed skill ratings from `docs/domain.md` in Phase 7 (open question 6).
- **Subjects belong to one section:** "Mathematics" in Primary, JSS and SSS is three rows (open question 3).
- **Setup data is hard-deleted, with guards** (409 when something depends on it). Later phases add their own guards, e.g. an arm with students.

## Schema changes
New `server/database/schema/academics.ts` and changes to `schools.ts`. Every new table is a **tenant table**:
- non-null `schoolId`;
- `createdAt` / `updatedAt`;
- unique constraints start with `schoolId`;
- all queries go through `whereSchool()`.

```ts
// schools (tenant root): profile columns
address: text(), motto: text(), phone: text(), email: text(),
logoKey: text(),            // storage key, e.g. schools/<id>/logo.png; null = no logo
logoUpdatedAt: timestamp(),  // cache-busting ?v= on the logo URL
showPositions: boolean().notNull().default(true),

export const section = pgEnum('section', ['nursery', 'primary', 'jss', 'sss'])
export const termNumber = pgEnum('term_number', ['first', 'second', 'third'])

academicSessions: id, schoolId, name (e.g. "2026/2027"), isCurrent bool default false
  unique(schoolId, name); partial unique index on (schoolId) WHERE is_current   ← at most one current

terms: id, schoolId, sessionId → academicSessions (cascade), number termNumber,
  startsOn date?, endsOn date?, nextTermBeginsOn date?, isCurrent bool default false
  unique(schoolId, sessionId, number); partial unique index on (schoolId) WHERE is_current

classLevels: id, schoolId, section, name, sortOrder int
  unique(schoolId, name)
classArms: id, schoolId, classLevelId → classLevels (restrict), name
  unique(schoolId, classLevelId, name)

departments: id, schoolId, name                        unique(schoolId, name)
subjects: id, schoolId, section, name, code?, departmentId? → departments (restrict)
  unique(schoolId, section, name); departmentId only allowed when section = 'sss' (check constraint)

assessmentComponents: id, schoolId, name, maxScore int, sortOrder int
  unique(schoolId, name)
gradeBands: id, schoolId, section (primary|jss|sss), grade, minScore int, maxScore int, remark, sortOrder int
  unique(schoolId, section, grade)
```
- Dates are Postgres `date` (no time zone); shown as `DD/MM/YYYY`.
- "Only one current" is enforced **in the database** by the partial unique indexes, and set inside a transaction (unset the old one, set the new one).
- Migration `0002_school_setup`.

## Defaults for a new school
`server/services/school-defaults.ts` → `applySchoolDefaults(db, schoolId)`. It's idempotent and runs in one transaction. The demo seed uses it now; Phase 12 onboarding will reuse it. It creates:
- **Class levels** from `docs/domain.md`, in order:
  - Nursery: Creche, Pre-Nursery, Nursery 1, Nursery 2;
  - Primary: Primary 1–6;
  - JSS: JSS 1–3;
  - SSS: SSS 1–3.
- **Departments:** Science, Arts, Commercial.
- **Assessment components:** CA1 20, CA2 20, Exam 60.
- **Grade bands:** WAEC for SSS (A1…F9); A–F for Primary and JSS.

It doesn't create sessions, arms or subjects; those are school-specific.

## Validation rules (pure functions in `shared/`, test-first)
Shared so `UForm` shows the same errors the API returns.
- **`validateGradeBands(bands)`** (`shared/utils/grading.ts`). Each band needs integer `0 ≤ min ≤ max ≤ 100` and a non-empty unique grade. Sorted by `min`, bands must be contiguous (`next.min === prev.max + 1`), non-overlapping, start at 0 and end at 100. Errors say which bands are at fault, e.g. "Gap between 39 and 41", "C4 overlaps C5", "Must start at 0".
- **`validateAssessmentComponents(components)`** (`shared/utils/assessment.ts`). 1–5 components, unique non-empty names, integer max 1–100 each, **sum exactly 100** ("Total is 90; it must be 100").
- **Term dates** (`shared/schemas/academics.ts`):
  - `startsOn < endsOn`, and `nextTermBeginsOn > endsOn`, when set;
  - any of the three can be left empty.
- **Session name:** `YYYY/YYYY` where the second year = first + 1 (e.g. `2026/2027`).
- **Arm display name:** `classArmLabel(level, arm)`. A single-letter arm joins without a space ("JSS 1A"); anything else gets a space ("JSS 1 Gold", "Nursery 2 1").

## Logo storage
- **Store:** Nitro storage mount `uploads`, using the `fs` driver at `.data/uploads` (dev and prod; prod needs a persistent volume). Tests use an in-memory stand-in. The key is always `schools/<schoolId>/logo.<ext>`, built from `requireTenant`, never from input.
- **Upload checks:** ≤ 1 MB, and the type is checked by **file signature (magic bytes)**, not by the client's content-type: PNG, JPEG or WebP. Uploading replaces the old file.
- **Serving:** `GET /api/school/logo` streams the current tenant's logo with its content type and `Cache-Control: public, max-age=86400`. URLs carry `?v=<logoUpdatedAt>` so a new upload shows immediately.
- No resizing in the MVP: upload the size you want shown.

## API routes
Every route:
- resolves the tenant with `requireTenant`;
- validates with `validateBody` / `validateParams` (400 + `fieldErrors`);
- never reads `schoolId` from input;
- returns 404 for another school's ids.

"Staff" means admin, principal, bursar, teacher (not parent).

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/school` | public | (existing) now also `logoUrl` (or null), for the login page and sidebar |
| GET | `/api/school/logo` | public | The tenant's logo file; 404 if none |
| GET | `/api/school/profile` | staff | `name, address, motto, phone, email, logoUrl, showPositions` |
| PATCH | `/api/school/profile` | admin | Partial update of the above (not the logo); Nigerian phone normalised to `+234…` |
| PUT | `/api/school/logo` | admin | `multipart/form-data` field `logo`; 400 on wrong type / too big |
| DELETE | `/api/school/logo` | admin | Removes the logo |
| GET | `/api/academic/current` | any logged-in (incl. parent) | `{ session: {id,name} \| null, term: {id,number,startsOn,endsOn,nextTermBeginsOn} \| null }` |
| GET | `/api/sessions` | staff | Sessions (newest first) with their 3 terms |
| POST | `/api/sessions` | admin | `{ name }` → session + First/Second/Third terms (transaction); 409 duplicate name |
| PATCH | `/api/sessions/[id]` | admin | `{ name }` |
| DELETE | `/api/sessions/[id]` | admin | 409 if current (later phases add "has data" guards) |
| PATCH | `/api/terms/[id]` | admin | `{ startsOn?, endsOn?, nextTermBeginsOn? }` (dates `YYYY-MM-DD`, nullable) |
| POST | `/api/terms/[id]/set-current` | admin | Makes this term and its session current; unsets the previous ones (transaction) |
| GET | `/api/class-levels` | staff | Levels in `sortOrder`, each with its arms |
| POST | `/api/class-levels` | admin | `{ section, name }` → appended at the end of its section |
| PATCH | `/api/class-levels/[id]` | admin | `{ name }` |
| PUT | `/api/class-levels/order` | admin | `{ ids: [...] }`, all of the school's level ids, in the new order |
| DELETE | `/api/class-levels/[id]` | admin | 409 if it has arms |
| POST | `/api/class-levels/[id]/arms` | admin | `{ name }`; 409 duplicate within the level |
| PATCH | `/api/class-arms/[id]` | admin | `{ name }` |
| DELETE | `/api/class-arms/[id]` | admin | (Phase 4 adds 409 if it has students) |
| GET | `/api/departments` | staff | Departments |
| POST / PATCH / DELETE | `/api/departments[/id]` | admin | `{ name }`; DELETE 409 if subjects use it |
| GET | `/api/subjects` | staff | `?section=` optional filter; with department name |
| POST | `/api/subjects` | admin | `{ section, name, code?, departmentId? }`; `departmentId` only for SSS and must be this school's (else 400) |
| PATCH | `/api/subjects/[id]` | admin | Same fields |
| DELETE | `/api/subjects/[id]` | admin | (Phase 6 adds 409 if it has scores) |
| GET | `/api/assessment-components` | staff | In order |
| PUT | `/api/assessment-components` | admin | `{ components: [{ name, maxScore }] }`, replaces the set (transaction); 400 unless valid (sum 100). Phase 6 adds "locked once scores exist". |
| GET | `/api/grading-scales` | staff | `{ primary: [...bands], jss: [...], sss: [...] }` |
| PUT | `/api/grading-scales/[section]` | admin | `section ∈ primary\|jss\|sss`; `{ bands: [{ grade, minScore, maxScore, remark }] }`, replaces (transaction); 400 unless valid |

## Pages & components
Settings pages are admin-only (`definePageMeta({ roles: ['admin'] })`). Nav gets a **"School setup"** group for admins with the five pages.
- **`/settings/school`:**
  - profile form (`UForm`, shared schema);
  - logo upload with preview and remove (`UFileUpload` or input + preview);
  - "Show position in class on report cards" switch.
- **`/settings/calendar`:**
  - sessions list, newest first, each with its 3 terms and their dates;
  - "New session" modal; edit term dates in a modal;
  - "Set as current" on a term;
  - current badges.
- **`/settings/classes`:**
  - levels grouped by section, with move up/down to reorder;
  - rename, add level, delete (disabled when the level has arms);
  - arms shown as badges, with add, rename and delete.
- **`/settings/subjects`:**
  - tabs per section, each with a subject table and add/edit/delete;
  - for SSS, a department select ("Core" = none) and a departments manager.
- **`/settings/grading`:**
  - assessment components editor, showing the running total and blocking save unless 100;
  - grading-scale editor per section tab, as band rows with live validation messages.
- **Top bar:** the current session · term (e.g. "2026/2027 · First Term") via `useCurrentTerm()` (`/api/academic/current`, key `current-term`). It shows "No current term" with a link for admins.
- **Sidebar header:** shows the logo when set (`SchoolBrand`); the login page shows it too.

Mobile (375px):
- forms stack;
- tables scroll inside their container;
- the reorder buttons and the band editor stay usable.

## Seed (demo)
Applies `applySchoolDefaults` to greenfield and sunrise, plus:
- **Greenfield:**
  - profile (address in Lagos, motto, phone, email);
  - session `2026/2027` with **First Term current** (dates Sept–Dec 2026, next term begins Jan 2027), and session `2025/2026` (past);
  - arms A and B for Primary 1–6, JSS 1–3 and SSS 1–3, and arm A for Nursery levels;
  - typical subjects:
    - Primary: English, Mathematics, Basic Science, Social Studies, CRS/IRS, Verbal/Quantitative Reasoning…;
    - JSS: English, Mathematics, Basic Science, Basic Technology, Business Studies, Civic Education…;
    - SSS core: English, Mathematics, Civic Education;
    - SSS Science: Physics, Chemistry, Biology;
    - SSS Arts: Literature, Government, CRS;
    - SSS Commercial: Accounting, Commerce, Economics.
- **Sunrise:** session `2026/2027` current with its own arms (JSS 1 Gold/Diamond), so isolation is visible.

The seed stays re-runnable: upserts by natural keys, and it never duplicates arms or subjects.

## Test plan
### Unit (test-first, `tests/unit/`)
- **`grading.test.ts`:**
  - valid WAEC and A–F scales;
  - gap (39 → 41), overlap, not starting at 0, not ending at 100;
  - min > max, duplicate grade, non-integer, out of 0–100;
  - single band 0–100; unsorted input that is otherwise valid;
  - boundary pairs 39/40, 74/75, 100.
- **`assessment.test.ts`:**
  - sums of 100, 99 and 101; 0 components, 6 components;
  - duplicate names, empty name, max 0, non-integer max;
  - 4-component splits (10/10/20/60).
- **`academics-schemas.test.ts`:**
  - session name format (`2026/2027` ok; `2026/2028`, `26/27` and `2026-2027` rejected);
  - term date rules (start < end, next > end, nulls allowed);
  - `classArmLabel`;
  - Nigerian phone normalisation (`0803…` → `+234803…`, `+234…` kept, invalid rejected).
- **`logo.test.ts`:** signature detection for PNG/JPEG/WebP; a GIF, an SVG, or a renamed text file is rejected.

### Integration (PGlite, `tests/integration/`)
Two schools per file. Each route file has:
- a **permission matrix** over all 5 roles + anonymous;
- **cross-tenant** cases: School B ids on School A → 404 and no change; `schoolId` in the body is ignored;
- validation → 400 with `fieldErrors`;
- the happy path, with the DB state asserted.

Plus:
- **`school-defaults.test.ts`:** creates the domain defaults; idempotent; scoped to one school.
- **`school-profile.test.ts`:**
  - profile get/patch;
  - logo upload, replace, serve and delete;
  - wrong type / too big → 400;
  - a logo is never served on another school's host;
  - `/api/school` exposes `logoUrl` only.
- **`calendar.test.ts`:**
  - create session → 3 terms; duplicate name → 409;
  - term dates validation;
  - **set-current is unique:** setting B current unsets A, at most one current session/term per school, and the session follows the term;
  - one school's current term doesn't affect the other's;
  - can't delete the current session;
  - `/api/academic/current` for every role, including parent.
- **`classes.test.ts`:**
  - level CRUD; reorder (rejects foreign or missing ids);
  - arm CRUD; duplicate arm in a level → 409; same arm name in another level is OK;
  - deleting a level with arms → 409.
- **`subjects.test.ts`:**
  - department CRUD; deleting a department in use → 409;
  - subject CRUD;
  - `departmentId` on a non-SSS subject → 400; another school's department → 400;
  - section filter.
- **`assessment-grading.test.ts`:**
  - PUT replaces the set atomically: an invalid PUT leaves the old set intact;
  - sum ≠ 100 → 400;
  - invalid bands → 400 with messages;
  - section `nursery` → 400.

### Nuxt (`tests/nuxt/`)
- `navigation.test.ts`: the admin sees the School setup group; other roles don't.
- `grading-editor.test.ts`: the band editor shows live gap/overlap messages and disables save while invalid.
- `assessment-editor.test.ts`: the running total shows, and save is disabled unless it's 100.
- `current-term.test.ts`: the top-bar label for set and unset current term.

### E2E (`tests/e2e/`, desktop + mobile)
- `school-setup.spec.ts`: the admin creates a new session, sets its First Term dates, makes it current (the top bar updates), adds an arm to a class level, and sees it listed.
  - The test uses a unique session name and arm name per run/project, so reruns and parallel projects don't collide.
- `grading.spec.ts`: an invalid scale shows the error and can't be saved; reverting makes it valid.
- `forbidden.spec.ts` (extend): a teacher opening `/settings/classes` is redirected.

## Implementation sub-steps
Each ends with `pnpm check` green, a summary, browser checks and a commit message.
1. **Validators (test-first):** grade bands, assessment components, session name, term dates, phone, arm label, logo signature.
2. **Schema + defaults + seed:** migration `0002`, `applySchoolDefaults`, demo seed; defaults/seed tests.
3. **Profile & logo API:** storage mount, upload/serve/delete, `/api/school` `logoUrl`.
4. **Calendar API:** sessions, terms, set-current, `/api/academic/current`.
5. **Classes API:** levels, order, arms.
6. **Subjects API:** departments, subjects.
7. **Assessment & grading API.**
8. **Frontend:** five settings pages, nav group, top-bar current term, logo in sidebar/login; Nuxt tests.
9. **E2E + docs:** specs, `PROGRESS.md`, decisions, `domain.md` / `architecture.md` updates, manual checklist.

## Acceptance checklist
- [x] Admin configures profile + logo, a session with terms, current term, class levels + arms, departments + subjects, assessment split, grading scales, position toggle
- [x] Only one current session and one current term per school (DB-enforced); setting current is atomic
- [x] Invalid grading scales and assessment configs are rejected (API and UI)
- [x] Every route: validation, roles, tenant isolation tested
- [x] New schools get the `docs/domain.md` defaults (`applySchoolDefaults`)
- [x] Current session/term visible to every logged-in user
- [x] Works at 375px
- [x] Seed updated; `pnpm check` and `pnpm test:e2e` green
- [ ] CI green (after push)

## Open questions
1. **Sections as a fixed enum** (Nursery, Primary, JSS, SSS) rather than a table. `docs/domain.md` lists exactly these four. Schools without a nursery simply delete those class levels. OK?
2. **Departments as an editable table**, seeded Science, Arts and Commercial, so a school can rename ("Humanities") or add ("Technical"). The alternative is a fixed enum. Table OK?
3. **Subjects per section:** Mathematics in Primary, JSS and SSS is three rows. This keeps teacher assignment (Phase 3) and grading per section simple. OK?
4. **Who can change setup:** admin-only writes and settings pages in Phase 2. Principals and other staff only read setup data through the APIs later phases use. `docs/domain.md` gives principals "academics", so should principals also edit assessment/grading? I recommend admin-only for now.
5. **Logo storage:** local disk through Nitro storage (`.data/uploads`; production needs a persistent volume). No new package; S3-compatible storage can be swapped in later. ≤ 1 MB, PNG/JPEG/WebP, no resizing. OK?
6. **Nursery grading:** no numeric scale configured in Phase 2. Nursery uses the fixed skill ratings (Excellent / Very Good / Good / Needs Improvement) when report cards come in Phase 7. OK?
7. **Hard delete with guards** for setup data (sessions, levels, arms, departments, subjects). No soft delete, unlike students/staff/payments. OK?
8. **Term date rules:** validate only within a term (start < end, next term begins > end). Don't enforce ordering across the three terms, since schools sometimes shift dates. OK?
9. **Demo seed:** Greenfield's current term is **2026/2027 First Term** (Sept–Dec 2026, matching today), with the arms and subject list above. OK?
10. **Phone format:** `docs/domain.md` stores Nigerian phones as `+234…`. The school phone follows that rule, using a shared `normalisePhone` that Phase 4 reuses. OK?
11. **Packages:** none new. Nitro storage, `UFileUpload` and Zod are already available.
