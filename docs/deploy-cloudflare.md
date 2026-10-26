# Deploying Edu Desk on Cloudflare Workers + Supabase

The no-server setup (decision 047): the app on **Cloudflare Workers**, the database on **Supabase**, uploads and backups on **Cloudflare R2**, deploys and backups run by **GitHub Actions**. All on free plans. The VPS setup (`docs/deploy.md`) still works; see "Moving to a VPS" at the end.

| Piece | Where | Free plan limits that matter |
|---|---|---|
| App (Nuxt) | Cloudflare Workers (`wrangler.jsonc`) | 100,000 requests/day; **10 ms CPU per request** |
| Database | Supabase Postgres, reached through Cloudflare Hyperdrive | 500 MB; **paused after ~7 days without activity**; no backups |
| Logos, photos | R2 bucket `edudesk-uploads` | 10 GB |
| Backups | R2 bucket `edudesk-backups` (encrypted, nightly) | — |
| Deploys, backups | GitHub Actions | free for this repo's usage |

You click the buttons in each dashboard; everything else is automated. Allow about 1–2 hours the first time.

---

## 1. Supabase (the database)
1. Create a free account at supabase.com, then **New project**:
   - **Region:** an EU one (London or Frankfurt), the closest to Nigeria;
   - **Database password:** generate a strong one and save it in your password manager.
2. **Project → Connect → Session pooler:** copy the URI. It looks like `postgresql://postgres.<ref>:<password>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`. This is **`SUPABASE_DB_URL`**: used for migrations, backups and `school:create`, and by Hyperdrive. Don't use the "Transaction pooler" (port 6543).
3. **Previews** (optional). In **SQL Editor**, create a read-only login for preview sites. It can read everything, but it can only write the two things logging in needs:
   ```sql
   create role edudesk_preview login password '<another strong password>';
   grant usage on schema public, drizzle to edudesk_preview;
   grant select on all tables in schema public, drizzle to edudesk_preview;
   grant update (last_login_at) on public.users to edudesk_preview;
   grant select, insert, update, delete on public.login_failures to edudesk_preview;
   alter default privileges in schema public grant select on tables to edudesk_preview;
   ```
   Its URI is the session pooler URI with `edudesk_preview.<ref>` and that password.

## 2. Cloudflare
In the Cloudflare dashboard (free account):
1. **R2:** create two buckets, `edudesk-uploads` and `edudesk-backups`. Then **R2 → Manage API tokens → Create token**:
   - permission **Object Read & Write**, on these two buckets only;
   - note the **Access Key ID**, **Secret Access Key** and the **endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).
2. **Hyperdrive** (Workers → Hyperdrive, or from your laptop):
   ```sh
   pnpm exec wrangler login
   pnpm exec wrangler hyperdrive create edudesk-db --connection-string="<SUPABASE_DB_URL>"
   # previews (optional):
   pnpm exec wrangler hyperdrive create edudesk-db-preview --connection-string="<read-only URI>"
   ```
   Note each **id**: `HYPERDRIVE_ID` and `HYPERDRIVE_PREVIEW_ID`.
