# Phase 6 — Score entry

**Status:** Approved 2026-10-13 (all open-question recommendations accepted)
**Roadmap ref:** `docs/roadmap.md` → Phase 6

## Goal
Teachers record the term's assessment so Phase 7 can compute results and print report cards.
- **Subject teachers** pick term → class arm → subject and type CA1 / CA2 / Exam (the school's assessment split) into a keyboard-friendly grid. Each cell is validated, and nothing is saved until they press **Save**.
- **Class teachers** rate each student's affective and psychomotor traits (1–5) and write the class teacher's comment.
- **Locking:** an arm's term can be locked so nobody edits its scores. Admin and principal lock and unlock it by hand now; Phase 7's publish step will lock it automatically.

## User stories
- As a **subject teacher**, I see "My score sheets": every subject and arm I'm assigned this session, with progress (e.g. "28/30 students complete").
  - I open one and see the arm's students (photo, name, admission number) with one column per component (max shown in the header), plus a live Total and Grade.
- I type scores and move around with the keyboard:
  - **Enter** / **↓** go down, **↑** goes up, **Tab** goes right. The next student's same column is the common path.
  - An invalid value (above the max, negative, not a number) turns the cell red with a message and blocks Save.
  - I can mark a student **absent** for a component by typing `ABS` (or `a`), which is different from leaving it blank.
  - Unsaved cells are highlighted; leaving the page with unsaved changes asks for confirmation.
- As a **subject teacher**, I can only open sheets for my own subject and arm pairs (403 otherwise). I can only edit the **current term**; earlier terms are read-only.
- As a **class teacher**, I open "Ratings & comments" for my arm. For each student I give 1–5 for each affective and psychomotor trait and write a comment (up to 500 characters), then save.
- As an **admin or principal**, I can open any sheet and enter or correct scores and ratings for any term of the current session (to cover for a teacher). I can also lock or unlock an arm's term. Locked sheets are read-only for everyone until unlocked.
- **Nursery** subjects use a skill rating per subject (Excellent / Very Good / Good / Needs Improvement) instead of numeric components (domain rule).
- **Bursars and parents** have no access. Another school's data is a 404.

## Decisions baked in (see open questions)
- **Score values:** whole numbers, 0 ≤ score ≤ component max. Blank = not entered (no row). `ABS` = absent, stored explicitly, and Phase 7 treats it as 0 for the total.
- **Who enters scores:** the subject teacher for their assigned (arm, subject) pairs in the session, plus admin and principal for any sheet. Class teachers don't enter subject scores unless they're also assigned the subject.
- **Which term:**
  - **Subject and class teachers:** the current term only.
  - **Admin and principal:** any term of the current session.
  - **Earlier sessions:** read-only for everyone.
  - **Locked (arm, term):** read-only until admin or principal unlocks it.
- **Which students a sheet lists:** active students enrolled in the arm for the term's session.
  - **SSS department subjects:** only students in that department.
  - **SSS students with no department:** core subjects only. The sheet notes how many students were skipped for that reason.
- **The assessment split is frozen once scores exist.** Saving it replaces the components, so once any score references them, `PUT /api/assessment-components` returns **409** ("Scores have already been entered with this split"). Changing the split mid-session would make earlier scores meaningless.
- **Traits are a fixed list in the MVP** (not configurable):
  - **Affective:** Punctuality, Neatness, Politeness, Honesty, Relationship with others, Attentiveness.
  - **Psychomotor:** Handwriting, Sports, Drawing & crafts, Verbal fluency.
- **Save is explicit and partial:** only changed cells are sent, as a bulk upsert in one transaction, and the whole save is refused if any cell is invalid. A cleared cell deletes that entry.

## Schema changes (migration `0006_scores`)
```
score_entries:
  id, schoolId, termId (FK, restrict), studentId (FK, restrict), subjectId (FK, restrict),
  componentId (assessment_components, restrict), score integer null, absent boolean default false,
  enteredById (users, set null), timestamps
  unique(schoolId, termId, studentId, subjectId, componentId)
  check(absent = (score is null))            -- exactly one of: a score, or absent
  index(schoolId, termId, subjectId)

nursery_ratings:                              -- Nursery: one skill rating per subject
  id, schoolId, termId, studentId, subjectId, rating enum(excellent|very_good|good|needs_improvement),
  enteredById, timestamps
  unique(schoolId, termId, studentId, subjectId)

trait_ratings:
  id, schoolId, termId, studentId, trait text (key from TRAITS), rating smallint 1–5, enteredById, timestamps
  unique(schoolId, termId, studentId, trait)

term_comments:                                -- class teacher's comment (principal's comes in Phase 7)
  id, schoolId, termId, studentId, classTeacherComment text, enteredById, timestamps
  unique(schoolId, termId, studentId)

score_locks:
  id, schoolId, termId, classArmId, lockedById, timestamps
  unique(schoolId, termId, classArmId)
```
- **Score entries carry no arm:** a student who changes arm keeps their subject scores for the term.
- **Delete guards:** deleting a subject or session with scores → 409. Students are soft-deleted, so they need no guard.

## Rules & pure helpers (test-first)
- **`shared/utils/scores.ts`:**
  - **`parseScoreCell(input, max)`** → `{ ok: true, value: { score: number | null, absent: boolean } } | { ok: false, message }`. Rules:
    - `''` → blank;
    - `abs` / `a` (any case) → absent;
    - whole numbers 0…max;
    - `'7.5'`, `'-1'`, `'21'` when max is 20, and `'x'` are errors with clear messages.
  - **`sheetTotal(cells)`** → the total, or null while every cell is blank. Absent counts as 0.
  - **`gradeFor(total, bands)`** → `{ grade, remark }` from the section's scale, or null when there's no total. Tested at the band boundaries 39/40, 69/70, 74/75 and 100.
  - **`studentOffersSubject(student, subject)`:** the SSS department rule.
- **`shared/constants/traits.ts`:** `AFFECTIVE_TRAITS`, `PSYCHOMOTOR_TRAITS` (key + label), `NURSERY_RATINGS`.
- **Zod schemas (`shared/schemas/scores.ts`):** save sheet, save ratings, sheet queries, lock body.

## API routes
All routes:
- resolve the tenant with `requireTenant`;
- validate input with Zod;
- never read `schoolId` from input;
- return 404 for another school's ids.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/scores/sheets` | admin, principal, teacher | My sheets for the current term. **Teacher:** assigned (arm, subject) pairs. **Admin/principal:** every arm × section subject. Each comes with progress `{ students, complete }` and `locked`. |
| GET | `/api/scores/sheet?termId&classArmId&subjectId` | admin, principal, the subject teacher | `{ term, arm, subject, mode: 'scores' \| 'rating', components, bands, locked, canEdit, skippedNoDepartment, students: [{ id, name, admissionNumber, photoUrl, cells }] }`. `termId` defaults to the current term. |
| PUT | `/api/scores/sheet` | admin, principal, the subject teacher | `{ termId, classArmId, subjectId, entries: [{ studentId, componentId, value }] }`, where `value` is a number, `'ABS'` or `null`; for Nursery, `[{ studentId, rating \| null }]`. One transaction. 400 with `data.cellErrors: [{ studentId, componentId?, message }]`, or 409 when locked. |
| GET | `/api/ratings/sheet?termId&classArmId` | admin, principal, the arm's class teacher | Students × traits plus the comment |
| PUT | `/api/ratings/sheet` | admin, principal, the arm's class teacher | `{ termId, classArmId, students: [{ studentId, ratings: { [trait]: 1–5 \| null }, comment }] }` (bulk upsert; 409 when locked) |
| PUT / DELETE | `/api/scores/locks` | admin, principal | `{ termId, classArmId }`: lock or unlock the arm's term |
| PUT | `/api/assessment-components` | admin | (Phase 2) now 409 once any score exists |

Wrong role, or a teacher not assigned to the pair or arm → **403**. Another school's ids → **404**.

## Pages & components
- **`/scores`** (admin, principal, teacher): "My score sheets" cards grouped by arm. Each card shows the subject, a progress bar, and a "Locked" badge. Admin and principal get a filter by class and a lock/unlock action per arm.
- **`/scores/[armId]/[subjectId]`** (with `?term=`):
  - **`ScoreGrid` component:** sticky student column and header; one input per component with `inputmode="numeric"`; live Total and Grade; per-cell error text; dirty highlighting.
  - **Keyboard navigation:** Enter / ↓ / ↑ / Tab, as above.
  - **Save** sends only the changed cells; a "You have unsaved changes" guard runs on route leave.
  - **Read-only state** with a reason ("Locked", "Earlier term").
  - **Mobile:** the grid scrolls horizontally inside its card, the student column stays sticky, and the inputs are big enough to tap.
- **`/scores/ratings`** (class teacher of an arm, admin, principal): arm picker → a list of students. Each expands to trait 1–5 segmented controls and the comment, with one Save for the page.
- **Settings → Assessment & grading:** a note and a disabled split editor once scores exist.
- **Dashboard ("My classes"):** each subject shows "Scores: 28/30 complete" with a link.
- **Nav:** Scores (admin, principal, teacher).

## Seed (demo)
- **Greenfield, current term:**
  - **JSS 1A Mathematics** (Tunde Adeyemi): complete scores for all 10 students, with one ABS.
  - **JSS 1B Mathematics:** half entered, so progress is visible.
  - **JSS 1A ratings and comments** for half the class.
  - **Nursery 1A:** ratings for one subject.
- **Sunrise:** one sheet partly filled, so isolation is visible.
- Re-runnable: upserts by the unique keys.

## Test plan
### Unit
- **`scores.test.ts`:**
  - `parseScoreCell`: blank, ABS / a, 0, max, max+1, negative, decimal, non-numeric, whitespace;
  - `sheetTotal`: all blank → null, absent → 0, mixed;
  - `gradeFor`: boundaries 39/40, 69/70, 74/75, 100 for both scales;
  - `studentOffersSubject`: core, department match, mismatch, no department.
- **Schema tests:** `saveSheetSchema` (value union, duplicates), `saveRatingsSchema` (1–5, unknown trait, comment length).

### Integration (PGlite, two schools)
- **`scores-sheet.test.ts`:**
  - **Permission matrix** on every route: the assigned subject teacher; a teacher of another subject in the same arm (403); class teacher only (403); admin; principal; bursar (403); parent (403); no session (401).
  - **Save:**
    - bulk upsert creates entries (with `enteredById`);
    - a second save updates them;
    - `null` deletes;
    - ABS is stored as absent with a null score.
  - **Validation:** above max, negative, decimal, a student not in the sheet, a component not the school's, an SSS department mismatch → 400 with `cellErrors`, and nothing saved.
  - **Terms:** a teacher saving to a past term → 403; the admin can; a term from another session → 403 for everyone.
  - **Locking:**
    - a locked sheet → 409 for everyone; unlock → saving works again;
    - lock and unlock are admin/principal only.
  - **Sheet contents:**
    - roster rules (department filter, removed students excluded, `skippedNoDepartment`);
    - progress counts in `/api/scores/sheets`;
    - Nursery uses rating mode.
  - **Assessment freeze:** `PUT /api/assessment-components` → 409 once a score exists.
  - **Tenant isolation:**
    - another school's arm, subject or term → 404 with no DB change;
    - a School A session on School B → 401;
    - `schoolId` in the body is ignored.
- **`ratings-sheet.test.ts`:**
  - class teacher-only access (a subject teacher → 403);
  - 1–5 validation; unknown trait → 400;
  - the comment is saved; `null` clears;
  - locked → 409;
  - tenant isolation.
- **`setup-guards.test.ts`** (extend): deleting a subject or session with scores → 409.

### Nuxt
- **`score-grid.test.ts`:**
  - renders components with their max;
  - Enter / ↓ / ↑ / Tab move the focus;
  - an invalid value shows its message and disables Save;
  - ABS is accepted;
  - live total and grade;
  - only dirty cells are emitted on save;
  - read-only mode.
- **`navigation.test.ts`** (extend).

### E2E
- **`scores.spec.ts`** (desktop: enters data):
  - the JSS 1B Mathematics teacher types scores using the keyboard only;
  - an invalid cell blocks Save;
  - fixing it and saving works, and after a reload the scores are kept;
  - the admin locks the arm and the teacher sees it read-only; the admin unlocks;
  - cleanup through the API.
- **`scores.spec.ts`** (mobile): the grid scrolls inside its card with no page overflow, and one score can be saved.
- **`ratings.spec.ts`:** the class teacher rates one student and writes a comment (desktop).
- **`forbidden.spec.ts`** (extend): a bursar opening `/scores` is redirected.

## Implementation sub-steps
1. **Pure helpers (test-first):** cell parsing, totals, grades, the offering rule, traits, schemas.
2. **Schema + guards + seed:** migration `0006`, factories, subject/session delete guards, assessment freeze, demo scores.
3. **Score sheet API:** sheets list, get, save, locks — with permission, validation, locking and tenant tests.
4. **Ratings & comments API.**
5. **Frontend:** `/scores`, `ScoreGrid` page, `/scores/ratings`, the assessment-settings note, My classes progress, nav, Nuxt tests.
6. **E2E + docs:** specs, `domain.md`, decisions, `PROGRESS.md`, CI.

## Acceptance checklist
- [x] Teachers only see and edit their assigned subject/arm pairs (403 otherwise); admin and principal can cover any sheet
- [x] Keyboard-friendly grid with per-cell validation; invalid scores can't be saved (client and server); blank ≠ 0 ≠ ABS
- [x] Explicit save as a bulk upsert in one transaction
- [x] Locked (arm, term) scores and ratings can't be edited; only admin and principal lock and unlock
- [x] Class teacher enters affective/psychomotor ratings (1–5) and comments for their arm
- [x] Nursery uses skill ratings per subject
- [x] The assessment split is frozen once scores exist; subjects and sessions with scores can't be deleted
- [x] Every route: validation, roles, tenant isolation tested
- [x] Works at 375px (grid scrolls inside its card)
- [x] Seed updated; `pnpm check`, `pnpm test:e2e` and CI green

## Open questions
1. **Whole-number scores only** (no 7.5)? Most Nigerian schools record whole marks. OK?
2. **Absent (ABS) counts as 0** in the subject total (Phase 7), but is shown as "ABS" on the sheet and report card. OK, or should an absent exam exclude the subject from the average?
3. **Who enters scores:** the assigned subject teacher, plus admin and principal for any sheet. OK?
4. **Terms:** teachers edit the current term only; admin and principal can edit any term of the current session; earlier sessions are read-only. OK?
5. **Locking now:** a manual lock/unlock per arm and term by admin or principal. Phase 7's publish will lock automatically, and only admin/principal can unlock. OK?
6. **SSS students without a department** get core subjects only, and their sheets say how many were skipped. OK, or should they get every department subject until assigned?
7. **Freezing the assessment split** once any score exists (a 409 on change). Changing the split later would need a per-session snapshot, which is post-MVP. OK?
8. **Traits:** the fixed lists above, not configurable in the MVP, rated 1–5. OK, or do you want different traits?
9. **Nursery:** one skill rating per subject per term (Excellent / Very Good / Good / Needs Improvement), and no numeric scores. OK?
10. **Packages:** none new.
