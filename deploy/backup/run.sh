#!/bin/sh
# Runs backup.sh every night at BACKUP_HOUR (TZ from the environment). With arguments, runs them instead,
# e.g. `docker compose run --rm backup backup.sh` or `... backup restore.sh latest --into-database drill`.
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

hour="${BACKUP_HOUR:-2}"
echo "Backups scheduled daily at ${hour}:00 (${TZ:-UTC})"
while true; do
  now=$(date +%s)
  next=$(date -d "today ${hour}:00" +%s)
  if [ "$next" -le "$now" ]; then
    next=$(date -d "tomorrow ${hour}:00" +%s)
  fi
  sleep $((next - now))
  if ! backup.sh; then
    echo "$(date -Iseconds) BACKUP FAILED" | tee -a /backups/backup.log
  fi
done
