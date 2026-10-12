# Phase 5 — Attendance

**Status:** Approved 2026-10-12 (all open-question recommendations accepted)
**Roadmap ref:** `docs/roadmap.md` → Phase 5

## Goal
Class teachers take a daily register for their arm on a phone in under a minute, and the school can see each student's attendance for the term.
- **Register:** one per class arm per school day. Each student is **present**, **absent** or **late**. Everyone starts as present, so the teacher only taps the exceptions, then saves once.
- **Term summary:** for each student, the days the school opened, plus days present, absent and late. This becomes "times present / times school opened" on the report card (Phase 7) and the parent portal (Phase 9).

## User stories
- As a **class teacher**, I open Attendance and get today's register for my arm. If I'm class teacher of several arms, I choose one. I see every student in the arm (photo, name, admission number), all marked present.
  - I tap **A** or **L** for the exceptions and see the counts update (Present 28 · Absent 2 · Late 1). Then I tap **Save register**.
  - I can reopen today's register and correct it **the same day**. After that day it's read-only for me.
- As an **admin or principal**, I can open any arm's register for any date in the current term up to today. I can take or correct it, for example when the class teacher was away, and I can delete a register taken by mistake (e.g. on a holiday).
- As a **class teacher, admin or principal**, I see the **term summary** for an arm: each student's days opened, present, absent and late, and attendance %.
- As **staff who can see a student** (Phase 4 rules, except the bursar), I see "Attendance this term" on the student's profile, with the dates they were absent or late.
- As a **teacher who isn't the arm's class teacher**, I can't take or edit its register (403). Another school's arms and registers are 404.

## Decisions baked in (see open questions)
- **Who takes the register:** the class teacher of the arm (current session assignment, Phase 3), plus admin and principal for any arm. Subject teachers, bursars and parents can't.
- **Which dates:**
  - **Class teacher:** today only. "Today" is the Africa/Lagos date, computed on the server.
  - **Admin / principal:** any date from the current term's start date (if set) up to today, and not after the term's end date (if set).
  - Future dates are always refused.
  - Registers belong to the **current term**; past terms are read-only.
  - No weekday rule: some schools open on Saturdays. "Days opened" counts registers that were actually taken.
- **Late counts as present** for "days present", but is shown separately.
- **A register is complete or not saved:** saving must include every active student enrolled in the arm for the session, exactly once. Students admitted later appear (as present) the next time the register is opened, and the next save includes them.
- **Per-student summary from their own marks:** a student's "days opened" is the number of registers that include them. A student who joined mid-term or changed arm is counted correctly without extra rules.
- **Removed students** (soft-deleted) keep their marks but don't appear on new registers or summaries.

## Schema changes (migration `0005_attendance`)
```
attendanceStatus enum: present | absent | late

attendance_registers:
  id, schoolId, termId (FK, restrict), classArmId (FK, restrict), date (date),
  takenById (users, set null), timestamps
  unique(schoolId, classArmId, date)          -- one register per arm per day
  index(schoolId, termId, classArmId)

attendance_marks:
  id, schoolId, registerId (FK, cascade), studentId (FK, restrict), status attendanceStatus, timestamps
  unique(schoolId, registerId, studentId)
  index(schoolId, studentId)
```
- **Phase 2/4 guards:** deleting a class arm, term/session or student that has registers or marks → 409. The FKs use `restrict`, and a friendly check gives the message.
- `updatedAt` on the register records the last correction; `takenById` is whoever saved it last.

## Rules & pure helpers (test-first)
- **`shared/utils/dates.ts` → `todayIn(timeZone, now = new Date())`:** the ISO date in Africa/Lagos. Tested around midnight UTC (23:30 UTC is already the next day in Lagos, UTC+1).
- **`shared/utils/attendance.ts`:**
  - **`summariseAttendance(marks)`** → `{ opened, present, absent, late, rate }`.
    - `present` includes late.
    - `rate = present / opened`, rounded to a whole percent, or `null` when nothing is marked.
  - **`registerDateError({ date, today, term, canBackfill })`** → a message, or `null` when the date is allowed:
    - "You can only take today's register" (class teacher, not today);
    - "That date is in the future";
    - "That date is before this term started";
    - "That date is after this term ended".
