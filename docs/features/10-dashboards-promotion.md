# Phase 10 — Dashboards & promotion

**Status:** Approved (2026-10-14), in progress
**Roadmap ref:** `docs/roadmap.md` → Phase 10

## Goal
1. **Dashboards:** each staff role opens the app to the numbers it cares about today. The numbers must match what the detailed pages show:
   - student counts;
   - today's attendance;
   - fees collected vs expected;
   - result-entry progress.
2. **Promotion:** at the end of a session the admin moves every class into the next session in one step per class:
   - **promote** to the next class (the default);
   - per-student exceptions: **repeat**, **withdraw**, **graduate**;
   - the last class (SSS 3) **graduates** by default.

   Promotion is **transactional** and **can't run twice** for the same class and session.

## User stories
### Dashboards
- **Admin and principal** see four blocks:
  - **Students:** how many are enrolled this session, by section (Nursery, Primary, JSS, SSS) and by gender.
  - **Attendance today:** registers taken (e.g. "9 of 14 classes"), today's rate, and the classes not taken yet (each links to the register).
  - **Fees this term:** expected, collected, outstanding and % collected, plus today's collections. Links go to Collections and Debtors.
  - **Results this term:** score sheets complete (e.g. "62 of 140"), and classes by status (Draft / Submitted / Published). Links go to Scores and Results.
- **Bursar:** the Students and Fees blocks, and the number of debtors. Nothing academic.
- **Teacher:** unchanged. "My classes" already shows each class's register status and score progress.
- **Parent:** unchanged. The child cards come from Phase 9.
- Every number on the dashboard is computed by the **same services as the detailed pages**:
  - collections (Phase 8);
  - the attendance summary (Phase 5);
  - the score-sheet progress (Phase 6);
  - result statuses (Phase 7).

  Tests check that the numbers match.

### Promotion (admin only)
- On **Promotion** I see:
  - the current session (from) and the **next session** (to). The next session must already exist in Calendar; otherwise the page says "Create 2027/2028 in Calendar first";
  - every class arm, with its students and its state: **Not promoted** or **Promoted** (by whom, when).
- **Opening an arm** shows each student with:
  - this session's **third-term average**, if the results are published (for information only);
  - an **outcome**: Promote / Repeat / Withdraw / Graduate;
  - a **target arm**.
- **Defaults:**
  - **Promote** to the next class level, into the **arm with the same name** (JSS 1A → JSS 2A). If the next level has no arm with that name, the target is left blank and I must choose one.
  - The next level follows the school's class order across sections: Nursery 2 → Primary 1, Primary 6 → JSS 1, JSS 3 → SSS 1.
  - The **last class level** of the school (SSS 3) defaults to **Graduate**.
  - **Repeat** keeps the same level and arm name (any arm of that level can be chosen).
- **Confirming** runs one transaction:
  - next-session enrolments for promoted and repeating students;
  - a recorded outcome for everyone (graduated and withdrawn students get no next-session enrolment);
  - the arm marked as promoted.
- **Running it again** for the same arm and session is refused (409 "Already promoted").
- A student already enrolled in the next session is skipped and shown as such (e.g. the admin moved them by hand).
- **Undo:** while the next session is **not yet current**, I can undo an arm's promotion. Its next-session enrolments and outcomes are removed. Once the school switches to the new session, promotion is final.
- **Graduated and withdrawn students** aren't deleted, so their past results and fees stay:
  - the profile shows "Graduated (2026/2027)" or "Withdrawn (2026/2027)";
  - they drop out of the current-session student list once the school moves to the new session, because they have no enrolment there;
  - parents still see past report cards and fees.
- **SSS departments:** moving into SSS (JSS 3 → SSS 1) leaves the department empty for the admin to set. Leaving SSS can't happen except by graduating.
- **Teachers, bursar, principal and parents** can't promote: 403. Principal read-only access is an open question.

