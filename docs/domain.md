# Domain Rules — Nigerian School Context

These rules drive the schema, validation and tests. If a rule here conflicts with code, the code is wrong (or this file needs updating — ask me).

## School structure
- **Sections:** Nursery, Primary, Junior Secondary (JSS), Senior Secondary (SSS).
- **Class levels (seeded, names editable, ordered):**
  - Nursery: Creche, Pre-Nursery, Nursery 1, Nursery 2 (some schools say KG 1/KG 2)
  - Primary: Primary 1 – Primary 6
  - JSS: JSS 1 – JSS 3
  - SSS: SSS 1 – SSS 3
- **Arms:** each class level has one or more arms (A/B or Gold/Diamond). A student is in exactly one class arm per session. Display: a single-letter arm joins the level ("JSS 1A"), anything else gets a space ("JSS 1 Gold").
- **Subjects** belong to one section; SSS subjects are core or belong to one department. Class level, arm, department and subject names are unique per school, ignoring case.
- **SSS departments:** Science, Arts, Commercial — determine which subjects a student offers (core subjects + department subjects).
- **Admission number:** auto-generated, configurable format, e.g. `SCH/2025/0001`; unique per school.

## Academic calendar
- A **session** (e.g. `2025/2026`, consecutive years) has exactly **three terms**: First, Second, Third, created together with the session.
- Exactly one current session and one current term at any time.
- Each term has a start date, end date and "next term begins" date (each optional until known). Rules: the term ends after it starts; next term begins after it ends. No ordering is enforced across the three terms.
- Setting a term as current also makes its session current.

## Assessment
- Default components (configurable per school): **CA1 = 20, CA2 = 20, Exam = 60, Total = 100**. 1–5 components with unique names and whole-number maxes that must sum to 100.
- Scores are validated: 0 ≤ score ≤ component max; blank ≠ zero (a blank means "not entered"; an absent student can be marked explicitly).
- Scores are locked once results for that class arm are published; only Admin/Principal can unlock.

## Grading scales (configurable per section; seed these defaults)
**SSS (WAEC style)**
| Grade | Range | Remark |
|---|---|---|
| A1 | 75–100 | Excellent |
| B2 | 70–74 | Very Good |
| B3 | 65–69 | Good |
| C4 | 60–64 | Credit |
| C5 | 55–59 | Credit |
| C6 | 50–54 | Credit |
| D7 | 45–49 | Pass |
| E8 | 40–44 | Pass |
| F9 | 0–39 | Fail |

**Primary & JSS**
| Grade | Range | Remark |
|---|---|---|
| A | 70–100 | Excellent |
| B | 60–69 | Very Good |
| C | 50–59 | Good |
| D | 45–49 | Fair |
| E | 40–44 | Poor |
| F | 0–39 | Fail |

**Nursery:** skill-based ratings (Excellent / Very Good / Good / Needs Improvement) instead of numeric scores in the MVP.

Grading scale bands must be contiguous, non-overlapping and cover 0–100 with whole-number bounds and unique grades — validate this on save. Nursery has no numeric scale.

## Result computation (per student, per term, per class arm)
- Subject total = CA1 + CA2 + Exam; grade + remark from the section's scale.
- Overall total, number of subjects offered, **average = total ÷ subjects offered** (rounded to 2 dp for display only).
- **Position in class** by average, with **competition ranking for ties** (e.g. 1, 2, 3, 3, 5). Position display is a school-level toggle.
- Optional per-subject position and class average/highest/lowest per subject (for the broadsheet).
- **Third term:** optional cumulative average = mean of the term averages the student has.
- Students with no scores in a term are excluded from ranking.

## Report card contents
School name, logo, address, motto · student name, admission number, class arm, session, term, photo · subject table (CA1, CA2, Exam, Total, Grade, Remark) · total, average, position (if enabled), number in class · attendance (days present / days school opened) · affective domain (punctuality, neatness, politeness, honesty, relationship with others, etc.) and psychomotor skills (handwriting, sports, drawing, etc.) rated 1–5 · class teacher's comment · principal's/head teacher's comment · next term begins · outstanding fees (toggle).

Results go through: **Draft → Submitted (by class teacher) → Published (by principal)**. Parents only see published results.

## Fees
- Fee items (Tuition, Development Levy, Uniform, Books, PTA, Bus, …) are defined **per class level per term**; some are optional (e.g. Bus).
- A **term bill** is generated per student from their class level's items; per-student discounts/scholarships (fixed amount or %) are allowed.
- Payments recorded manually (cash, bank transfer, POS) with date, reference and receiving staff; partial payments allowed.
- **Balance = total billed − discounts − total paid.** Overpayment becomes credit. Outstanding balances carry forward to the next term as an arrears line.
- Payments are never edited or hard-deleted — they are reversed with a reason (audit trail).
- Printable receipt per payment; debtors list per class arm; term collections summary.
- Online payments (Paystack/Flutterwave) are post-MVP; design the payments table so a `channel` and `gatewayReference` can be added.

## Roles & permissions
| Role | Can do |
|---|---|
| Platform Super Admin (vendor) | Phase 11+: manage schools, subscriptions, audited support impersonation. Not a school user; separate login |
| Admin / Proprietor | Everything within their own school |
| Principal / Head Teacher | Academics, approve & publish results, comments, reports (for their section(s)) |
| Bursar | Fees, bills, payments, receipts, debtors — nothing academic |
| Teacher | **Class teacher:** attendance, affective/psychomotor ratings, comments for their arm. **Subject teacher:** score entry only for assigned subject + class arm pairs |
| Parent / Guardian | Read-only: own children's published results, attendance, fee balance & payments |

- A parent can have many children; a child can have many guardians.
- Students do not log in in the MVP.
- **Teaching assignments are per session:** one class teacher per class arm, one teacher per subject per arm. Admins and principals assign them; teachers, principals and admins can be assigned. A teacher may hold several arms and subjects.
- **Staff accounts:** deactivate for a temporary block; remove (soft delete) for staff who left — they can't log in and lose their assignments, but their records stay. An admin can't deactivate, remove or demote themselves, and a school always keeps at least one active admin.
- Every user belongs to exactly one school; all configuration in this file (class names, grading, assessment split, fee items, position toggle) is **per school**.
- Server-side checks are mandatory — hiding a button is not authorisation.

## Data & validation
- Nigerian phone: `+234XXXXXXXXXX` or `0XXXXXXXXXX` (11 digits local); store normalised as `+234…`.
- State of origin from the 36 states + FCT; LGA free text.
- Nigeria Data Protection Act 2023: collect only what's needed, restrict personal data by role, no student data in logs.
