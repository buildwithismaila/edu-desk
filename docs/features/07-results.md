# Phase 7 — Results & report cards

**Status:** Approved 2026-10-13 (all open-question recommendations accepted)
**Roadmap ref:** `docs/roadmap.md` → Phase 7

## Goal
The school turns the term's scores into results and prints report cards.
- A **results service** computes, for each student in a class arm:
  - subject totals, grades and remarks;
  - the overall total, number of subjects and average;
  - **position** (competition ranking: 1, 2, 3, 3, 5);
  - per-subject class statistics;
  - in the third term, a **cumulative average**.
- Results go through **Draft → Submitted (class teacher) → Published (principal)**. Submitting and publishing lock the scores, and publishing freezes the report cards exactly as published.
- The principal (or head teacher) writes **principal's comments**.
- An **A4 report card** prints cleanly, one page per student, and there's a class **broadsheet**.
- **Parents** can see their children's report cards **only once published**. This is a small entry point from "My children"; the full parent portal is Phase 9.

## User stories
- As a **class teacher**, I open Results for my arm and see each student's total, average and position, plus a **completeness checklist** ("Mathematics: 2 students without an Exam score"). I can preview report cards and the broadsheet, and **Submit** when the scores are complete. Submitting locks the scores.
- As a **principal or admin**, I see every arm's status for the term:
  - I review a submitted arm, write principal's comments, then **Publish**. Publishing freezes the report cards and parents can see them.
  - I can **Return to draft** with a reason, which unlocks the scores, or **Unpublish**, which takes the report cards back from parents and returns the arm to Submitted.