- **Save validation (server):** `marks` covers exactly the arm's active enrolled students. A missing, duplicate, unknown or other-arm student is a 400 naming the problem.

## API routes
All routes:
- resolve the tenant with `requireTenant`;
- Zod-validate their input;
- never read `schoolId` from input;
- return 404 for another school's ids.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/attendance/arms` | admin, principal, teacher | Arms I can take registers for, with today's status (`taken` / `notTaken`) and today's date. Teachers: only their class-teacher arms (current session). |
| GET | `/api/attendance/register?classArmId&date` | admin, principal, class teacher of the arm | The register for that arm and date (date defaults to today). Returns `{ date, arm, term, register: { id, takenBy, updatedAt } \| null, canEdit, students: [{ id, name, admissionNumber, photoUrl, status \| null }] }`. Viewing a past date is allowed (read-only for class teachers). |
| PUT | `/api/attendance/register` | admin, principal, class teacher of the arm | `{ classArmId, date, marks: [{ studentId, status }] }`. Creates or replaces the register's marks in one transaction (concurrent first saves can't create two). 201 on create, 200 on update. |
| DELETE | `/api/attendance/registers/[id]` | admin, principal | Delete a register taken by mistake (with its marks) |
| GET | `/api/attendance/summary?classArmId&termId?` | admin, principal, class teacher of the arm | Term summary per active student in the arm. The term defaults to current. |
| GET | `/api/students/[id]/attendance?termId?` | admin, principal, teachers who can see the student | The student's term summary, plus the dates they were absent or late |

Wrong role, or a teacher who isn't the arm's class teacher → **403**. An unknown arm, register or student, or another school's → **404**.

## Pages & components
- **`/attendance`** (admin, principal, teacher):
  - **Arm picker.** Skipped when a teacher has only one arm. It shows a "Taken" or "Not taken" badge for today.
  - **Date.** Today, shown as `DD/MM/YYYY`. Admin and principal get a date input limited to the term and today.
  - **`AttendanceRegister` component:**
    - one row per student (avatar, name, admission number) with a three-way **P / A / L** segmented control;
    - "Mark all present";
    - live counts;
    - a sticky **Save register** button at the bottom on mobile;
    - "Taken by … at 08:05" once saved;
    - read-only with a note when `canEdit` is false.
  - **Empty states:** a teacher who isn't a class teacher ("Attendance is taken by class teachers. You're not a class teacher this session."); an arm with no students; no current term.
- **`/attendance/summary`** (same roles): arm picker, then a table (name, opened, present, absent, late, %), sortable by %. Server-side data; at most ~60 students per arm, so no pagination.
- **Student profile:** an "Attendance this term" card with the counts, %, and the absent and late dates. Hidden from the bursar.
- **Dashboard ("My classes"):** class-teacher arms show "Register: taken / not taken today", with a "Take register" link.
- **Nav:** Attendance (admin, principal, teacher).

## Seed (demo)
- **Greenfield:** JSS 1A registers for the 10 school days (Mon–Fri) before the seed date, within the current term. They have a few absences and lates, so the summary and profile have data. JSS 1B has none (an untaken state to demo). No register for today, so the demo can take it.
- **Sunrise:** two registers for JSS 1 Gold (isolation is visible).
- Re-runnable: upsert by (arm, date). Dates are relative to the seed date, kept inside the term.
- **E2E global setup:** sets the current term's dates so today is inside them. The E2E database is seeded on any day, and the seeded term (14/09–18/12/2026) won't always contain the real date. The demo seed itself is unchanged.

## Test plan
### Unit
- **`attendance.test.ts`:**
  - `summariseAttendance`: none marked → `rate: null`; all present; mixed; late counts as present; rounding (2/3 → 67%).
  - `registerDateError`: today, yesterday for a class teacher, future, before start, after end, null term dates, admin backfill inside the term.
- **`dates.test.ts`** (extend): `todayIn` around midnight UTC.

