# Phase 4 — Students & guardians

**Status:** Approved 2026-10-12 (all open-question recommendations accepted; in-house CSV parser)
**Roadmap ref:** `docs/roadmap.md` → Phase 4

## Goal
Schools admit students and record their guardians.
- **Admission:** an admin admits a student with bio data, an optional photo, state of origin, class arm and (for SSS) department. The student gets an automatic admission number (`GFA/2026/0001`) and is enrolled in that arm for the session.
- **Guardians:** each guardian is a **parent account**. Siblings share guardians, and parents can log in and see their children.
- **Finding students:** staff search, filter and page through the students they're allowed to see, and open a profile.
- **CSV import:** existing students can be brought in from a spreadsheet. The import is all-or-nothing, with a report of every bad row.

Attendance (Phase 5), scores (Phase 6), results (Phase 7) and fees (Phase 10) all hang off the student and their per-session class arm.

## User stories
- As an **admin**, I admit a student: name, gender, date of birth, state of origin (36 states + FCT), LGA, address, class arm, department (SSS only), and optionally a photo. I add one or more guardians, each either **new** (name, phone, email optional, relationship) or **existing** (search by name or phone, so siblings share a guardian).
  - The admission number is generated automatically, or I can type an existing one (e.g. from the old register).
  - Each new guardian gets a one-time temporary password, shown once.
- As an **admin**, I edit a student's details, change their class arm (e.g. a transfer between arms), upload or replace their photo, add, link or unlink guardians, and remove a student who has left (soft delete).
- As an **admin**, I edit a guardian's name, phone and email, and reset their password (Phase 1 reset).
- As **staff**, I see a paginated student list (25 per page) with search (name or admission number) and filters (class level, arm, gender). Clicking a student opens their profile: bio, photo, class arm, guardians and contacts.
  - Teachers only see students in the arms they teach or are class teacher of (current session).
- As an **admin**, I upload a CSV of students (with guardian columns) and see a **preview**: how many rows are valid and every problem (row, column, message). Nothing is imported until the file is fully valid. Then I confirm, and **everything is imported in one transaction**.
- As a **parent**, I log in with **my phone number or email** and see "My children" (name, class, admission number, photo).
- As **anyone else**, I can't see students outside my access. Another school's students are 404.

## Decisions baked in (see open questions)
- **Guardians are `users` with role `parent`.** Phone is **required** and unique per school among active accounts. Email is optional.
- **Login accepts email or phone** for every user. Phone is entered in any Nigerian format and normalised first.
- **Enrolment is per session:** `student_enrolments` holds one class arm per student per session. Admission enrols the student in the chosen session (default current). Phase 9 promotion creates next session's rows. Changing arm mid-session updates the row.
- **Admission numbers:** `PREFIX/YEAR/NNNN`. The prefix is a per-school setting (default: initials of the school name, e.g. `GFA`). YEAR is the first year of the admission session. NNNN is a per-school, per-year counter that increments atomically inside the admission transaction. A manually typed number must be unique in the school.
- **Who sees students** (NDPA, open question 3):

| Role | Can see |
|---|---|
| admin, principal | All students |
| bursar | All students, minus date of birth, state of origin, LGA and address (needed later for fees) |
| teacher | Only students in arms they're assigned to (current session) |
| parent | Only their own children, via `/api/me/children` |

- **Photos** are private: `GET /api/students/[id]/photo` requires a user allowed to see that student. They're never public like the logo. PNG/JPEG/WebP up to 1 MB, checked by signature (Phase 2 code).
- **Removing a student** is a soft delete (`deletedAt`): hidden from lists, admission number kept and still reserved, enrolments and guardian links kept for history. Graduated and withdrawn statuses come with promotion (Phase 9).

## Schema changes (migration `0004_students`)
```ts
schools: + admissionPrefix text (default derived from name at first use; editable on School profile)

students: id, schoolId, admissionNumber, firstName, middleName?, lastName, gender ('male'|'female'),
  dateOfBirth date?, stateOfOrigin text? (one of NIGERIAN_STATES), lga?, address?,
  departmentId? → departments (restrict), photoKey?, photoUpdatedAt?, admittedOn date,
  createdAt, updatedAt, deletedAt?
  unique(schoolId, admissionNumber); index(schoolId, lastName, firstName)

studentEnrolments: id, schoolId, sessionId → academicSessions (cascade), studentId → students (cascade),
  classArmId → classArms (restrict), createdAt, updatedAt
  unique(schoolId, sessionId, studentId); index(schoolId, sessionId, classArmId)

studentGuardians: id, schoolId, studentId → students (cascade), guardianId → users (restrict),
  relationship ('father'|'mother'|'guardian'|'other'), isPrimary bool, createdAt, updatedAt
  unique(schoolId, studentId, guardianId)

admissionCounters: schoolId, year int, lastNumber int — primary key (schoolId, year)

users: + partial unique index (schoolId, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL
```
- **Phase 2 guard (promised then):** deleting a class arm that has enrolments → 409 (`restrict` + a friendly check). Deleting a session cascades its enrolments, but a session with enrolments is refused (409) so history isn't lost.
- **Department:** allowed only when the student's arm (in the enrolment session) is SSS; optional even then.
- `shared/constants/states.ts`: the 36 states + FCT, alphabetical.

