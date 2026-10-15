# Phase 10b — Serverless deployment (Cloudflare Workers + Supabase)

**Status:** Approved (2026-10-15), in progress
**Roadmap ref:** `docs/roadmap.md` → Phase 10b

## Goal
Run Edu Desk with **no server to manage**, on free plans, until the business can afford a VPS:
- the app on **Cloudflare Workers** (the Nuxt server and its static files);
- the database on **Supabase** (PostgreSQL), reached through Cloudflare **Hyperdrive**;
- uploads and off-site backups on **Cloudflare R2**.

The Docker/VPS path from Phase 10a **keeps working**: one codebase, two deploy targets. Moving to a VPS later is a backup, a restore, and pointing DNS at the new server.

## What we checked (2026-10-15)
| Fact | Effect on Edu Desk | Answer in this spec |
|---|---|---|
| Workers **Free: 10 ms CPU per request** (Paid: 30 s default); waiting on the database doesn't count | Login password checks (scrypt) and heavier server-rendered pages may exceed 10 ms; **logins may fail on Free** | **Measured on the first deploy** (sub-step 4, before any school uses it). If logins or pages exceed it, we stop and you choose: Workers Paid (~$5/month), or another password-hash setting. Weakening password security silently is not an option |
| Workers **support wildcard routes** (`*.yourdomain/*`) and custom domains | Every school's subdomain works automatically, like the VPS setup | One route plus one wildcard DNS record |
| **Supabase Free pauses a project after ~1 week without activity**, and includes **no backups** | The app would be down after a quiet week, and there'd be no copy of the data | An uptime monitor checks `/api/_health` (a database query) every 5 minutes, which keeps it active; our own nightly encrypted backup to R2 |
| Supabase Free: 500 MB database, 1 GB storage | Plenty for a few pilot schools; photos go to R2 instead | — |
| Workers can't reuse one request's database connection in another request | Our `useDb()` keeps one global connection, which breaks on Workers | **Hyperdrive** (in Workers Free) pools connections to Supabase; a cheap client per request |
| Workers Free: 100,000 requests a day | Enough for a few schools | Watched in the runbook |

## Changes (portable: they also work on the VPS)
1. **Database client per request.** Nitro's async context makes `useDb()` return a client scoped to the current request.
   - **On Cloudflare:** the connection string comes from the Hyperdrive binding. The client is created per request and closed when the request ends.
   - **On Node/VPS:** the long-lived pool stays as today.
   - Route code doesn't change. Tests keep injecting PGlite.
2. **The login rate limit moves into the database** (a `login_failures` table, same rules: 5 per account and 50 per IP per 15 minutes). Many short-lived Cloudflare instances don't share memory. This is also correct if the VPS ever runs two instances.
3. **Uploads storage is chosen at deploy time:** the local disk (VPS, as now) or an **R2 binding** (Cloudflare), via unstorage's built-in drivers. Keys stay `schools/<id>/…`.
4. **Real visitor IP on Cloudflare:** `NUXT_TRUST_PROXY=cloudflare` reads `CF-Connecting-IP`, which Cloudflare sets and visitors can't fake. `true` stays the setting for Caddy (decision 043).
5. **The health check** stays `/api/_health`; the uptime monitor doubles as Supabase's keep-alive.

## Cloudflare-specific pieces
- **Build:** `NITRO_PRESET=cloudflare_module pnpm build`, with the `nodejs_compat` compatibility flag. postgres.js supports Workers through Cloudflare sockets.
- **`wrangler.toml`:**
  - the Worker with its static assets;
  - bindings for R2 (`UPLOADS`) and Hyperdrive (`DB`);
  - **Smart Placement**, so the code runs near Supabase instead of near the visitor (fewer slow round trips per page);
  - variables `NUXT_APP_DOMAIN` and `NUXT_TRUST_PROXY=cloudflare`;
  - the session password as an encrypted secret.
- **Domains:**
  - **Before you have a domain:** the first school runs on `edu-desk.<account>.workers.dev` with `NUXT_DEFAULT_SCHOOL_SLUG` (one school only, since `workers.dev` has no per-school subdomains).
  - **With a domain on Cloudflare:** a route `*.yourdomain/*` plus the bare domain, and one wildcard DNS record. New schools need no DNS work.
- **Database:** Supabase in an EU region (London or Frankfurt; no African region as far as we know). Hyperdrive connects through the Supabase session pooler or a direct connection. Migrations use the session connection.
- **Creating schools:** `pnpm school:create` runs from your laptop or CI against Supabase (`DATABASE_URL`).