3. **API token for deploys:** My Profile → API Tokens → Create Token → template **"Edit Cloudflare Workers"**, for your account → `CLOUDFLARE_API_TOKEN`. The **Account ID** is on the Workers overview page → `CLOUDFLARE_ACCOUNT_ID`.
4. **Your workers.dev address:** Workers → your subdomain, e.g. `yourname.workers.dev`. The app will be at `https://edu-desk.yourname.workers.dev`.
5. **Session secret** (once per Worker; it seals login cookies, and changing it logs everyone out):
   ```sh
   openssl rand -hex 32   # or any 64 random characters; save it in your password manager
   pnpm exec wrangler secret put NUXT_SESSION_PASSWORD
   pnpm exec wrangler secret put NUXT_SESSION_PASSWORD --name edu-desk-preview   # previews only
   ```
   (The first deploy creates the Worker; if `secret put` says it doesn't exist yet, run it again right after the first deploy.)

## 3. GitHub (deploys and backups)
Repository → **Settings → Secrets and variables → Actions**.

**Secrets:**

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the session pooler URI (step 1.2) |
| `CLOUDFLARE_API_TOKEN` | step 2.3 |
| `CLOUDFLARE_ACCOUNT_ID` | step 2.3 |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | step 2.1 |
| `BACKUP_PASSPHRASE` | a long random passphrase. **Save it off GitHub**: without it, backups can't be restored |

**Variables:**

| Name | Value |
|---|---|
| `CLOUDFLARE_DEPLOY` | `true` (switches the deploy and backup workflows on) |
| `HYPERDRIVE_ID` | step 2.2 |
| `APP_DOMAIN` | `edu-desk.yourname.workers.dev` now; your domain later |
| `DEFAULT_SCHOOL_SLUG` | your first school's slug, e.g. `greenfield` (needed on workers.dev; empty once you have a domain) |
| `APP_URL` | `https://edu-desk.yourname.workers.dev` |
| `BACKUP_BUCKET` / `UPLOADS_BUCKET` | `edudesk-backups` / `edudesk-uploads` |
| `HYPERDRIVE_PREVIEW_ID`, `PREVIEW_APP_DOMAIN` | previews only: step 2.2, and `edu-desk-preview.yourname.workers.dev` |

## 4. First deploy
1. **Actions → Deploy to Cloudflare → Run workflow.** It runs the database migrations on Supabase, builds, deploys and checks `/api/_health`. After that, every push to `main` deploys automatically once CI is green.
2. **Create the school** from your laptop, against Supabase:
   ```sh
   # PowerShell: $env:DATABASE_URL="<SUPABASE_DB_URL>"; pnpm school:create --slug greenfield ...
   DATABASE_URL="<SUPABASE_DB_URL>" pnpm school:create --slug greenfield --name "Greenfield Academy" \
     --admin-name "Adaeze Okafor" --admin-email owner@example.com
   ```
   The slug must match `DEFAULT_SCHOOL_SLUG`. **Never run `pnpm db:seed` against Supabase:** it would load demo data into the real database.
3. Open `APP_URL`, log in with the one-time password, and set your own.

## 5. The CPU check (free plan: 10 ms per request)
Logging in deliberately does slow password hashing. Check it fits **before a school relies on it**:
```sh
pnpm exec wrangler tail edu-desk --format pretty
```
Then log in, and open the dashboard, a report card and a score sheet.
- **`Exceeded CPU` errors** (or error 1102 in the browser) mean a request needed more than the free 10 ms.
- **The fix:** Workers Paid (about $5/month), which raises the limit to 30 s by default. The other option is lighter password hashing, which we don't recommend for accounts holding children's records. Decide together; don't change it silently.

Workers → edu-desk → **Metrics** also shows CPU time per request.

## 6. Keep Supabase awake (and know when it's down)
Supabase's free plan pauses a project after about a week without activity, so school holidays would take the app down. In a free uptime monitor (e.g. UptimeRobot), add an **HTTP monitor on `APP_URL/api/_health` every 5 minutes**:
- it alerts you when the site is down;
- `/api/_health` queries the database, so the project never goes idle.

If it does pause: Supabase dashboard → project → **Restore**.

## 7. Backups
- **Every night at 02:00 Lagos time,** the **Backup** workflow:
  - dumps the database and encrypts it with `BACKUP_PASSPHRASE`;
  - uploads it to `edudesk-backups/daily/` (kept 14 days) and, on Sundays, `weekly/` (kept 8 weeks);
  - copies all uploads to `edudesk-backups/uploads-mirror/`.

  A failed run emails you.
- **Restore drill (each term):** Actions → Backup → Run workflow → tick **Restore drill**. It restores the newest backup into a scratch database and prints the number of migrations and schools.
- **Real restore into Supabase:**
  1. Download a backup from R2 and decrypt it: `gpg --decrypt edudesk-….dump.gpg > database.dump`.
  2. Restore it, preferably into a new Supabase project first: `pg_restore --no-owner --no-privileges --clean --if-exists --dbname "<SUPABASE_DB_URL>" database.dump`.
  3. Point Hyperdrive at it if it's a new project: `wrangler hyperdrive update <id> --connection-string=…`.

## 8. Adding your domain later
1. Add the domain to Cloudflare (Websites → Add a site; free plan) and change its nameservers at your registrar.
2. **DNS:** a proxied `AAAA` record `*` → `100::`, and the same for `@`. Workers routes take the traffic, and Cloudflare's free certificate covers `*.yourdomain`.
3. In `wrangler.jsonc`, add `"routes": [{ "pattern": "*.yourdomain/*", "zone_name": "yourdomain" }, { "pattern": "yourdomain/*", "zone_name": "yourdomain" }]` and commit.
4. GitHub variables: `APP_DOMAIN=yourdomain`, `DEFAULT_SCHOOL_SLUG=` (empty), `APP_URL=https://<first-school>.yourdomain`. Every school then lives at `<slug>.yourdomain` automatically.

## Offline attendance (installable app)
- Works only over **https** (the workers.dev address and your domain both are). A teacher must open Attendance **once while online** on their phone; after that it opens and saves registers with no signal.
- After a deploy, phones pick up the new version the next time they open the app online.
- If a teacher says registers are stuck "Waiting to send", check that they're still logged in; an expired session keeps them waiting until they log in again (they're never lost by expiry, only by logging out).

## 9. Free-plan limits to watch
- **Requests:** Workers 100,000 a day. A school of 500 is far below this; check Workers → Metrics now and then.
- **CPU:** 10 ms per request (section 5).
- **Database:** Supabase 500 MB. Project → Reports shows the size; the database stays small, since photos live in R2.

## 10. Moving to a VPS
1. Set up the VPS with `docs/deploy.md` (sections 1.1–1.4).
2. Take a fresh backup and restore it into the VPS database (`pg_restore` as in section 7).
3. Copy the uploads from R2 into the server's uploads volume (`rclone copy r2:edudesk-uploads <volume>/`).
4. Point DNS at the server (unproxied, or keep Cloudflare in front), then set `CLOUDFLARE_DEPLOY=false`.