### Integration (PGlite, two schools)
- **`attendance-register.test.ts`:**
  - **Permission matrix** for every route (admin, principal, class teacher of the arm, another teacher, bursar, parent): 401 without a session; 403 for the wrong role or wrong teacher.
  - **Saving:** take a register → 201, with the register and marks in the DB. Save again the same day (edit) → 200, still one register, marks replaced.
  - **Concurrency:** two concurrent first saves → exactly one register.
  - **Dates:**
    - a class teacher saving yesterday or tomorrow → 400;
    - an admin back-filling a date in the term → 201;
    - before the term start or after its end → 400;
    - no current term → 400.
  - **Marks must be complete:**
    - a missing student, a duplicate, another arm's student or a removed student → 400;
    - a student admitted after the register was taken shows with `status: null`.
  - **Delete:** admin deletes a register (marks cascade); a teacher → 403.
  - **Tenant isolation:**
    - another school's arm, register or student → 404, with no DB change;
    - a School A session on School B's host → 401;
    - a `schoolId` in the body is ignored.
- **`attendance-summary.test.ts`:**
  - per-student totals match the marks;
  - a student who changed arm mid-term counts both arms' registers;
  - removed students are excluded;
  - the student-profile summary lists absent and late dates;
  - the bursar → 403; a teacher who can't see the student → 404 (Phase 4 rule).
- **`setup-guards.test.ts`** (extend): deleting an arm, session or term that has registers → 409.

### Nuxt
- **`attendance-register.test.ts`:**
  - unmarked students default to present;
  - tapping A or L changes the status and the counts;
  - "Mark all present";
  - Save emits exactly one mark per student;
  - read-only mode disables the controls.
- **`navigation.test.ts`** (extend): Attendance for admin, principal and teacher; not for bursar or parent.

### E2E
- **`attendance.spec.ts`** (mobile project):
  - the class teacher (`teacher@greenfield.test`, JSS 1A) opens Attendance, marks one student absent and one late, saves, and sees "Taken by …";
  - after a reload, the marks are kept;
  - the summary shows the absence;
  - cleanup: the admin deletes today's register through the API.
- **`attendance.spec.ts`** (desktop project): the JSS 1B class teacher does the same for JSS 1B, so the two projects never write the same register.
- **`forbidden.spec.ts`** (extend): a bursar opening `/attendance` is redirected.
- **`layout.spec.ts`** (mobile, extend): `/attendance` and `/attendance/summary` fit 375px without horizontal scroll.

## Implementation sub-steps
1. **Pure helpers (test-first):** `todayIn`, `summariseAttendance`, `registerDateError`, Zod schemas.
2. **Schema + guards + seed:** migration `0005`, factories, delete guards (arm, session/term, student), demo registers.
3. **Register API:** arms, get, save (transaction, upsert, completeness, dates), delete — with permission and tenant tests.
4. **Summary API:** arm summary and student summary.
5. **Frontend:** `/attendance` with `AttendanceRegister`, `/attendance/summary`, profile card, My classes hint, nav, and Nuxt tests.
6. **E2E + docs:** E2E global-setup term dates, specs, docs (`domain.md`, decisions, `PROGRESS.md`), CI.

## Acceptance checklist
- [x] A class teacher takes today's register on a phone: everyone present by default, exceptions tapped, one save, under a minute
- [x] One register per arm per day (DB-unique, concurrent saves safe); same-day edits by the class teacher
- [x] Teachers can only mark their own arm (403 otherwise); admin and principal can take or correct any date in the term, or delete a register
- [x] Term summary per student (arm table + profile card), late counted as present
- [x] Arms, terms/sessions and students with attendance can't be deleted
- [x] Every route: validation, roles, tenant isolation tested
- [x] Works at 375px
- [x] Seed updated; `pnpm check`, `pnpm test:e2e` and CI green

## Open questions
1. **Who can take the register:** the class teacher for their arm, plus admin and principal for any arm (to cover an absent class teacher). OK, or class teacher only?
2. **Editing window:** class teachers can edit only today's register; admin and principal can back-fill or correct any date in the current term. OK, or should class teachers also get e.g. "yesterday"?
3. **Late counts as present** in "days present" (shown separately as late). OK?
4. **No weekday or holiday calendar:** any date can have a register, and "days opened" = registers actually taken. A register taken on a holiday by mistake can be deleted by admin/principal. OK?
5. **Status values:** present / absent / late only, with no "excused absence" or reason. OK for the MVP?
6. **Parents** see attendance in Phase 9 (parent portal), not now. OK?
7. **Packages:** none new.
