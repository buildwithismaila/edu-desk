# Phase 9 — Parent portal

**Status:** Approved (2026-10-13), in progress
**Roadmap ref:** `docs/roadmap.md` → Phase 9

## Goal
A parent opens the app on a phone and, for each of their children, sees:
- **published report cards** (every published term);
- **attendance** (term summary and the days absent or late);
- **fees** (this term's bill, balance and payment history, with printable receipts).

It's read-only and mobile-first, and **a parent sees only their own children's data**: every parent route has an IDOR test.

## User stories
- As a **parent**, my dashboard ("My children") shows a card per child, with:
  - photo, name, class and admission number;
  - **attendance this term** (e.g. "96% · absent 2 days");
  - **fees**: "Owing ₦36,500", "Fully paid" or "Credit ₦5,000";
  - the latest **published report card**, if there is one.

  Tapping a card opens the child's page.
- On **my child's page**, tabs:
  - **Results:** every published report card, newest first. Tapping one opens the A4 report card (Phase 7), which I can print or save as PDF.
  - **Attendance:** pick a term (any term of the child's sessions). I see the counts, the rate, and the dates absent or late.
  - **Fees:** pick a term. I see the bill lines, discounts, total, paid and balance, and the payments (date, method, receipt number). Reversed payments show as "Reversed" and don't count. Each payment has a **receipt** I can open and print.
- **Brothers and sisters:** a guardian of several children sees all of them. A child with two guardians is visible to both.
- **What parents never see:**
  - other children's data (another family's or another school's child → **404**, never 403, so existence isn't revealed);
  - unpublished results;
  - staff-only routes (403, already tested);
  - removed (soft-deleted) children.

## Decisions baked in (see open questions)
- **Routes** sit under `/api/me/children/[id]/…`. Every handler starts with one helper, `requireOwnChild(db, school, parent, id)`, which returns 404 unless an active guardian link exists in the host school. That makes the rule impossible to forget and easy to test.
- **Results:**
  - a list of the child's **published** report cards across terms, read from the Phase 7 snapshots, newest first;
  - the card itself comes from the existing `/api/students/[id]/report-card` (parent rule: own child, published only).
- **Attendance:** any term in which the child has marks or was enrolled. This reuses `studentAttendanceSummary` (Phase 5), and the default is the current term.
- **Fees:**
  - the term's bill (lines, discounts, totals, payments) and a list of terms that have bills;
  - parents see reversed payments marked "Reversed" (transparency); reversal reasons are staff-only;
  - the staff ledger stays staff-only.
- **Receipts for parents:** `GET /api/me/children/[id]/payments/[paymentId]` returns the same receipt data as staff get, without the reversal reason. The receipt page is shared through a `Receipt` component (extracted from Phase 8's page).
- **Dashboard summary:** `/api/me/children` (Phase 4) gains `attendanceRate`, `absentDays`, `balanceKobo` (current term; null without a bill) and `latestReportCard`.
- **No new tables.** Everything reads existing data.

## API routes
Every route:
- uses the parent role (`requireRole(['parent'])`);
- resolves the tenant;
- runs `requireOwnChild` (404 otherwise);
- validates input with Zod.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/me/children` | (extended) cards with this term's attendance, fee balance and latest published report card |
| GET | `/api/me/children/[id]` | The child (name, class, photo), the terms with results, attendance and bills (for the pickers) |
| GET | `/api/me/children/[id]/results` | Published report cards: `[{ termId, term, publishedAt, average, position }]` (position only if the school shows positions) |
| GET | `/api/me/children/[id]/attendance?termId` | Term summary and absent/late dates (default current term) |
| GET | `/api/me/children/[id]/fees?termId` | The term's bill (lines, discounts, totals, payments with `reversed`), or null |
| GET | `/api/me/children/[id]/payments/[paymentId]` | Receipt data for a payment on this child's bills (404 if it's not theirs) |
| GET | `/api/students/[id]/report-card?termId` | (Phase 7, unchanged) one report card: own child, published only |

## Pages & components
- **Parent dashboard (`/`):** `MyChildren` cards (Phase 4) gain attendance, fee and latest-report-card lines. The cards stack on a phone and link to `/my-children/[id]`.
- **`/my-children/[id]`** (parent only), with tabs **Results · Attendance · Fees**:
  - **Results:** a list of term cards; tapping one opens `/students/[id]/report-card?term=…`. Empty state: "No published report cards yet."
  - **Attendance:** term select, count tiles, and absent/late dates.
  - **Fees:** term select, the bill (the `BillSummary` read-only variant without the Reverse action and without reversal reasons), and a "Receipt" button per payment.
- **`/my-children/[id]/receipts/[paymentId]`** (`print` layout): uses the shared `Receipt` component.
- **Back links:** the report card page links back to the child page for parents.
- **Nav for parents:** Dashboard only. The dashboard *is* the list of children (one card each), so a separate "My children" item would just duplicate it. Parents keep landing on the dashboard.

## Seed (demo)
- **Ngozi Eze** (`parent@greenfield.test`, phone `08031110001`) has Chidera (JSS 1A) and Somto (Primary 3A).
- **Primary 3A:**
  - complete scores for every Primary subject, ratings and comments;
  - results **published** for the current term (a seed helper uses the Phase 7 publish service), so Somto has a report card to show;
  - Primary 3A gets a few attendance registers.
- **JSS 1A** stays **Draft**. Phase 7's E2E fills the gap and publishes it, then undoes that.
- **Fees:** Chidera's bill is paid (Phase 8 seed); Somto's is unpaid, so the demo shows both states.

## Test plan
### Integration — `parent-portal.test.ts`, the IDOR suite
The fixture: two families in school A (parent 1 with two children; parent 2 with one), and school B.

**Every parent route**, with:
- **parent 1 → own child:** 200;
- **parent 1 → parent 2's child:** 404;
- **parent 1 → a removed child of theirs:** 404;
- **parent 1 → school B's child id on school A's host:** 404;
- **parent 2 → parent 1's payment id** (via their own child's path): 404;
- **no session:** 401;
- **staff roles** (admin, bursar, teacher): 403 on `/api/me/children/*`.

**Contents:**
- **Results:** only published terms are listed; publishing adds one, unpublishing removes it; positions are hidden when the toggle is off.
- **Attendance:** matches the Phase 5 summary; any term; an unknown term → 404.
- **Fees:**
  - the bill matches `billBalance`;
  - reversed payments are flagged and don't count;
  - the reversal reason isn't sent to parents;
  - no bill → null.
- **Receipts:** own child's payment → data without the reversal reason; another child's payment → 404; another school's payment → 404.
- **The extended `/api/me/children`:** attendance rate, balance and latest report card; siblings both listed; two guardians each see the child.

### Nuxt
- **`child-card.test.ts`:** the card shows the attendance, owing / paid / credit and report card lines.
- **`parent-child-page.test.ts`:** the tabs switch, and the empty states show.

### E2E (mobile project)
- **`parent-portal.spec.ts`:**
  - the parent logs in **by phone** and sees two child cards;
  - opens Somto: Results → opens the published report card;
  - Attendance tab shows the rate; Fees tab shows "Owing";
  - opens a receipt for Chidera's payment;
  - visiting another child's URL shows "not found";
  - no page overflows at 375px.
- **`parent-portal.spec.ts`** (desktop): the same pages render; read-only only.

## Implementation sub-steps
1. **`requireOwnChild` + routes:** child overview, results, attendance, fees, receipt; the extended `/api/me/children`; the IDOR suite (tests first).
2. **Seed:** publish Primary 3A in the demo (via the results service), with scores, ratings, registers and the seed test.
3. **Frontend:** child cards, `/my-children/[id]` tabs, the parent receipt page (extract `Receipt`), the read-only bill, back links, Nuxt tests.
4. **E2E + docs.**

## Acceptance checklist
- [ ] A parent sees each child's published report cards, attendance summary, fee balance and payment history, read-only
- [ ] A parent sees only their own children's data: IDOR tests on every parent route (another family, another school, removed child, foreign payment)
- [ ] Unpublished results are never visible to parents
- [ ] Mobile-first: every parent page works at 375px
- [ ] Seed updated; `pnpm check`, `pnpm test:e2e` and CI green

## Open questions (resolved 2026-10-13: all approved as proposed)
1. Parents see reversed payments marked "Reversed", without the staff's reason.
2. Parents can open and print receipts for their own children's payments.
3. The staff ledger stays staff-only; parents see the bill and payments per term.
4. The seed publishes Primary 3A for the current term; JSS 1A stays Draft.
5. Parents can view attendance for any term.
6. No new packages.