## Rules & pure helpers (test-first)
- **`formatAdmissionNumber(prefix, year, seq)`** → `GFA/2026/0001`. Padding is 4 digits, growing to 5+ past 9999. Also `defaultAdmissionPrefix(schoolName)`: initials of up to 4 words, uppercase, letters only (e.g. "Greenfield Academy" → `GA`, with a fallback `SCH`). The admin can change it.
- **Phone:** `normalisePhone` (Phase 2) everywhere. A guardian phone is required and must be a valid Nigerian number.
- **CSV parser** (`server/utils/csv.ts`): RFC 4180 (quoted fields, escaped quotes, commas and newlines inside quotes, CRLF/LF, BOM stripped). Returns rows of strings. No new package (open question 6).
- **CSV row validator** (`shared/schemas/student-import.ts`): per row it checks
  - required columns and the date format `DD/MM/YYYY`;
  - gender (`M`/`F`/`Male`/`Female`, case-insensitive);
  - the state is one of the 37;
  - the class arm label exists (e.g. `JSS 1A`, matched case-insensitively);
  - the department exists and the arm is SSS;
  - any admission number given is unique in the file and the school;
  - guardian name and phone are valid;
  - relationship.

  Errors are `{ row, column, message }`, with row numbers matching the spreadsheet (header = row 1). Limits: 1,000 rows, 1 MB.
- **Guardians in import** are matched **by phone** to existing parents (siblings share). New ones get parent accounts with a random password that **isn't shown**: the admin uses "Reset password" when a parent wants to log in (open question 5).

## API routes
All routes:
- resolve the tenant with `requireTenant`;
- Zod-validate input (400 with `fieldErrors`);
- never read `schoolId` from input;
- return 404 for another school's ids, and 404 (not 403) for a student outside a teacher's arms.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | (changed) body `{ login, password }`: an email or a Nigerian phone |
| GET | `/api/students` | admin, principal, bursar, teacher (scoped) | `?page&pageSize(≤100)&search&classLevelId&classArmId&gender&sessionId`. Returns `{ items, total, page, pageSize }` with id, admission number, names, gender, class arm label, photo URL. Removed students are excluded. |
| POST | `/api/students` | admin | Admit: bio fields, `classArmId`, `departmentId?`, `admissionNumber?`, `sessionId?`, `guardians: [{ guardianId, relationship } \| { name, phone, email?, relationship }]` (1–4). One transaction. 201 `{ student, newGuardians: [{ id, name, temporaryPassword }] }`. |
| GET | `/api/students/[id]` | scoped as above | Profile: bio (fields per role), current enrolment, guardians (name, phone, email, relationship) |
| PATCH | `/api/students/[id]` | admin | Bio fields and department (merged-record validation, decision 019) |
| PUT | `/api/students/[id]/enrolment` | admin | `{ classArmId, sessionId? }`: set or change the arm for the session |
| DELETE | `/api/students/[id]` | admin | Remove (soft delete) |
| GET | `/api/students/[id]/photo` | scoped as above | Private photo (`Cache-Control: private`) |
| PUT / DELETE | `/api/students/[id]/photo` | admin | Upload or replace / remove (1 MB, PNG/JPEG/WebP by signature) |
| POST | `/api/students/[id]/guardians` | admin | Link an existing guardian or create a new one (as in admission); 201 with an optional `temporaryPassword` |
| DELETE | `/api/students/[id]/guardians/[guardianId]` | admin | Unlink; 409 if it's the student's last guardian |
| GET | `/api/guardians` | admin | `?search=` (name or phone), max 20: id, name, phone, email, children (names) |
| PATCH | `/api/guardians/[id]` | admin | Name, phone, email (unique checks) |
| GET | `/api/students/import/template` | admin | CSV template with headers and one example row |
| POST | `/api/students/import` | admin | Multipart `file`, `?dryRun=true`. Dry run → `{ valid, rows, errors }`. A real run re-validates and, if any error remains, imports nothing (400 with the errors); otherwise one transaction → `{ imported, guardiansCreated, guardiansLinked }`. |
| PATCH | `/api/school/profile` | admin | (Phase 2) now also `admissionPrefix` (2–6 letters or digits) |
| GET | `/api/me/children` | parent | Own children: id, name, admission number, class arm label (current session), photo URL |

