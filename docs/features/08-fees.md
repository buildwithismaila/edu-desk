# Phase 8 — Fees & payments

**Status:** Approved 2026-10-13 (all open-question recommendations accepted)
**Roadmap ref:** `docs/roadmap.md` → Phase 8

## Goal
The bursar bills every student each term and records what parents pay, and the balances always reconcile.
- **Fee items:** set per class level per term (Tuition, Development Levy, PTA, Bus…); some are optional.
- **Bills:** generated per student. Running generation again never duplicates anything. Per-student discounts are allowed (a fixed amount or a percentage).
- **Payments:** cash, bank transfer or POS, with a printable receipt. A payment is never edited or deleted, only **reversed with a reason**.
- **Balance** = billed − discounts − paid. Overpayment becomes credit, and the closing balance **carries forward** to the next term's bill as an arrears (or credit) line.
- **Reports:** a debtors list per arm, a term collections summary, and a per-student ledger.
- All money is **integer kobo** (₦1 = 100 kobo).

## User stories
- As a **bursar or admin**, I set the term's fee items for each class level (name, amount, optional or not). I can copy a whole term's items from another term, then adjust them.
- As a **bursar**, I **generate bills** for the term (the whole school, or one arm). Each student gets the compulsory items of their class level, plus last term's closing balance as an "Arrears brought forward" line (or a "Credit brought forward" line when they overpaid).
  - Running generation again only creates the missing bills.
  - "Refresh from fee items" updates the item lines of bills that have no payments yet (after a fee change). Bills with payments are left alone, and the bursar adjusts them one by one.
- As a **bursar**, on a student's fees page I:
  - add or remove an optional item (e.g. Bus);
  - add a discount (fixed ₦ or %, with a reason, never more than the items billed);
  - **record a payment** (amount, method, date, reference). It gets a receipt number (`RCT/2026/000123`) and a printable A4 receipt, and partial payments are fine.
- As a **bursar**, I **reverse** a payment that was recorded by mistake, with a reason. The balance updates, and the receipt shows "REVERSED" with the reason. Nothing is ever deleted.
- As a **bursar**, I see the **student ledger** (every bill line, discount, payment and reversal in date order, with a running balance) across terms.
- As a **bursar, admin or principal**, I see:
  - the **debtors list** for an arm or the whole school (who owes what, largest first, printable);
  - the **term collections summary**: expected vs collected, by class level and by payment method, plus a daily total for the term.
- As a **principal**, I can view fee reports but not change anything. **Teachers** have no access to fees. **Parents** see fees in Phase 9.
- **The bursar still can't open anything academic** (scores, results, attendance, ratings): checked again by tests.
- **Report card:** an optional "Outstanding fees" line, from a school setting that is off by default.

## Decisions baked in (see open questions)
- **Money:** integer kobo everywhere.
  - Amounts are typed in naira (up to 2 decimals) and converted by `parseNaira`.
  - They're shown with `formatNaira` (`Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })`).
  - Amounts must be ≥ 1 kobo and at most ₦10,000,000 per line or payment (fits Postgres `integer` kobo; sums use `bigint`).
- **Bills:**
  - One bill per student per term.
  - Lines: fee items (compulsory items by default, optional ones added per student) and one carry-forward line from the previous term's closing balance. The previous term is the one before it in the session; first term looks back to the previous session's third term.
  - The bill remembers the student's level and arm when it was generated.
- **Discounts:**
  - Per bill: a fixed amount or a percentage (in basis points, applied to the **item** lines, not arrears), with a reason.
  - The total discount is capped at the item total, so a discount larger than the bill never creates credit.
- **Balance per bill** = item lines + carry-forward − discounts − (payments − reversed payments). Negative means credit.
- **Payments:**
  - Recorded against a student's bill for a term.
  - They store channel `manual` and a nullable `gatewayReference`, ready for online payments later.
  - Receipt numbers come from a counter per school per year, incremented in the payment transaction.
  - Payments are never updated except the reversal fields (`reversedAt`, `reversedById`, `reversalReason`), set once. There's no delete route and no edit route.
