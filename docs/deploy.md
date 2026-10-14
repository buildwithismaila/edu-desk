# Deploying and running Edu Desk

The runbook for the production server: first-time setup, creating schools, updates, backups and what to do when something goes wrong. Everything runs on **one server with Docker Compose** (decision 042):

| Service | What it does |
|---|---|
| `postgres` | The database, on the `pgdata` volume |
| `migrate` | Applies new database migrations on every deploy, then exits |
| `app` | Edu Desk (Nuxt), on the `uploads` volume for logos and photos |
| `caddy` | HTTPS for the bare domain and every `<school>.<domain>`, certificates issued automatically |
| `backup` | Nightly encrypted backup of the database and uploads, copied off-site |
| `tools` | One-off commands (create a school), never running on its own |

Commands below run **on the server, in the `deploy/` folder** unless stated.

---

## 1. First-time setup (about 1–2 hours)

### 1.1 Server
- Rent a VPS: Ubuntu 24.04, 2 vCPU, 4 GB RAM, 40 GB disk is plenty for a pilot (e.g. Hetzner, DigitalOcean, Contabo).
- Log in with an **SSH key** (not a password), then:
  ```sh
  sudo apt update && sudo apt upgrade -y
  # Firewall: SSH and web only
  sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
  sudo ufw enable
  # Docker
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER   # log out and in again
  # Automatic security updates
  sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
  ```

### 1.2 DNS
At your domain registrar, point **two** records at the server's IP address:

| Type | Name | Value |
|---|---|---|
| A | `@` (the bare domain) | server IP |
| A | `*` (every subdomain) | server IP |

Each school is then `<slug>.<domain>`, e.g. `greenfield.edudesk.ng`. No per-school DNS work.

### 1.3 Off-site backup storage (Cloudflare R2)
1. Create a Cloudflare account, enable **R2**, create a bucket (e.g. `edudesk-backups`).
2. Create an **R2 API token** with *Object Read & Write* on that bucket only. Note the Access Key ID, Secret Access Key and the endpoint (`https://<account-id>.r2.cloudflarestorage.com`).

### 1.4 Get the code and configure it
```sh
git clone https://github.com/buildwithismaila/edu-desk.git
cd edu-desk/deploy
cp .env.example .env
nano .env
```
Fill in every value. Generate secrets with `openssl rand -hex 32`. **Save `BACKUP_PASSPHRASE` and `SESSION_PASSWORD` in your password manager, off the server**: without the passphrase, backups can't be restored.

### 1.5 Start it
```sh
docker compose up -d --build
docker compose ps          # all running; "migrate" exited 0
docker compose logs -f app # Ctrl+C to stop following
```
Open `https://<domain>/api/_health`: `{"ok":true}`. The first HTTPS visit to each hostname takes a few seconds while its certificate is issued.

### 1.6 Uptime monitoring
In a free uptime service (e.g. UptimeRobot):
- an **HTTP monitor** on `https://<domain>/api/_health` every 5 minutes, alerting you by email/SMS;
- a **heartbeat monitor** for the backups (expects a ping once a day), with its URL in `.env` as `BACKUP_HEARTBEAT_URL`, then `docker compose up -d backup`.

Test it: `docker compose stop app`, wait for the alert, `docker compose start app`.

### 1.7 Restore drill (before the pilot starts)
Do [section 4.2](#42-restore-drill-each-term) once now, so you know restores work.

---

## 2. Creating a school
```sh
docker compose run --rm tools school:create \
  --slug greenfield --name "Greenfield Academy" \
  --admin-name "Adaeze Okafor" --admin-email owner@greenfieldacademy.ng --admin-phone 08031234567
```
It prints the school's address and the admin's **one-time password**: give it to them privately; they must change it at first login. The slug becomes the subdomain: lowercase letters, digits and hyphens; `www`, `admin`, `api`, `app`, `mail`, `support`, `platform` are reserved.

The admin then sets up the school in the app: School profile (logo, bank accounts), Calendar, Classes, Subjects, Assessment & grading, Fee items, then students (CSV import) and staff.

Never run `pnpm db:seed` in production: it refuses anyway (`NODE_ENV=production`).

---

## 3. Updating the app
```sh
cd edu-desk && git pull
cd deploy && docker compose up -d --build
docker compose ps && docker compose logs --tail 50 app
```
New migrations run automatically before the app starts. Updates take a minute; do them outside school hours.

---

## 4. Backups

### 4.1 What happens every night
At `BACKUP_HOUR` (default 02:00 Lagos time) the `backup` service:
1. dumps the database (`pg_dump`) and packs the uploads folder;
2. encrypts both into one file with `BACKUP_PASSPHRASE` (gpg, AES-256);
3. copies it to R2 `daily/` (kept 14 days) and, on Sundays, `weekly/` (kept 8 weeks);
4. keeps the newest 3 on the server, logs the result and pings the heartbeat.

Check it: `docker compose exec backup cat /backups/backup.log`. Take one now: `docker compose run --rm backup backup.sh`.

### 4.2 Restore drill (each term)
Restores into a **separate** database; live data is untouched.
```sh
docker compose run --rm backup restore.sh latest --into-database drill
docker compose exec postgres psql -U edudesk -d drill -c 'select slug, name from schools'
docker compose exec postgres dropdb -U edudesk drill
```
To drill from off-site (as if the server were gone), use a file name from R2 instead of `latest`, e.g. `edudesk-2026-10-14T0100Z.tar.gpg`. Write the date in your ops notes.

### 4.3 Real restore (disaster recovery)
```sh
docker compose stop app
docker compose run --rm backup restore.sh <backup-file-or-latest> --replace-live-data
docker compose start app
```
**New server** (old one lost): do sections 1.1–1.4 with the **same** `.env` (from your password manager), `docker compose up -d postgres`, run the restore above with a file name from R2, then `docker compose up -d --build`.

---

## 5. When something goes wrong

| Symptom | Check | Fix |
|---|---|---|
| Uptime alert, site down | `docker compose ps`, `docker compose logs --tail 100 app` | `docker compose up -d`; if the app keeps restarting, read the log's last error |
| "Database unavailable" from `/api/_health` | `docker compose logs --tail 50 postgres`, `df -h` | Disk full: remove old Docker images (`docker image prune -a`), then grow the disk |
| A school's address shows a certificate error | `docker compose logs caddy \| grep -i error` | DNS `*` record wrong, or the slug doesn't exist |
| Backups stopped (heartbeat alert) | `docker compose exec backup cat /backups/backup.log` | Usually R2 keys or a full bucket; run `docker compose run --rm backup backup.sh` to see the error |
| Everyone logged out after an update | `SESSION_PASSWORD` changed | Put the old value back |
| A user forgot their password | — | The school's admin resets it (Staff, or the guardian on the student profile); an admin who forgot theirs: another admin resets it |

Logs: `docker compose logs app` shows server errors as JSON lines (time, route, status, message; no personal data).

---

## 6. Routine
| When | What |
|---|---|
| Weekly | Glance at the uptime monitor and `backup.log` |
| Monthly | `sudo apt update && sudo apt upgrade -y` (reboot at night if asked); `df -h` |
| Each term | Restore drill (4.2) |
| Every year or two | PostgreSQL major upgrade (dump, new image, restore); plan it, don't rush it |
