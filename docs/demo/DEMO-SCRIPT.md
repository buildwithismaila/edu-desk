# Edu Desk — school demo script

A 20–25 minute live demo for a proprietor and principal, using the **Greenfield Academy** demo school. It runs on your laptop with **no internet needed**.

## The night before
1. `pnpm demo:reset` — a fresh demo school. Do this before **every** demo and every rehearsal: it undoes what you did last time (payments, published results, logins).
2. `pnpm build` — only needed after code changes (takes a few minutes).
3. `pnpm demo:start` — the demo runs at **http://localhost:4000**. Leave this window open; Ctrl+C stops it.
   - To show the parent and teacher screens on a **real phone**, use `pnpm demo:start --lan`. The phone must be on the same Wi-Fi, and it prints the address to type on the phone. Windows may ask to allow access; click Allow on private networks.
4. Rehearse once, end to end, then `pnpm demo:reset` again.
5. Charge the laptop. Set the screen to stay on. Turn off notifications.

## Windows to have open (each keeps its own login)
| Window | Who | Login (password: `password123`) |
|---|---|---|
| Chrome, normal | **Proprietor** (Adaeze Okafor) | `admin@greenfield.test` |
| Chrome, incognito | **Class teacher** (Tunde Adeyemi, JSS 1A) | `teacher@greenfield.test` |
| Edge (or another browser) | **Bursar** (Fatima Bello) | `bursar@greenfield.test` |
| Your phone with `--lan`, or Chrome's phone view (F12 → phone icon, pick a phone) | **Parent** (Ngozi Eze, two children) | `08031110001` |

Log everyone in before the meeting starts.

---

## The story: "a day at Greenfield Academy"

### 1. Morning: the proprietor's dashboard (2 min) — *Proprietor window*
- **Dashboard:** 43 students; **attendance today**, with the classes that haven't taken their register yet; **fees this term**, collected vs expected and number of debtors; **results**, score sheets complete.
- *Say:* "Every morning you see the whole school on one screen: from your office, or your phone."

### 2. The register in one minute (2 min) — *Teacher window (use the phone view)*
- **Attendance → JSS 1A.** Everyone starts **Present**. Tap **A** for two students and **L** for one, then **Save register**.
- Back in the **Proprietor window**, refresh the Dashboard: JSS 1A is no longer on the "not taken" list, and today's rate has updated.
- *Say:* "No paper, no copying. The term summary goes straight onto the report card."

### 3. Scores to report card (6 min) — *Proprietor window*
1. **Results → JSS 1A.** It shows **one score is missing**: Chidera Eze's English Exam. *Say:* "It won't let you publish incomplete results."
2. **Scores → JSS 1A · English Language →** type Chidera's Exam score (e.g. `48`) → **Save**. Totals and grades fill in as you type.
3. **Results → JSS 1A →** see the ranked class: averages, positions, ties handled. Add a **principal's comment** if you like.
4. **Submit**, then **Publish** (normally the class teacher submits and the principal publishes; the proprietor can do both).
5. Open **Report cards** → one student's card: logo, scores, grades, positions, attendance, ratings, comments. Press **Print** to show the A4 layout. Also show the **Broadsheet**.
- *Say:* "This is the end-of-term weekend you no longer have. Once published, the card is frozen, so what parents see never changes."

### 4. Fees and receipts (5 min) — *Bursar window*
1. **Fees → Bills → search "Daniel" → Daniel Etim.** Show the bill and the balance.
2. **Record payment →** ₦20,000, Bank transfer, reference `DEMO-1` → **Save**. The **receipt** opens (A4, numbered).
3. Back on his fees page: the balance has dropped. Show a **reversed payment** on Ifeanyi Nwachukwu (search "Ifeanyi"): *"Mistakes are reversed with a reason, never deleted."*
4. **Debtors** (who owes what, printable) and **Collections** (expected vs collected, by class and method).
5. **Bills → filter Primary 3A → Print class invoices:** one invoice per child, with the **school's bank accounts** and "use the admission number as the payment reference".
- *Say:* "You always know who has paid and who owes, and nobody can make a payment quietly disappear."

### 5. What parents see (4 min) — *Parent (phone)*
1. **My children:** Chidera (JSS 1A) and Somto (Primary 3A), with attendance this term and fees ("Fully paid" / "Owing").
2. **Somto → Results →** the published report card. **Attendance** tab: rate and days absent. **Fees** tab: the bill, and **Invoice (how to pay)** with the bank details.
3. **Chidera → Fees → Receipt** on a payment.
4. If you published JSS 1A in step 3, **Chidera's new report card** is there too.
- *Say:* "Fewer calls to the office. Parents only ever see their own children."

### 6. Getting parents in (2 min) — *Proprietor window*
- **Parent logins →** filter **Primary 3A** → parents show **No login yet** → **Logins for Primary 3A without one** → printable **login slips** (8 per page).
- *Say:* "Print, cut, send home in the bag. Parents log in with their phone number and set their own password."

### 7. End of session (1 min, optional) — *Proprietor window*
- **Promotion → SSS 3A:** students are set to **Graduate** by default. Show **JSS 1A**: everyone moves to JSS 2A, and you can mark repeats or withdrawals. *Don't confirm*, or confirm and then **Undo**.

### 8. Close
- Back to the slides: **pilot offer and next steps.**

---

## Questions they may ask
- **"What if the internet is bad?"** It's light, and works on any phone browser. Offline attendance (taking the register with no signal, sent later) is in development.
- **"Is our data safe?"** Each school's data is separate; access is by role; nightly encrypted backups are kept off-site. Data protection under the NDPA is covered by a data processing agreement.
- **"Can we use our grading and report card format?"** Grading scales, CA/exam split and sections are set per school. The report card carries your logo and motto.
- **"Online fee payment (Paystack)?" / "SMS to parents?"** On the roadmap. Today: invoices with bank details, receipts and the parent portal.
- **"How do we start?"** A pilot term: we set it up with your classes and students, train your staff, and support you through to report cards.

## If something goes wrong
| Problem | Fix |
|---|---|
| `pnpm demo:start` says "port in use" | Another copy is running: close it (Ctrl+C), or close `pnpm dev` |
| "The current build is for cloudflare-module" | Run `pnpm build`, then `pnpm demo:start` |
| Can't log in | Check the password is `password123`; after many wrong tries, wait 15 minutes or run `pnpm demo:reset` |
| The demo data looks used | `pnpm demo:reset` (stop the demo first) |
| Phone can't open the address | Same Wi-Fi? Started with `--lan`? Allow Node through the Windows firewall (private networks) |
