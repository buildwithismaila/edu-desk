# Phase 10d — Results withheld until fees are paid

**Status:** Done (2026-10-26). Q1 changed by the owner: hold back only the terms owed
**Roadmap ref:** new (owner request, 2026-10-26)

## Goal
Many schools hand out report cards only after fees are cleared. When a school turns this on, a parent **can't see their child's results while the child owes fees**. They see a clear message with the amount owed and how to pay instead. Staff see results as before.

## User stories
- **As an admin,** I switch on **"Withhold results until fees are paid"** on the School profile. It's off by default, as some schools don't do this.
- **As a parent whose child owes fees for a term,** that term's result shows **"Withheld until fees are paid. Outstanding for this term: ₦45,000."**, with a link to the Fees tab and the invoice (bank details). I can't open that report card, even by typing its address. Terms that are paid stay visible.
- **As a parent who has paid in full** (the balance is ₦0 or in credit), I see every published report card, as today.
- **As an admin or bursar,** I can **release one child's result for a term** anyway, for example on a payment plan or a scholarship. I can take the release back later.
- **As staff,** nothing changes: results, report cards and printing work as now.

## Rules
- **Which terms are owed.** Payments clear the **oldest debt first**. The child's newest bill holds everything still owed, because unpaid earlier terms come forward as "Arrears brought forward". That amount is then counted against the newest terms' own charges first:
  - **A term's own charges** are its items minus its discounts (not the arrears line).
  - **Walking back from the newest bill,** each term takes as much of the remaining debt as its own charges. Whatever is left goes to the term before, and so on.
  - **A term is owed** when any of the debt lands on it. Its report card is then withheld, and the parent sees how much of it is outstanding.
  - **Example:** First term ₦100,000 unpaid; second term ₦100,000 (+ ₦100,000 arrears); the parent pays ₦100,000. ₦100,000 is still owed, and it lands on the second term. **First term's results are released, second term's are withheld.**
- **No bill for a term:** nothing is owed for it, so its results show. Credit (overpaid) means nothing is owed.
- **Reversed payments** don't count, the same as everywhere else.
- **The check runs live.** Once the bursar records the payment, the results appear straight away; nobody has to "unlock" them.
- **Release:** per student and per term, by admin or bursar, until switched off.
- **Enforced on the server:** the results list, the report card route and the dashboard card all check this. Hiding the button isn't enough (docs/domain.md).
- **Unchanged:** staff see and print results as now; parents still see attendance and fees.

## What changes
### Database (one migration, run on the dev DB right after generating)
- `schools.withholdResultsUntilPaid` boolean, default `false`.
- `student_result_releases` (schoolId, studentId, termId, releasedById, createdAt), unique per student and term. A tenant table, behind the scoped helpers.

### Server
- **`owedByTerm(bills)`** (pure, shared): the rule above. It takes the child's bills, oldest to newest, each with its own charges and the newest one's balance, and gives the amount owed per term.
- **`withheldTerms(db, school, studentId)`** (service): applies the school setting and releases, giving the withheld terms with the amount owed for each.
- **`GET /api/me/children/[id]/results`:** a withheld term comes back as `{ termId, term, withheld: true, owedKobo }`, with no average or position.
- **`GET /api/students/[id]/report-card`** as a parent: **403 "This result is withheld until fees are paid"** for a withheld term.
- **`GET /api/me/children`:** the latest report card carries `withheld` and `owedKobo` when that term is withheld.
- **`PATCH /api/school/profile`:** accepts `withholdResultsUntilPaid` (admin).
- **`PUT` / `DELETE /api/students/[id]/result-release?termId=`:** admin or bursar.
- **`GET /api/students/[id]/result-holds`:** admin or bursar. The terms with a published result that are withheld or released, for the student's Fees page.

### Pages
- **School profile:** the switch, next to "Show outstanding fees on report cards".
- **Parent:** a withheld message per term on the Results tab, and on the dashboard card when the latest term is withheld, with a link to Fees.
- **Student Fees page (staff):** each withheld or released term, with a Release / Withhold again button.

## Seed
- Greenfield gets the setting **on**. Somto Eze (the demo parent's Primary 3A child, whose fees are unpaid) then shows "withheld". To show the other state, the demo can record Somto's payment live and the results appear, which makes a good moment in a school presentation.
  - The parent-portal E2E expects Somto's report card, so it will be updated to pay or release first.
- Sunrise stays off.

## Test plan
- **Unit:** `owedByTerm`: nothing owed; the newest term owed only; debt reaching back two terms; part of a term owed; credit; discounts; a single bill.
- **Integration:**
  - **Results list / report card / dashboard card:** a term owed is withheld (403 on its report card, no average in the list) while a paid earlier term stays visible; setting off → everything visible; a release lifts one term only.
  - **Live:** record a full payment → visible at once; reverse it → withheld again.
  - **Release:** admin and bursar allowed; teacher, principal and parent 403; another school's student 404; validation.
  - **Settings:** only admin can change the switch.
  - **Staff unaffected:** a teacher or admin still gets the report card.
- **Nuxt:** the parent's Results tab and child card show the withheld message and the amount; the staff Fees page shows the status and button.
- **E2E:** the parent sees "withheld"; the bursar records the full balance; the parent reloads and sees the report card. Desktop and 375px.

## Sub-steps
1. Schema, migration, `resultsWithheld`, the rule's unit tests.
2. Parent routes (results, report card, dashboard card) + integration tests.
3. Setting + release routes + tests.
4. UI: parent messages, School profile switch, staff Fees status; Nuxt tests; seed.
5. E2E, docs (domain rules, decision), PROGRESS, push, CI.

## Decisions (2026-10-26)
1. **Only the terms owed** are withheld (owner's choice), with payments clearing the oldest debt first.
2. **Full payment:** a term is withheld until none of the debt lands on it (no threshold).
3. **Release:** per student and term, by admin or bursar.
4. **Off by default;** the Greenfield demo turns it on.
5. **Attendance and fees** stay visible to parents.
6. **Printing** stays unchanged for staff.
