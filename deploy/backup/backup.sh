#!/bin/sh
# One backup: the database (pg_dump, custom format) and the uploads folder, packed into one file, encrypted
# with BACKUP_PASSPHRASE (gpg, AES256), kept locally (newest 3) and copied off-site:
#   daily/  kept 14 days        weekly/ (Sundays) kept 8 weeks
# Database connection: PGHOST, PGUSER, PGPASSWORD, PGDATABASE. Off-site: BACKUP_S3_BUCKET plus the
# RCLONE_CONFIG_OFFSITE_* settings; with no bucket the copy stays local only (a warning is logged).
# Optional BACKUP_HEARTBEAT_URL is pinged on success, so a monitor notices when backups stop.
set -eu

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
stamp=$(date -u +%Y-%m-%dT%H%MZ)
name="edudesk-${stamp}.tar.gpg"
work=$(mktemp -d /backups/work.XXXXXX)
passfile=$(mktemp)
trap 'rm -rf "$work" "$passfile"' EXIT
printf '%s' "$BACKUP_PASSPHRASE" > "$passfile"

pg_dump --format=custom --no-owner --file="$work/database.dump"
tar -C /uploads -czf "$work/uploads.tar.gz" .
tar -C "$work" -cf - database.dump uploads.tar.gz \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-file "$passfile" \
        --symmetric --cipher-algo AES256 --output "/backups/$name"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  rclone copy "/backups/$name" "offsite:${BACKUP_S3_BUCKET}/daily/"
  if [ "$(date -u +%u)" = "7" ]; then
    rclone copy "/backups/$name" "offsite:${BACKUP_S3_BUCKET}/weekly/"
  fi
  rclone delete --min-age 15d "offsite:${BACKUP_S3_BUCKET}/daily/"
  rclone delete --min-age 57d "offsite:${BACKUP_S3_BUCKET}/weekly/"
  where="off-site and local"
else
  where="LOCAL ONLY (BACKUP_S3_BUCKET is not set)"
fi

# Keep the newest 3 local copies
ls -1t /backups/edudesk-*.tar.gpg | tail -n +4 | xargs -r rm -f

size=$(du -h "/backups/$name" | cut -f1)
echo "$(date -Iseconds) backup ok: $name ($size), $where" | tee -a /backups/backup.log

if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  curl -fsS -m 30 --retry 3 "$BACKUP_HEARTBEAT_URL" > /dev/null || echo "heartbeat ping failed"
fi
