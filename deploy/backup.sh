#!/usr/bin/env bash
# Encrypted database backup. Run from cron or a systemd timer.
#
# Required environment:
#   DB_HOST, DB_NAME, DB_USER, DB_PASSWORD   database access (use a read-only backup user)
#   BACKUP_DIR                               target directory
#   AGE_RECIPIENT                            public key of age (https://age-encryption.org); keep the private key elsewhere
# Optional: KEEP_DAYS (default 30), DB_PORT (default 3306)
#
# Restore: age -d -i key.txt backup.sql.gz.age | gunzip | mariadb -h HOST -u USER -p DBNAME
set -euo pipefail
umask 077

: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}" "${BACKUP_DIR:?}" "${AGE_RECIPIENT:?}"
keep_days="${KEEP_DAYS:-30}"

dump_cmd="$(command -v mariadb-dump || command -v mysqldump || true)"
[[ -n "$dump_cmd" ]] || { echo "neither mariadb-dump nor mysqldump is installed" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/foodlog-$(date -u +%Y%m%dT%H%M%SZ).sql.gz.age"
partial="$target.partial"
credentials="$(mktemp)"
trap 'rm -f "$partial" "$credentials"' EXIT

# The password goes into a private option file, not onto the command line or into the environment.
escaped="${DB_PASSWORD//\\/\\\\}"
escaped="${escaped//\"/\\\"}"
printf '[client]\npassword="%s"\n' "$escaped" > "$credentials"

"$dump_cmd" --defaults-extra-file="$credentials" \
  --host="$DB_HOST" --port="${DB_PORT:-3306}" --user="$DB_USER" \
  --single-transaction --routines --no-tablespaces "$DB_NAME" \
  | gzip -9 \
  | age -r "$AGE_RECIPIENT" -o "$partial"

mv "$partial" "$target"
find "$BACKUP_DIR" -maxdepth 1 -name 'foodlog-*.sql.gz.age' -mtime "+$keep_days" -delete
echo "$target"