## Pages & components
- **`/students`** (admin, principal, bursar, teacher):
  - search box (debounced) and filters (level → arm, gender), all kept in the URL query;
  - paginated `UTable` (photo thumbnail, name, admission number, class, gender), with server-side pagination (`UPagination`);
  - "Admit student" and "Import CSV" buttons (admin).
- **`/students/new`** (admin): admission form in sections (Student, Class, Guardians, Photo). The guardian picker has "Search existing" (name/phone) or "New guardian". After saving, the temporary passwords of new guardians are shown once, then you go to the profile.
- **`/students/[id]`:** profile header (photo, name, admission number, class), details card, guardians card (call link `tel:`), admin actions (Edit, Change class, Photo, Add guardian, Unlink, Remove).
- **`/students/import`** (admin):
  1. download the template;
  2. upload the CSV, which shows a preview with valid count and an error table (row, column, message);
  3. "Import N students" is enabled only when there are 0 errors.
- **Dashboard for parents:** "My children" cards (photo, name, class, admission number).
- **Login page:** the field becomes "Email or phone number".
- **School profile:** an "Admission number prefix" field.
- **Nav:** Students (admin, principal, bursar, teacher).

## Seed (demo)
- **Greenfield:** prefix `GFA`, and about 40 students in 2026/2027:
  - JSS 1A ×10, JSS 1B ×8, Primary 3A ×8, SSS 1A ×8 (with Science, Arts and Commercial departments), Nursery 1A ×6;
  - Nigerian names, mixed genders, a spread of states;
  - admission numbers `GFA/2026/0001…`.
- **Guardians:**
  - `parent@greenfield.test` (Ngozi Eze, phone `08031110001`) is the mother of **two siblings**, in JSS 1A and Primary 3A;
  - a few more guardians shared by siblings;
  - one student with two guardians;
  - all parents use the demo password.
- **Sunrise:** 3 students in JSS 1 Gold, each with a guardian, so isolation is visible.
- Re-runnable: upserts by admission number and guardian phone.

## Test plan
### Unit
- **`admission-number.test.ts`:** formatting and padding (1 → 0001, 9999, 10000); prefix defaults (one word, many words, symbols, empty → `SCH`).
- **`csv.test.ts`:**
  - quoted commas, escaped quotes, newlines in quotes;
  - CRLF, BOM, trailing newline, empty lines;
  - an unterminated quote produces an error.
- **`student-import-row.test.ts`:** every row rule above, plus the error format (row numbers include the header).
- **`students-schemas.test.ts`:** admission body (guardians 1–4, new vs existing, phone required, SSS-only department), login identifier (email vs phone).
- **`states.test.ts`:** 37 entries, unique.

### Integration (PGlite, two schools)
- **`auth-login.test.ts`** (extend): login by phone in any format; by email; a phone from another school → 401; the same phone on two removed accounts doesn't block.
- **`students-admission.test.ts`:**
  - **permission matrix** on every route;
  - **admission:** a transactional happy path checking the student, enrolment, guardians, counter and temporary password logging in;
  - **numbering:** sequential numbers under several admissions; manual number accepted or duplicate → 409; failure mid-transaction (bad guardian) leaves no student and no counter bump;
  - **validation:** another school's arm, department or guardian → 400; SSS-only department; guardian phone already used by a staff member → 409.