## CI/CD (GitHub Actions)
- **Deploy on push to `main`, after the existing checks pass:**
  1. `pnpm db:migrate` against Supabase;
  2. build with the Cloudflare preset;
  3. `wrangler deploy`;
  4. call `/api/_health` on the live site.
- **Pull requests** get a **preview version** (`wrangler versions upload`) with **read-only database credentials**, so a preview can't change data.
- **Nightly backup** (scheduled GitHub Action, free):
  - `pg_dump` from Supabase, plus a copy of the R2 uploads, encrypted with `BACKUP_PASSPHRASE` and uploaded to an R2 backups bucket;
  - kept 14 days daily and 8 weeks weekly (decision 042's rules);
  - a failed run emails you through GitHub's own notification.
- **Restore drill:** a manual GitHub Action restores the latest backup into a scratch Postgres in CI and checks the migration count; the runbook covers restoring into Supabase.
- **The Docker job stays,** so the VPS path keeps working.

## Ops docs
- **`docs/deploy-cloudflare.md`**, the runbook:
  - first setup: Cloudflare account, R2 buckets, Hyperdrive, Worker, Supabase project and region, GitHub secrets; adding a domain later;
  - adding a school;
  - deploys and previews;
  - backups and the restore drill;
  - the uptime monitor (doubling as keep-alive);
  - free-plan limits to watch: 100k requests a day, 10 ms CPU, 500 MB database;
  - **moving to a VPS later** (backup → restore → DNS).
- **`docs/deploy.md`** stays the VPS runbook.

## Test plan
- **Unit:** the database-backed login limiter (window, per account, per IP); choosing the trust-proxy mode (`CF-Connecting-IP` only in `cloudflare` mode, ignored otherwise).
- **Integration:**
  - the existing login rate-limit tests run against the database limiter (same expectations);
  - `useDb()` per-request scoping (separate clients per request on the Cloudflare path, the same pool on Node);
  - uploads storage driver selection;
  - all existing suites green (no route changes).
- **Build checks in CI:** a Cloudflare-preset build on every push, so a Node-only API sneaking into server code fails early. The Docker job stays green.
- **Deployed smoke test:** after deploy, `/api/_health` returns 200. The first deploy also measures CPU per request (`wrangler tail`) for login, the dashboard, a report card and a score sheet against the 10 ms limit.
- **E2E:** unchanged (they run against the Node build). Optionally later: run them against a preview.

## Implementation sub-steps
1. **Portable foundations:** database login limiter (migration), per-request `useDb()`, configurable uploads storage, `cloudflare` trust mode (tests first).
2. **Cloudflare build:** `wrangler` (dev dependency), Nitro preset, `wrangler.toml` (R2, Hyperdrive, Smart Placement, assets), the CI build check, a local run with `wrangler dev`.
3. **Deploy and backup pipelines:** GitHub Actions deploy with migrations, previews, nightly backup to R2, manual restore drill.
4. **`docs/deploy-cloudflare.md`, then the first real deploy together:** you create the accounts and click the buttons, I guide. That includes the **CPU measurement and the free-plan decision point**, then docs and decisions.

## Acceptance checklist
- [ ] Edu Desk runs on Cloudflare Workers + Supabase; login, a report card, a payment and a receipt work on the deployed site
- [ ] CPU per request measured against the free 10 ms limit, and the outcome decided with you
- [ ] With a domain: every school's subdomain works over HTTPS through one wildcard route
- [ ] The login rate limit holds across instances (database-backed) and uses the real visitor IP
- [ ] Uploads (logo, student photo) persist in R2
- [ ] Nightly encrypted backups land in R2; a restore drill succeeds
- [ ] Deploys run migrations first, and failed checks block a deploy
- [ ] The Docker/VPS path still builds, boots and passes its CI job

## Decisions (resolved 2026-10-15)
1. **Cloudflare Workers** (not Pages): wildcard routes for school subdomains, and Smart Placement.
2. **Workers Free plan**, with the CPU limit measured at the first deploy and a decision then if it's exceeded.
3. **`wrangler`** added as a dev dependency.
4. **Previews** with read-only database credentials.
5. **Supabase region:** EU.
6. **Domain:** later; until then one school on `workers.dev`.

Sources: Cloudflare Workers limits and pricing docs, Cloudflare Pages known issues (no wildcard custom domains), Cloudflare Workers custom domains docs, Supabase free-tier summaries (third-party; confirm on supabase.com).