## Schema changes
- **`promotion_runs`:** one per (school, from-session, class arm).
  - Columns: `fromSessionId`, `toSessionId`, `classArmId`, `promotedById`, `createdAt`.
  - Constraint: **unique (schoolId, fromSessionId, classArmId)**. This is the "can't run twice" rule, enforced by the database too.
- **`student_promotions`:** one per (school, from-session, student).
  - Columns: `runId` (cascade on undo), `studentId`, `fromClassArmId`, `outcome` (enum `promoted | repeated | graduated | withdrawn`), `toClassArmId` (null when graduated or withdrawn).
  - Constraint: **unique (schoolId, fromSessionId, studentId)**.
- No change to `students`. Graduated or withdrawn status comes from the latest `student_promotions` row. Removing a student (soft delete) stays a separate action.
- One migration. As always, I'll run `db:migrate` on the dev DB straight after generating it.

## Pure functions (test-first)
- **`shared/utils/promotion.ts`:**
  - `nextLevel(levels, levelId)`: the next level by section order then sort order; `null` for the last level.
  - `defaultPlacement({ levels, arms, fromArm })`: returns `{ outcome, toArmId | null }`. The last level graduates, a missing same-name arm gives `null`, and so on.
  - `validatePromotion(rows, arms, levels)`: per-row errors:
    - target arm required for promote/repeat;
    - repeat must stay in the same level;
    - promote must go to a later level;
    - graduate/withdraw take no arm.
- **`shared/utils/dashboard.ts`:**
  - `percentOf(part, whole)`: rounded, null when the whole is 0;
  - `todayAttendance(registers, arms)`: taken / not taken, rate.