- As **staff who can see results** (admin, principal, the arm's class teacher), I print all the arm's report cards (one A4 page each) or one student's, and the broadsheet (A4 landscape).
- As a **parent**, I see "Report card · First Term" on my child's card once it's published, and can open and print it. Unpublished results are invisible to me (404).
- **Subject teachers, bursars and other parents** can't see an arm's results.

## Decisions baked in (see open questions)
- **Computation (pure, test-first, `shared/utils/results.ts`)**, following `docs/domain.md`:
  - **Subject total** = the sum of entered components (ABS = 0). A subject counts as **offered** when the student has at least one entered cell (score or ABS) in it.
  - **Average** = overall total ÷ subjects offered. It's kept exact for ranking and rounded to 2 decimal places only for display.
  - **Position:** competition ranking by average (ties share a position, and the next position skips). Averages are compared exactly as integer cross-products, so floating-point error can't break a tie. Students with no scores are not ranked.
  - **"Number in class"** = the active students enrolled in the arm.
  - **Subject stats:** class average, highest and lowest total, and per-subject position (competition ranking).
  - **Third term:** cumulative average = the mean of the student's term averages in that session (only the terms they have).
  - **Positions toggle:** when the school sets `showPositions` off, positions are hidden on report cards and the broadsheet (they're still computed).
  - **Nursery:** no totals or positions; the report card shows the skill rating per subject.
- **Workflow per (term, arm):**
  - **Draft:** no row.
  - **Submitted:** the class teacher, admin or principal submits. It needs complete sheets: every offered student has every component (ABS is fine). Nursery needs every subject rated. Submitting adds the score lock.
  - **Published:** admin or principal publishes a submitted arm. It stores a **snapshot** of each student's report card (JSON), so later changes to grading scales or students don't alter a published card.
  - **Moving back:** Return to draft (submitted → draft, with a reason, removing the lock); Unpublish (published → submitted, deleting the snapshots).
  - **Manual locks:** a lock from Phase 6 can't be removed while the arm is submitted or published (409, "Return it to draft first").
- **Principal's comment:** a `principalComment` on `term_comments`. Admin or principal writes it while the arm is draft or submitted. Clearing a class teacher's comment now nulls the column instead of deleting the row (Phase 6 decision 033).
- **Report card contents (`docs/domain.md`):**
  - **School:** logo, name, address and motto.
  - **Student:** photo, name, admission number, class arm, session and term.
  - **Subjects:** a table of CA1/CA2/Exam (the school's components), Total, Grade and Remark.
  - **Summary:** total, average, position (if enabled) and number in class.
  - **Attendance:** days present / days opened (Phase 5).
  - **Ratings and comments:** affective and psychomotor ratings, the class teacher's comment, and the principal's comment.
  - **Next term begins** date.
  - **Outstanding fees** comes in Phase 8 (left out now).
- **Printing:** plain HTML with the existing `print` layout and A4 CSS; no PDF library. One card per page uses `break-after: page`; the broadsheet is landscape.

## Schema changes (migration `0007_results`)
```
resultStatus enum: submitted | published

result_statuses:                        -- no row = Draft
  id, schoolId, termId, classArmId, status resultStatus,
  submittedById, submittedAt, publishedById, publishedAt, returnedReason text,
  timestamps
  unique(schoolId, termId, classArmId)

published_results:                      -- frozen report cards
  id, schoolId, termId, classArmId, studentId, report jsonb, timestamps
  unique(schoolId, termId, studentId)

term_comments: + principalComment text, + principalCommentById (users, set null)
```

## Rules & pure helpers (test-first)
**`shared/utils/results.ts`:**
- **`computeArmResults({ components, subjects, students, cells, bands })`**, where `students` carry ids and `cells` are (student, subject, component) → score or ABS. Returns per student:
  - subject rows (cells, total, grade, remark, subject position);
  - total, subjects offered, average (exact `{ total, count }` plus a rounded number), and position (or null).
  - It also returns subject stats and the number of ranked students.
- **`competitionRanking(values, compare)`** → positions. Ties share a position; the next position skips.
- **`cumulativeAverage(termAverages)`**.
- **`resultsCompleteness(...)`** → the missing cells per subject: the student names and the components they're missing.
- **Workflow transitions:** `canTransition(status, action, role, isClassTeacher)`, a table tested exhaustively.

## API routes
All routes:
- resolve the tenant;
- validate input with Zod;
- never read `schoolId` from input;
- return 404 for another school's ids.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/results/arms` | admin, principal, teacher | The current term's arms with status. **Teachers:** their class-teacher arms; **admin/principal:** all arms. |
| GET | `/api/results?termId&classArmId` | admin, principal, the arm's class teacher | Status, completeness, ranked student rows and subject stats. **Draft/submitted:** computed live. **Published:** from the snapshots. |
| POST | `/api/results/submit` | class teacher, admin, principal | Draft → Submitted. 400 with completeness problems if incomplete. Adds the lock. |
| POST | `/api/results/publish` | admin, principal | Submitted → Published. Stores the snapshots. |
| POST | `/api/results/return` | admin, principal | Submitted → Draft, with `{ reason }`. Removes the lock. |
| POST | `/api/results/unpublish` | admin, principal | Published → Submitted. Deletes the snapshots. |
| PUT | `/api/results/principal-comments` | admin, principal | `{ termId, classArmId, comments: [{ studentId, comment }] }`. Refused once published. |
| GET | `/api/results/report-cards?termId&classArmId&studentId?` | admin, principal, the class teacher | Report card data for all students (or one). Live when unpublished, the snapshot when published. |
| GET | `/api/students/[id]/report-card?termId` | parent (own child, published only); staff as above | One report card. A parent asking for an unpublished card, or another family's child, gets 404. |
| GET | `/api/results/broadsheet?termId&classArmId` | admin, principal, the class teacher | Students × subjects totals, total, average, position, and the subject stats rows |

Invalid transitions → **409** (e.g. "Only submitted results can be published"). Wrong role → **403**.

## Pages & components
- **`/results`** (admin, principal, teacher): arms for the current term with status badges (Draft / Submitted / Published). Teachers see their class-teacher arms.
- **`/results/[armId]`** (`?term=`):
  - status and history ("Submitted by … on …", or the reason it was returned);
  - completeness checklist;
  - ranked table: name, subjects, total, average, position;
  - action buttons by role and status (Submit / Publish / Return to draft / Unpublish, each with a confirmation);
  - links to the broadsheet and to print report cards;
  - a principal's comments panel (admin and principal): one textarea per student with a single Save.
- **`/results/[armId]/report-cards`** (`print` layout): every student's card, one A4 page each, with a "Print" button (`window.print()`, hidden when printing).
- **`/results/[armId]/broadsheet`** (`print` layout, landscape): students × subjects totals, overall total, average and position; class average, highest and lowest rows at the bottom.
- **`/students/[id]/report-card`** (`?term=`, `print` layout): one card. Parents can open it; staff can too.
- **`ReportCard` component:** the card itself, shared by the three print pages. It has a numeric version and a Nursery version.
- **Parents' "My children":** a "Report card · First Term" link when the current term is published for that child.
- **Nav:** Results (admin, principal, teacher).

## Seed (demo)
- **Greenfield JSS 1A, current term:**
  - every JSS subject entered for all 10 students (varied, with a tie for one position, and one ABS);
  - **English Language is missing Chidera Eze's Exam**, so the completeness check shows a gap and the E2E journey can fill it;
  - trait ratings and class teacher's comments for all; principal's comments for half;
  - status Draft.
- **Greenfield JSS 1B:** Mathematics only (incomplete), Draft.
- **Sunrise:** unchanged. Isolation is checked by the tests.
- Re-runnable as before.

## Test plan
### Unit (test-first) — `results.test.ts`
- **Subject totals and averages:**
  - totals with ABS and blanks;
  - subjects offered (a subject with only ABS counts; one with nothing doesn't);
  - average to 2 decimal places for display.
- **Ranking:**
  - competition ranking: 1, 2, 3, 3, 5; all tied; a single student;
  - students with no scores excluded;
  - exact comparison where floats would wrongly differ (e.g. 2/3 vs 4/6);
  - grade band boundaries 39/40, 44/45, 49/50, 69/70, 74/75 and 100 for both scales;
  - subject positions and stats (average, highest, lowest) ignoring students without that subject.
- **Other rules:**
  - toggled positions (computed, but flagged hidden);
  - cumulative average from 1, 2 or 3 term averages;
  - completeness: missing components named per student;
  - Nursery handled (no totals);
  - workflow transition table (every status × action × role).

### Integration (PGlite, two schools)
- **`results-workflow.test.ts`:**
  - **Permission matrix** for every route: class teacher, another teacher, a subject teacher of the arm, admin, principal, bursar, parent; 401 without a session.
  - **Submit:** incomplete → 400 with the problems; complete → Submitted, and the lock exists, so the subject teacher's save gets 409.
  - **Publish:** snapshots exist, and later grading-scale changes don't alter the published card.
  - **Return to draft:** unlocks, and the reason is shown.
  - **Unpublish:** snapshots are deleted.
  - **Invalid transitions** → 409.
  - **Manual unlock** of a submitted or published arm → 409.
  - **Principal comments:** saved, and refused once published.
  - **Tenant isolation:** another school's arm, term or student → 404, with no DB change; a School A session on School B → 401; `schoolId` in the body is ignored.
- **`results-compute.test.ts`** (service against the DB):
  - live results match a hand-calculated example (3 students, 3 subjects, a tie, an ABS);
  - a third-term cumulative average across three terms;
  - a student who moved arm mid-term keeps their scores;
  - removed students are excluded.
- **`report-cards.test.ts`:**
  - **Contents:** card data includes the school details, attendance, ratings, comments and next term date. Positions are hidden when the toggle is off. The Nursery variant works.
  - **Parents:** a parent gets their own child's card only once published; another child or an unpublished card → 404.
  - **Broadsheet:** shape and stats.

### Nuxt
- **`report-card.test.ts`:** renders the subject table, summary, position hidden when disabled, attendance and comments; the Nursery variant.
- **`results-actions.test.ts`:** the action buttons shown for each role and status.

### E2E (desktop, writes data)
- **`results.spec.ts`**, the full journey:
  1. The English teacher (`chioma@greenfield.test`) enters Chidera Eze's missing JSS 1A English Exam.
  2. The class teacher (`teacher@greenfield.test`) sees the arm complete and submits.
  3. The principal writes a comment and publishes.
  4. The parent (`parent@greenfield.test`) opens Chidera's report card from "My children" and sees the English row and the principal's comment.
  5. **Cleanup** through the API: unpublish, return to draft, clear the Exam cell and the comment.
- **`results.spec.ts`** (mobile): a parent opens a published report card and the page fits 375px. It's published within the test and cleaned up.
- **`forbidden.spec.ts`** (extend): a bursar opening `/results` is redirected.

## Implementation sub-steps
1. **Results computation (pure, test-first):** totals, averages, ranking, stats, cumulative average, completeness, workflow table.
2. **Schema + seed:** migration `0007`, principal comments, the comment-clearing fix, the snapshot table, factories, demo data.
3. **Results API:** results view, workflow transitions with locks and snapshots, principal comments, the manual-unlock guard.
4. **Report card & broadsheet API:** staff and parent access.
5. **Frontend:** `/results`, the arm page (actions, completeness, principal comments), `ReportCard`, the print pages (cards, broadsheet, single card), the parent link, nav, Nuxt tests.
6. **E2E + docs:** the full journey, docs, CI.

## Acceptance checklist
- [ ] Results match hand-calculated examples (unit and integration), including ties, missing scores, ABS, band boundaries, toggled positions and the cumulative average
- [ ] Draft → Submitted → Published, with return and unpublish; submitting needs complete sheets; submitting and publishing lock the scores
- [ ] Published report cards are frozen snapshots; parents see only published cards for their own children
- [ ] Principal's comments
- [ ] A4 report card prints cleanly (one per page); broadsheet prints landscape
- [ ] Every route: validation, roles, tenant isolation tested
- [ ] Works at 375px (screens; print is A4)
- [ ] Seed updated; `pnpm check`, `pnpm test:e2e` and CI green

## Open questions
1. **Snapshot on publish:** publishing stores each student's report card as JSON, so later changes to grading scales, names or class don't alter a published card. Unpublishing deletes the snapshots. OK? (The alternative is always computing live, which is simpler, but published cards could silently change.)
2. **Submitting requires complete sheets** (every offered student has every component; ABS counts as entered). OK, or allow submitting with gaps after a warning?
3. **"Number in class"** = the active students enrolled in the arm (the class size), not just ranked students. OK?
4. **A subject is "offered"** for a student when at least one of its cells is entered (score or ABS); the average divides by these. OK, or divide by every subject on the arm's sheets?
5. **Who publishes:** principal and admin. **Who submits:** the class teacher (admin and principal can too). OK?
6. **Unpublish** goes back to Submitted (scores still locked); **Return to draft** unlocks. OK?
7. **Third-term cumulative average** always shows on third-term cards when the student has other term averages that session (no extra toggle). OK?
8. **Outstanding fees** on the report card waits for Phase 8 (fees). OK?
9. **Packages:** none new (print CSS only).
