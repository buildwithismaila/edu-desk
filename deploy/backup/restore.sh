#!/bin/sh
# Restores a backup made by backup.sh (docs/deploy.md, "Restoring").
#
#   restore.sh <backup> --into-database <name>
#       DRILL: restores into a NEW database <name> on the same server; live data is untouched. The uploads are
#       unpacked to /backups/restore/uploads for inspection.
#   restore.sh <backup> --replace-live-data
#       DISASTER RECOVERY: replaces the live database and uploads. Stop the app first
#       (docker compose stop app), then start it again.
#
# <backup> is a file name (local in /backups, else fetched from off-site daily/ then weekly/), or `latest`
# for the newest local copy.
set -eu

usage() {
  echo "Usage: restore.sh <backup|latest> (--into-database <name> | --replace-live-data)" >&2
  exit 2
}
[ "$#" -ge 2 ] || usage
backup="$1"; mode="$2"; target="${3:-}"
case "$mode" in
  --into-database) [ -n "$target" ] || usage ;;
  --replace-live-data) ;;
  *) usage ;;
esac
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"

if [ "$backup" = "latest" ]; then
  backup=$(ls -1t /backups/edudesk-*.tar.gpg 2>/dev/null | head -n 1 | xargs -r basename)
  [ -n "$backup" ] || { echo "No local backups in /backups" >&2; exit 1; }
fi
file="/backups/$backup"
if [ ! -f "$file" ]; then
  [ -n "${BACKUP_S3_BUCKET:-}" ] || { echo "$backup is not local and no off-site bucket is set" >&2; exit 1; }
  rclone copy "offsite:${BACKUP_S3_BUCKET}/daily/$backup" /backups/ 2>/dev/null \
    || rclone copy "offsite:${BACKUP_S3_BUCKET}/weekly/$backup" /backups/
  [ -f "$file" ] || { echo "Backup $backup not found off-site" >&2; exit 1; }
fi

work=/backups/restore
passfile=$(mktemp)
trap 'rm -f "$passfile"' EXIT
printf '%s' "$BACKUP_PASSPHRASE" > "$passfile"
rm -rf "$work" && mkdir -p "$work"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$passfile" --decrypt "$file" | tar -C "$work" -xf -
echo "Decrypted $backup"

if [ "$mode" = "--into-database" ]; then
  createdb "$target"
  pg_restore --no-owner --dbname="$target" "$work/database.dump"
  mkdir -p "$work/uploads" && tar -C "$work/uploads" -xzf "$work/uploads.tar.gz"
  echo "Restored into database \"$target\". Check it, e.g.:"
  echo "  docker compose exec postgres psql -U \$POSTGRES_USER -d $target -c 'select slug, name from schools'"
  echo "Then drop it: docker compose exec postgres dropdb -U \$POSTGRES_USER $target"
else
  pg_restore --no-owner --clean --if-exists --dbname="$PGDATABASE" "$work/database.dump"
  find /uploads -mindepth 1 -delete
  tar -C /uploads -xzf "$work/uploads.tar.gz"
  echo "Live database and uploads replaced from $backup. Start the app: docker compose start app"
fi
