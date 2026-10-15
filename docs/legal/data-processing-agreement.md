# Data Processing Agreement — template

> **DRAFT for legal review.** Plain-English starting point, not legal advice. Have a Nigerian lawyer familiar with the Nigeria Data Protection Act 2023 (NDPA) review it before any school signs. Replace every `[…]`.

**Between**
- **[School name]**, [address] (the **School**, the data controller), and
- **[Business name]**, [address], operator of Edu Desk (the **Provider**, the data processor).

**Date:** [date]

## 1. What this covers
The School uses Edu Desk, an online school management system, to keep records about its students, their parents or guardians, and its staff. The Provider runs Edu Desk and stores those records on the School's behalf. This agreement sets out how the Provider handles that personal data.

## 2. Roles
- The School decides what data to collect and why. It is the **data controller** under the NDPA.
- The Provider processes the data only to run Edu Desk for the School. It is the **data processor**.
- The School is responsible for having a lawful basis for the data it enters (for example, enrolment contracts and parental consent for student photos).

## 3. The data
| Who | What |
|---|---|
| Students | Name, gender, date of birth, state of origin, LGA, address, photo, admission number, class, attendance, scores, ratings, comments, report cards, fee bills and payments |
| Parents / guardians | Name, phone number, email, relationship to the student, login details |
| Staff | Name, phone number, email, role, class and subject assignments, login details |

## 4. What the Provider will do
1. Process the data **only** to provide Edu Desk to the School, and on the School's documented instructions (using the system counts as instructions).
2. Keep the data **confidential**; anyone at the Provider with access is bound by confidentiality.
3. Keep the data **secure**:
   - each school's data is separated from every other school's;
   - access is by role (for example, teachers see only their classes, parents only their own children);
   - passwords are stored hashed;
   - connections use HTTPS;
   - nightly backups are encrypted and stored off-site.
4. **Not sell** the data, and not use it for advertising or any purpose other than providing Edu Desk.
5. Use other providers (**sub-processors**) only as listed in Schedule 1, and tell the School before adding or replacing one.
6. **Help the School** respond to requests from individuals (to see, correct or delete their data) and to the Nigeria Data Protection Commission.
7. **Tell the School without undue delay**, and within [48] hours of becoming aware, about any personal data breach affecting its data, with what is known and what is being done.
8. At the end of the service, **return** the School's data (as an export) and **delete** it within [30] days, except where the law requires keeping it. Backups expire within 8 weeks.

## 5. What the School will do
- Make sure staff keep their logins private, and remove access for staff who leave.
- Enter accurate data, and only data it is entitled to hold.
- Tell parents how their and their children's data is used (the Edu Desk privacy notice can help).

## 6. Where the data is kept
The data is stored on servers in [country/region, e.g. Germany (EU)] with backups in [region]. Where data is transferred outside Nigeria, the Provider relies on [the basis allowed under the NDPA, e.g. adequacy or contractual safeguards — legal review].

## 7. Term
This agreement lasts as long as the School uses Edu Desk.

**Signed for the School:** ______________________ Name: __________ Date: ______

**Signed for the Provider:** ______________________ Name: __________ Date: ______

---

### Schedule 1 — Sub-processors
| Provider | What for | Where |
|---|---|---|
| [Hosting provider, e.g. Hetzner] | Servers that run Edu Desk and its database | [region] |
| [Cloudflare (R2)] | Encrypted off-site backups | [region] |
| [Let's Encrypt] | HTTPS certificates (no personal data) | — |