- **`students-list.test.ts`:**
  - pagination math, search (name and admission number), filters, `sessionId`;
  - removed students excluded;
  - **teacher scoping** (only their arms; another arm's student → 404 on the profile);
  - bursar field restriction;
  - cross-tenant.
- **`students-profile.test.ts`:**
  - patch with merged validation;
  - enrolment change (the arm must be this school's);
  - remove (soft) and its effect on lists and `/me/children`;
  - photo upload, serve and remove, and photo access denied to an unrelated teacher or parent and to another school.
- **`guardians.test.ts`:**
  - link existing (siblings share one guardian row);
  - create new; unlink, and the last-guardian 409;
  - guardian search;
  - guardian patch (phone/email uniqueness);
  - `/api/me/children` shows only own children; parents can't call staff routes.
- **`students-import.test.ts`:**
  - the dry run reports every error with row numbers;
  - a real import is **all-or-nothing** (one bad row → nothing imported, counter unchanged);
  - a good file imports N students with enrolments and guardians;
  - guardians are matched by phone (siblings share, existing parent reused);
  - manual and generated admission numbers mix correctly;
  - too many rows or too large → 400/413;
  - only the host school is affected.
- **`setup-guards.test.ts`** (extend Phase 2): deleting an arm with enrolments → 409; deleting a session with enrolments → 409.

### Nuxt
- `student-list.test.ts`: renders rows, pagination, filters reflected in the query.
- `guardian-picker.test.ts`: existing vs new guardian; validation messages.
- `import-preview.test.ts`: the error table, and the import button disabled while errors exist.

### E2E (desktop + mobile)
- `students.spec.ts`:
  - the admin admits a student with a new guardian (unique phone per run), notes the temporary password, and sees the profile;
  - the parent logs in **by phone** with the temporary password, is forced to change it, and sees the child under "My children";
  - cleanup: the admin removes the student and resets data.
- `students-list.spec.ts`: search and filter find a seeded student; pagination works; a teacher sees only their arm's students.
- `students-import.spec.ts` (desktop only, writes data): a CSV with one bad row shows the error, and nothing is imported; a fixed file imports. Cleanup: the imported students are removed.
- `forbidden.spec.ts` (extend): a parent opening `/students` is redirected.

## Implementation sub-steps
1. **Pure helpers (test-first):** admission number, CSV parser, row validator, states, schemas.
2. **Schema + seed:**
   - migration `0004` and factories;
   - Phase 2 delete guards for enrolments;
   - demo students and guardians.
3. **Login by phone; guardians API; `/api/me/children`.**
4. **Students API:** admission (transaction), list (pagination, filters, scoping), profile (role fields), patch, enrolment, remove, photo.
5. **CSV import API:** dry run and commit, all-or-nothing.
6. **Frontend:**
   - Students list, admission form with guardian picker, profile, import page;
   - "My children";
   - login label, admission prefix field, nav;
   - Nuxt tests.
7. **E2E + docs.**

## Acceptance checklist
- [ ] Admit with auto (or manual) admission number, enrolment, guardians (new/existing), photo — in one transaction
- [ ] Siblings share a guardian; guardian accounts can log in (phone or email) and see their children
- [ ] Student list with search, filters and server-side pagination; teachers see only their arms; bursars see limited fields
- [ ] Profile with edit, class change, photo, guardians, remove (soft)
- [ ] CSV import: preview with row-level errors; all-or-nothing import
- [ ] Arms and sessions with enrolments can't be deleted
- [ ] Every route: validation, roles, tenant isolation tested
- [ ] Works at 375px
- [ ] Seed updated; `pnpm check`, `pnpm test:e2e` and CI green

## Open questions
1. **Login by phone.** Many Nigerian parents use a phone number more than email. I recommend **email or phone for everyone**, with phone unique per school among active accounts. Side effect: a teacher who is also a parent at the same school needs two accounts with different identifiers (e.g. email for the staff account, phone for the parent account). OK?
2. **Guardian = parent account.** Every guardian is a login-capable parent account (phone required, email optional). Guardians who never log in are simply accounts nobody uses. OK, or keep "contacts without accounts" separate?
3. **Who sees students:** admin and principal see all; bursar sees all but without date of birth, state of origin, LGA and address; teachers see only students in their assigned arms; parents see only their own children (decisions above). OK?
4. **Admission number format:** `PREFIX/YEAR/NNNN`, with an editable prefix and a per-year counter. A manual number is allowed for existing students. The format itself isn't configurable in the MVP (only the prefix). OK?
5. **Parent passwords for imported guardians:** not shown in bulk, since printing a list of passwords is risky. The admin uses "Reset password" per parent when they want to log in. Guardians added through the admission form get their temporary password shown once. OK?
6. **CSV parsing:** a small in-house RFC 4180 parser (about 50 lines, fully unit-tested) instead of adding `papaparse`. Imports are simple, and avoiding a dependency follows rule 6. OK, or would you rather approve `papaparse`?
7. **Removing a student** is a soft delete. Graduated and withdrawn statuses come with promotion (Phase 9). OK?
8. **Writes are admin-only** (admit, edit, import, guardians). Principals read everything. OK?
9. **Student fields:** first, middle and last name, gender, date of birth, state of origin, LGA, address, department, photo. No religion, blood group or medical info (NDPA: collect only what's needed). OK?
10. **Packages:** none new (assuming question 6 stays in-house).