## API routes
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/dashboard` | admin, principal, bursar | Role-shaped blocks (the bursar gets no academic blocks) |
| GET | `/api/promotion` | admin | From/to session and every arm with student count and promotion state |
| GET | `/api/promotion/[armId]` | admin | The arm's students with average, default outcome and target arm, and the target arms to choose from |
| POST | `/api/promotion/[armId]` | admin | Body `{ toSessionId, students: [{ studentId, outcome, toClassArmId? }] }`. Every active student of the arm must be listed. One transaction; 409 if already promoted; 400 with per-row errors |
| DELETE | `/api/promotion/[armId]` | admin | Undo: only while the target session isn't current (409 otherwise) |

Every route:
- resolves the tenant;
- checks the role;
- validates input with Zod;
- looks up arms and sessions through `whereSchool`, so another school's ids → 404;
- has cross-tenant tests.

## Pages & components
- **Dashboard (`/`):** `DashboardStats` (students, attendance today, fees, results blocks) for admin/principal and bursar. Tiles stack on a phone. Teachers and parents keep their current dashboards.
- **`/promotion`** (admin): from → to sessions, and the arms grouped by section with state badges. It's in the School setup nav group.
- **`/promotion/[armId]`** (admin):
  - a table on desktop and cards on a phone: student, average, outcome select, target-arm select;
  - "Set all to…" for quick bulk changes;
  - a summary ("6 promoted · 1 repeating · 1 withdrawn");
  - Confirm, behind a dialog;
  - after promotion: the outcomes, read-only, and **Undo** (while allowed).
- **Student profile:** a "Graduated / Withdrawn (session)" badge, and next session's class when promoted.

## Seed (demo)
- Greenfield gets a **2027/2028** session (not current), so promotion can be demoed straight away.
- **SSS 3A** with three students, so graduation shows by default.
- **Nothing is promoted in the seed.** The demo is doing it.

## Test plan
### Unit
- **`promotion.test.ts`:**
  - next level within a section and across sections;
  - last level → graduate;
  - same-name arm vs missing arm → null;
  - repeat placement;
  - every `validatePromotion` rule.
- **`dashboard.test.ts`:**
  - `percentOf` (zero whole, rounding);
  - `todayAttendance` (no registers, partial, all, late counts as present).

### Integration
- **`dashboard.test.ts`:**
  - **Matches the detail pages:** the numbers equal `collections()`, today's attendance computed from the marks, `listScoreSheets` progress and result statuses on a fixture.
  - **Roles:** the bursar gets no academic blocks; teacher/parent → 403; no session → 401.
  - **Tenancy:** cross-tenant (school B's data never counted).
- **`promotion.test.ts`:**
  - **The happy path:** promote an arm with all four outcomes. Enrolments are created only for promoted and repeating students, and outcomes are recorded.
  - **Can't run twice:** a second run → 409 with nothing changed. Two concurrent runs → one wins (the unique constraint).
  - **All-or-nothing:**
    - a missing student → 400;
    - an invalid row → 400 with row errors and nothing written;
    - a student already enrolled next session is skipped, without failing.
  - **Undo:** works while the next session isn't current, and gives 409 after the switch.
  - **Bad sessions:** no next session, or a target session that isn't later → 400.
  - **Roles:** admin only (principal, teacher, bursar, parent → 403).
  - **Tenancy:** another school's arm, session or student ids → 404 or 400.
  - **SSS:** JSS 3 → SSS 1 leaves the department empty; graduates keep past results, which parents still see.

### Nuxt
- **`dashboard-stats.test.ts`:** blocks per role; empty states (no current term, no bills, no registers).
- **`promotion-arm.test.ts`:** the default outcomes; changing an outcome clears or requires the target arm; the summary counts; Confirm disabled while rows are invalid.

### E2E
- **`promotion.spec.ts`** (desktop; it writes, so the mobile run only checks layout):
  - the admin opens Nursery 1A, sets one student to Repeat and one to Withdraw, confirms, and sees "Promoted";
  - a second Confirm isn't offered;
  - the 2027/2028 student list (by session) shows the promoted students in Nursery 2A;
  - **Undo** puts things back, so the run is repeatable.
- **`dashboard.spec.ts`:**
  - the admin sees the four blocks;
  - "collected" equals the Collections page;
  - the bursar sees fees but no attendance or results;
  - no overflow at 375px.

## Implementation sub-steps
1. Pure `promotion` and `dashboard` utils (tests first).
2. Dashboard service + `/api/dashboard` (integration tests that compare with the detail services) + `DashboardStats` on the home page.
3. Promotion schema + migration, then the service + routes (transaction, idempotency, undo; tests first).
4. Promotion pages, the profile badge, nav, and the seed (2027/2028, SSS 3A).
5. E2E + docs, push, CI.

## Acceptance checklist
- [ ] Dashboard numbers match the underlying data (tested against the detail services)
- [ ] Role-based dashboards: admin/principal full; bursar fees only; teacher/parent unchanged
- [ ] Promotion with per-student repeat / withdraw / graduate; SSS 3 graduates by default
- [ ] Promotion is transactional and can't run twice for the same arm and session (DB-enforced)
- [ ] Works at 375px; seed updated; `pnpm check`, `pnpm test:e2e` and CI green

## Open questions (resolved 2026-10-14: all approved as recommended)
1. **Promote per class arm** (one confirm per arm, each with its own exceptions), not the whole school in one go? I recommend per arm: it's easier to review, and "can't run twice" applies per arm and session.
2. **Undo until the new session becomes current**, then final? I recommend yes: it fixes mistakes and keeps E2E repeatable. The alternative is no undo at all (fix students one by one with "Change class").
3. **No automatic repeat by average.** The third-term average is shown for information, and the admin decides exceptions. Or should there be a pass mark?
4. **Results not required:** can an arm be promoted before its third-term results are published? I recommend allowing it, with a warning badge.
5. **Withdraw ≠ remove:** a withdrawn student keeps their record and parent access to past results, but isn't enrolled next session. "Remove" (soft delete) stays separate. OK?
6. **Principal:** may they view the promotion pages read-only, or should promotion stay admin only (recommended for MVP)?
7. **Seed:** add SSS 3A (three students) and a 2027/2028 session to Greenfield so graduation and promotion are demoable. OK?
8. **Packages:** none new.
