# Nightly backups (docs/deploy.md): pg_dump + uploads, encrypted with gpg, copied off-site with rclone.
# Same PostgreSQL major version as the database, so pg_dump/pg_restore match the server.
FROM postgres:18
RUN apt-get update \
  && apt-get install -y --no-install-recommends rclone gnupg curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY run.sh backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/run.sh /usr/local/bin/backup.sh /usr/local/bin/restore.sh
ENTRYPOINT ["run.sh"]