- **Carry-forward is live:** the line shows the previous bill's current balance, recomputed when the next bill is generated or refreshed. A payment against an old term after the new bill exists keeps the books right, because the ledger shows both. The carry-forward line is re-synced whenever the new bill is refreshed.
- **Who:**
  - **Admin and bursar** manage fee items, bills, discounts and payments.
  - **Principal:** read-only reports (debtors, collections, ledgers).
  - **Teachers:** no access.
  - **Parents:** Phase 9.

## Schema changes (migration `0008_fees`)
```
paymentMethod enum: cash | transfer | pos
discountKind enum: fixed | percent

fee_items:      id, schoolId, termId, classLevelId, name, amountKobo int, optional bool, sortOrder, timestamps
                unique(schoolId, termId, classLevelId, name); check(amountKobo > 0)
bills:          id, schoolId, termId, studentId, classLevelId, classArmId, generatedById, timestamps
                unique(schoolId, termId, studentId)
bill_lines:     id, schoolId, billId (cascade), feeItemId (set null) null, kind enum(item|carry_forward), description, amountKobo int
                (carry_forward may be negative = credit), timestamps; unique(billId, feeItemId)
discounts:      id, schoolId, billId (cascade), kind discountKind, value int (kobo or basis points), reason text, createdById, timestamps
payments:       id, schoolId, studentId, billId (restrict), amountKobo int > 0, method paymentMethod, reference text null,
                paidOn date, receiptNumber text, receivedById, channel text default 'manual', gatewayReference text null,
                reversedAt, reversedById, reversalReason, timestamps
                unique(schoolId, receiptNumber); index(schoolId, billId)
receipt_counters: schoolId, year, lastNumber — pk(schoolId, year)
schools:        + showFeesOnReportCard boolean default false
```
- **Delete guards:** class levels and terms with fee items, bills or payments → 409. Students are soft-deleted, so their bills stay.

## Rules & pure helpers (test-first)
**`shared/utils/money.ts`:**
- `parseNaira('25,000.50')` → 2500050; refuses negatives, 3+ decimals and junk.
- `formatNaira(2500050)` → `₦25,000.50`.

**`shared/utils/fees.ts`:**
- **`billBalance({ lines, discounts, payments })`** → `{ itemsTotal, carryForward, discountTotal, billed, paid, reversed, balance }`:
  - percent discounts in basis points (rounded to the kobo, half up);
  - the cap at the item total;
  - reversed payments excluded from `paid`.
  - Edge cases: partial payment, overpayment → credit, discount > bill, multiple discounts, arrears, credit brought forward, a reversal after a payment.
- **`ledger(bills, payments)`** → date-ordered entries with a running balance across terms.
- **`carryForwardLine(previousBalance, termLabel)`** → none at 0; "Arrears brought forward (First Term 2026/2027)" when positive; "Credit brought forward…" when negative.
- **`formatReceiptNumber(year, n)`** → `RCT/2026/000123`.

