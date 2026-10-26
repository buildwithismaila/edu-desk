# Phase 10c — Offline attendance

**Status:** Done (2026-10-26)
**Roadmap ref:** `docs/roadmap.md` → Phase 10c (part of "offline/PWA", brought forward from Post-MVP)

## Goal
A class teacher in an area with weak or no signal can **take the morning register on their phone without a connection**. It's saved on the phone and sent automatically when the phone is back online, without ever silently overwriting a register the school already has.

Alongside that, Edu Desk becomes an **installable app** (Add to Home screen), and its pages and files stay on the phone, so it opens without signal and uses less mobile data.

**Not in this phase:**
- **Offline score entry:** the next phase, once this is proven in the pilot.
- **Fees and payments:** must be online; receipt numbers come from the server, in order.
- **Results, promotion, school setup and parent logins:** must be online.
- **Parents' offline viewing:** later, read-only.

## User stories
- **As a class teacher, I open the app once while online.** My classes, their student lists and today's register are saved on my phone.
- **As a class teacher with no signal:**
  - I open Edu Desk from my home screen and go to Attendance.
  - I see my class with yesterday's student list.
  - I mark the register and tap **Save**.
  - It says **"Saved on this phone — will send when you're online"**, and the class shows a "Waiting to send" badge.
- **When my phone is back online** (even days later, or the next time I open the app), the waiting registers send by themselves. Each shows **"Sent"**, or a message if the school's copy changed.
- **If someone at school already took or corrected that day's register,** the school's copy wins. My phone shows me both ("Yours" / "School's") and lets me discard mine or reopen and edit the school's. Nothing is overwritten silently.
- **If the class changed while I was offline** (a student joined or left), the send is refused with the reason. I reopen the register, which loads the new list with my marks kept, and send again.
- **As an admin,** I see registers that arrived after their day marked **"Sent late (offline)"**, with when they arrived. I can still correct any register, as today.
- **When I log out,** everything Edu Desk saved on the phone is wiped, including unsent registers (I'm warned first). Shared phones stay safe.

## Rules
- **Late registers.** Today a class teacher can only take *today's* register. A register **taken offline** may arrive up to **3 days after its date**, if that date is still within the term and not in the future.
  - It's stored with `sentLateAt`, the arrival time, which shows as "Sent late (offline)".
  - Admins and principals can still back-fill any date in the term, as now.
- **Conflict check.** An offline register carries the version of the school's register the phone last saw: the `updatedAt` it had, or none if there wasn't one.
  - If the school's register changed since (or now exists when the phone saw none), the send is refused with **409** and the school's current register. The school wins; the teacher decides.
  - Online saves keep working exactly as today.
- **Same validation as now:** every student in the class marked exactly once, and only students in the class. The checks run when the register arrives, against the class list *at that time*.
- **Trust.** The register's date comes from the phone, and a teacher could change their phone's clock. The 3-day window, the "Sent late" label and admin correction limit the risk.

## What changes
### Server (small)
- **`attendance_registers`:** add `sentLateAt` (timestamp, null) and `updatedAt`, if not already present, for the version check. One migration, which I'll run on the dev DB right after generating it.
- **`PUT /api/attendance/register`:** the body gains optional `offline: { baseUpdatedAt: string | null }`.
  - **With `offline`:** the 3-day late window applies, plus the version check (409 with `data.register` on a mismatch).
  - **Without it:** unchanged.
- **`registerDateError`** (pure, shared) gains the offline window, with unit tests.
- **The attendance summary and the register** expose `sentLateAt`, for the admin label.

### The installable app (PWA)
- **`@vite-pwa/nuxt`** (new package; needs your OK), with a web app manifest (name, icons from the Greenfield-style emblem colours, `display: standalone`) and a service worker that:
  - caches the app's files (JS, CSS, fonts, icons), so it loads without signal and uses less data;
  - caches pages a teacher has opened (network first, then the saved copy), so `/attendance` opens offline;
  - **never caches API data** (`/api/*` always goes to the network); offline data is handled by the app itself (below), so a phone can't serve another user's cached responses.
- **"Add to Home screen"** works on Android Chrome; iPhone gets the manual Share → Add to Home Screen.

### Offline attendance in the app
- **`app/utils/offline-store.ts`:** a small store in the browser (IndexedDB, through a tiny built-in wrapper; no extra package). It keeps, per user and per school:
  - **the teacher's classes and each class's student list,** refreshed whenever online;
  - **the outbox:** registers waiting to send (`classArmId`, `date`, marks, `baseUpdatedAt`, saved time, state).
- **`useOfflineRegister()`:**
  - **Load:** online → the server (and refresh the saved copy); offline → the saved copy.
  - **Save:** online → as today; offline (or network error) → into the outbox.
- **`useOutboxSync()`:** sends waiting registers when the browser comes online, when the app opens, and when the teacher taps "Send now". It records each result: Sent / School's copy changed / Class changed / Error (retried).
- **UI:**
  - a "You're offline" banner;
  - "Saved on this phone" / "Waiting to send" / "Sent" states on the register and on My classes;
  - the conflict view (Yours vs School's);
  - "Sent late (offline)" on the admin's views.
- **Logout:** a warning if registers are waiting, then the offline store is wiped. The service worker's page cache holds no school data beyond the page shells.

## Test plan
- **Unit:**
  - `registerDateError` with the offline window (today, 1–3 days late, 4 days late refused, the future refused, outside the term refused, teacher vs admin);
  - the outbox state machine and sync results, with a fake network: sent, 409, 400, network error then retry, order kept, no duplicate sends;
  - offline-store namespacing (per school and user) and wiping.
- **Integration (`attendance-offline.test.ts`):**
  - **Late window:** a class teacher sends yesterday's register with `offline` → 201 with `sentLateAt` set; a 4-day-old one is refused; without `offline`, yesterday is still refused (unchanged rule).
  - **Version check:** changed since → 409 with the school's register, nothing written; `baseUpdatedAt: null` but a register now exists → 409; a matching version → saved.
  - **Class changed:** a student added since → 400 "Mark every student".
  - **Access and isolation:** another teacher's class → 403; another school → 404 (as today).
  - **Views:** the summary and the register show `sentLateAt`.
- **Nuxt:**
  - the register shows "Saved on this phone" when the save goes to the outbox;
  - the waiting badge on My classes;
  - the conflict view chooses yours or the school's;
  - logout warns about waiting registers.
- **E2E (Playwright, Chromium with the service worker):**
  - **Offline register:** the class teacher opens Attendance online; the browser goes offline (`context.setOffline(true)`); they reload, the page still opens, they mark and save, and see "Saved on this phone". Back online, it sends by itself and shows "Sent", and the register is on the server.
  - **Conflict:** offline save, the admin corrects the same register online, then the teacher reconnects and sees the conflict view.
  - **Phone width:** the offline banner and states fit at 375px.

## Implementation sub-steps
1. **Server:** migration (`sentLateAt`, version), offline late window and version check, `sentLateAt` in views (tests first).
2. **PWA:** add `@vite-pwa/nuxt`, manifest, icons, service worker (app files plus page shells, never `/api`); check the Cloudflare and Docker builds still pass.
3. **Offline store, outbox and sync composables** (unit tests first, with fake network and storage).
4. **UI:** offline banner, save states, outbox badge, conflict view, logout wipe, admin "Sent late" label, Nuxt tests.
5. **E2E offline journeys, docs** (domain rules, decision, runbooks: a note that offline needs one online visit first), push, CI.

## Acceptance checklist
- [x] A class teacher can open Attendance, take and save a register with no connection, and it sends automatically later
- [x] Late offline registers (up to 3 days) are accepted and labelled "Sent late (offline)"; older ones are refused
- [x] An offline register never overwrites a newer school register; the teacher sees both and chooses
- [x] Edu Desk installs to the home screen and opens without signal after one online visit
- [x] No API data is cached by the service worker; logout wipes the offline store
- [x] Works at 375px; Cloudflare and Docker builds still pass; `pnpm check`, `pnpm test:e2e` and CI green

## Changes while building
- **A `version` counter instead of comparing `updatedAt`:** the database keeps microseconds but JSON timestamps only milliseconds, so an exact match would misfire. Every save adds 1; an offline copy sends `offline: { baseVersion }`. The check runs inside the save itself (insert-if-none / update-where-version), so two arrivals at once can't both win.

- **Where things live:** the offline store is `app/utils/offline/` (storage + outbox) with one composable, `useOfflineAttendance()`, and a client plugin that sends; the page itself switches between the server's data and the phone's copies.
- **A 401 while sending** keeps registers waiting (the session ended), instead of marking them refused.
- **Pages saved on the phone** are server-rendered, so they can be from an earlier day: the attendance page checks the date with the server and uses the phone's copies offline.
- **Icons** (`/api/_nuxt_icon/`) are cached by the service worker: they hold no school data and the app needs them offline.
- **The class summary** shows a count of registers sent late, rather than a per-day label (the summary has no per-day list).

## Open questions (resolved 2026-10-16: all recommendations approved)
1. **Late window:** 3 days (recommended)? Longer helps very remote schools; shorter is stricter.
2. **New package `@vite-pwa/nuxt`** (the standard Nuxt offline/installable-app module; Workbox underneath). OK to add?
3. **Logout with unsent registers:** warn, then wipe (recommended)? Or block logout until they're sent?
4. **Who can take registers offline:** class teachers only (recommended; they take the daily register)? Admins and principals stay online-only.
5. **App name and icon on the home screen:** "Edu Desk" with a generic icon (recommended for now; per-school icons later)?