## API routes
All routes:
- resolve the tenant;
- validate input with Zod;
- never read `schoolId` from input;
- return 404 for another school's ids;
- give 403 to roles outside fees.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/fees/items?termId` | admin, bursar, principal | Fee items by class level for the term (default current) |
| PUT | `/api/fees/items` | admin, bursar | `{ termId, classLevelId, items: [{ name, amount (₦ string), optional }] }`: replace one level's items |
| POST | `/api/fees/items/copy` | admin, bursar | `{ fromTermId, toTermId }`: copy every level's items (refused if the target already has items) |
| POST | `/api/fees/bills/generate` | admin, bursar | `{ termId, classArmId? }`: create the missing bills; returns `{ created, existing }` |
| POST | `/api/fees/bills/refresh` | admin, bursar | `{ termId, classArmId? }`: re-sync item lines (bills without payments) and carry-forward lines |
| GET | `/api/fees/bills?termId&classArmId&search&page` | admin, bursar, principal | Bills with billed / paid / balance |
| GET | `/api/students/[id]/fees?termId` | admin, bursar, principal | The term's bill (lines, discounts, payments, balance) plus the full ledger |
| PUT | `/api/fees/bills/[id]/optional-items` | admin, bursar | `{ feeItemIds }`: the student's optional items |
| POST / DELETE | `/api/fees/bills/[id]/discounts`, `/api/fees/discounts/[id]` | admin, bursar | Add or remove a discount (removing one is allowed: discounts aren't money received) |
| POST | `/api/fees/payments` | admin, bursar | `{ billId, amount, method, paidOn, reference? }` → 201 with the receipt number |
| POST | `/api/fees/payments/[id]/reverse` | admin, bursar | `{ reason }`. 409 if already reversed |
| GET | `/api/fees/payments/[id]` | admin, bursar, principal | Receipt data |
| GET | `/api/fees/debtors?termId&classArmId?` | admin, bursar, principal | Students with balance > 0, largest first, and the total |
| GET | `/api/fees/collections?termId` | admin, bursar, principal | Expected, collected and outstanding; by level, by method, by day |

**No route updates or deletes a payment** (a test checks that none exists).

## Pages & components
- **`/fees`** (admin, bursar, principal): the term picker, then each class level's fee items in an inline editor (name, ₦ amount, optional), one Save per level. "Copy from another term". Read-only for the principal.
- **`/fees/bills`:** Generate / Refresh (per arm or the whole school, with a confirmation and a result toast) and a paginated table (student, class, billed, paid, balance), with search and arm filter. Rows link to the student's fees page.
- **`/students/[id]/fees`:**
  - **Bill card:** lines, optional-item toggles, discounts (add/remove), and totals with the balance in bold (red if owing, green if credit).
  - **Payments:** each with receipt number, method, date, amount, and a "Reversed" badge; actions "Receipt" and "Reverse…".
  - **Record payment** dialog: amount in ₦, method, date (today by default), reference.
  - **Ledger** tab across terms.
  - A "Fees" link on the student profile for admin, bursar and principal.
- **`/fees/payments/[id]/receipt`** (`print` layout): school header, receipt number, student, class, term, amount in figures, method, reference, received by, the balance after this payment, and "REVERSED: reason" when reversed.
- **`/fees/debtors`** (printable) and **`/fees/collections`** (summary cards and tables).
- **School profile:** a "Show outstanding fees on report cards" switch. When it's on, the report card shows the outstanding balance at the time of publishing (stored in the snapshot).
- **Nav:** a "Fees" group for admin, bursar and principal (Fee items, Bills, Debtors, Collections).
- `formatNaira` is used everywhere; amounts are right-aligned with tabular numbers.

## Seed (demo)
- **Greenfield, current term:** fee items for every level (e.g. JSS: Tuition ₦85,000, Development Levy ₦10,000, PTA ₦2,500, Bus ₦25,000 optional), and bills generated for every student. Payments:
  - JSS 1A: some fully paid, some partly paid, some unpaid;
  - one overpayment (credit);
  - one reversed payment with a reason;
  - Chidera has a discount (sibling discount 10%).
- **Previous session's third term:** a bill for two students with arrears, so the carry-forward line shows.
- **Sunrise:** its own items and a payment, so isolation is visible.
- Re-runnable.

## Test plan
### Unit (test-first)
- **`money.test.ts`:** parse and format (commas, decimals, `₦` prefix, invalid input, large values).
- **`fees.test.ts`:** `billBalance` for:
  - nothing paid; partial; exact; overpayment → credit;
  - fixed discount; percent discount (rounding); discount > items (capped); two discounts;
  - arrears and credit brought forward;
  - a reversed payment; a reversal after an overpayment;
  - every total in integer kobo.
- **`fees.test.ts`** (continued):
  - `carryForwardLine` at 0, positive and negative;
  - `ledger` running balance across two terms with a reversal;
  - `formatReceiptNumber`.

### Integration (PGlite, two schools)
- **`fees-items.test.ts`:** permissions (admin, bursar write; principal read; teacher, parent 403); replace per level; validation (amounts, duplicate names); copy between terms (refused when the target has items); delete guards.
- **`fees-bills.test.ts`:**
  - generation creates bills with compulsory items and a carry-forward from the previous term's balance;
  - **running it again creates nothing new**; arm-only generation;
  - refresh after a fee change updates only bills without payments;
  - optional items; discounts (the cap); removed students skipped;
  - tenant isolation.
- **`fees-payments.test.ts`:**
  - **Recording:** a payment gets a sequential receipt number (concurrent payments get unique numbers) and the balance updates (partial, full, overpayment).
  - **Reversing:** needs a reason; a second reversal → 409; the reversed amount leaves the balance.
  - **No edits:** there's no update or delete route for payments (PATCH and DELETE → 404/405); the payments row is unchanged.
  - **Receipt** data.
  - **Permissions:** the principal can view but not record; a teacher → 403.
  - **Tenant isolation:** another school's bill or payment → 404, with no DB change.
- **`fees-reports.test.ts`:**
  - debtors (only balance > 0, sorted, the total);
  - collections (by level, method and day; reversed payments excluded) **reconcile** with the sum of the bills.
- **`bursar-academics.test.ts`:** the bursar gets 403 on every academic route (scores, ratings, results, attendance, assignments).
- **`results`** (extend): the outstanding fees line appears on a published card only when the setting is on.

### Nuxt
- **`naira-input.test.ts`:** typing "25,000.5" keeps the value, and an invalid amount shows an error.
- **`bill-summary.test.ts`:** totals, credit and owing styles, and the reversed payment badge.

### E2E
- **`fees.spec.ts`** (desktop):
  - the bursar opens a student with an unpaid bill and records a **partial payment**;
  - the balance updates and the receipt opens and prints (A4);
  - the bursar reverses the payment with a reason and the receipt shows REVERSED;
  - the debtors list includes the student.
  - Cleanup: none needed, since reversed payments are the audit trail. A unique reference per run keeps it identifiable.
- **`fees.spec.ts`** (mobile): the student's fees page and the record-payment dialog fit 375px.
- **`forbidden.spec.ts`** (extend): a teacher opening `/fees` is redirected; the bursar opening `/scores` and `/results` is redirected.

## Implementation sub-steps
1. **Pure helpers (test-first):** money, balance, ledger, carry-forward, receipt numbers, Zod schemas.
2. **Schema + guards + seed:** migration `0008`, factories, delete guards, demo fees.
3. **Fee items and bills API:** items, copy, generate, refresh, optional items, discounts.
4. **Payments and reports API:** record, reverse, receipt, ledger, debtors, collections; the report-card fees line; the bursar-academics checks.
5. **Frontend:** fee items editor, bills, student fees page, receipt, debtors, collections, settings switch, nav, Nuxt tests.
6. **E2E + docs.**

## Acceptance checklist
- [x] Balances always reconcile: bills, discounts, payments and reversals match in the ledger, debtors and collections (unit and integration)
- [x] Bill generation is idempotent; carry-forward of arrears and credit works
- [x] No payment can be edited or hard-deleted; reversals keep an audit trail
- [x] Printable receipts; debtors list per arm; term collections summary
- [x] The bursar can't access academics; teachers can't access fees
- [x] Every route: validation, roles, tenant isolation tested
- [x] Works at 375px
- [x] Seed updated; `pnpm check`, `pnpm test:e2e` and CI green

## Open questions
1. **Who manages fees:** admin and bursar; the principal is read-only (reports, ledgers). OK?
2. **Regenerating bills:** generate only creates missing bills; "Refresh" re-syncs items on bills **without payments** (bills with payments are adjusted one by one). OK, or refresh every bill?
3. **Percent discounts** apply to the term's item lines only (not arrears), and every discount together is capped at the items total. OK?
4. **Carry-forward** takes the previous term's balance when the new bill is generated or refreshed (first term looks back to the previous session's third term). OK?
5. **Receipt numbers:** `RCT/YEAR/NNNNNN`, a per-school, per-year counter. OK?
6. **Outstanding fees on report cards:** a school setting (off by default). When it's on, the published card shows the balance at the moment of publishing. OK?
7. **Discounts can be removed** (they aren't money received), but payments can only be reversed. OK?
8. **Packages:** none new (`Intl` handles naira formatting).
