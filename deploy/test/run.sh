#!/usr/bin/env bash
# Tests for deploy.sh and backup.sh with stand-ins for docker, curl, sleep, mysqldump and age.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
original_path="$PATH"
failures=0
passed=0

ok() { echo "ok - $1"; passed=$((passed + 1)); }
fail() { echo "not ok - $1: $2"; failures=$((failures + 1)); }
check() { # check <name> <condition command...>
  local name="$1"; shift
  if "$@"; then ok "$name"; else fail "$name" "condition failed: $*"; fi
}

make_stubs() {
  stubs="$1/stubs"; state="$1/state"
  mkdir -p "$stubs" "$state"
  cat > "$stubs/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $* [version=${FOODLOG_VERSION:-}]" >> "$STUB_STATE/calls.log"
case " $* " in
  *" pull "*) [[ -n "${FAIL_PULL:-}" ]] && exit 1 ;;
  *" run "*) [[ -n "${FAIL_MIGRATE:-}" ]] && exit 1 ;;
  *" up "*) echo "${FOODLOG_VERSION:-}" > "$STUB_STATE/running" ;;
esac
exit 0
STUB
  cat > "$stubs/curl" <<'STUB'
#!/usr/bin/env bash
echo "curl $*" >> "$STUB_STATE/calls.log"
running="$(cat "$STUB_STATE/running" 2>/dev/null || true)"
if [[ -f "$STUB_STATE/failures_left" ]]; then
  left="$(cat "$STUB_STATE/failures_left")"
  if ((left > 0)); then echo $((left - 1)) > "$STUB_STATE/failures_left"; exit 22; fi
fi
if [[ -f "$STUB_STATE/unhealthy" ]] && grep -qx "$running" "$STUB_STATE/unhealthy"; then exit 22; fi
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "$stubs/sleep"
  probe="$(mktemp -d)"; touch "$probe/a"
  if ! PATH="$original_path" mv -T "$probe/a" "$probe/b" 2> /dev/null; then
    # BSD mv has no -T (the server runs GNU coreutils): emulate it for local runs on macOS
    cat > "$stubs/mv" <<'STUB'
#!/usr/bin/env bash
args=()
for arg in "$@"; do [[ "$arg" == "-T" ]] || args+=("$arg"); done
exec /bin/mv -fh "${args[@]}"
STUB
  fi
  for dump in mariadb-dump mysqldump; do
    cat > "$stubs/$dump" <<'STUB'
#!/usr/bin/env bash
file=""
for arg in "$@"; do [[ "$arg" == --defaults-extra-file=* ]] && file="${arg#--defaults-extra-file=}"; done
echo "$(basename "$0") $*" >> "$STUB_STATE/calls.log"
if [[ -n "$file" ]]; then
  echo "defaults-file=$file" >> "$STUB_STATE/calls.log"
  echo "defaults-mode=$(stat -c '%a' "$file" 2> /dev/null || stat -f '%Lp' "$file")" >> "$STUB_STATE/calls.log"
  echo "defaults-content=$(tr '\n' '|' < "$file")" >> "$STUB_STATE/calls.log"
fi
env | grep -q '^MYSQL_PWD=' && echo "MYSQL_PWD-is-set" >> "$STUB_STATE/calls.log"
[[ -n "${FAIL_DUMP:-}" ]] && exit 2
echo "-- SQL DUMP --"
STUB
  done
  cat > "$stubs/age" <<'STUB'
#!/usr/bin/env bash
echo "age $*" >> "$STUB_STATE/calls.log"
[[ -n "${FAIL_AGE:-}" ]] && { cat > /dev/null; exit 3; }
out=""
while (($#)); do [[ "$1" == "-o" ]] && out="$2"; shift; done
{ printf 'ENC:'; cat; } > "$out"
STUB
  chmod +x "$stubs"/*
}

new_server() {
  work="$(mktemp -d)"
  make_stubs "$work"
  server="$work/server"; web="$work/web"
  mkdir -p "$server/incoming" "$web/releases"
  cp "$root/deploy/deploy.sh" "$server/deploy.sh"
  echo "# stub compose file" > "$server/compose.yml"
  printf 'FOODLOG_SUBNET=203.0.113.0/24\nFOODLOG_PORT=3999\n' > "$server/.env.production"
  export STUB_STATE="$state" PATH="$stubs:$original_path" WEB_ROOT="$web" HEALTH_TIMEOUT=2
  unset FAIL_PULL FAIL_MIGRATE FAIL_DUMP FAIL_AGE
  : > "$state/calls.log"
}

make_tarball() { # make_tarball <version>
  local tmp; tmp="$(mktemp -d)"
  echo "<html>frontend $1</html>" > "$tmp/index.html"
  tar -czf "$server/incoming/foodlog-frontend-v$1.tar.gz" -C "$tmp" .
}

install_previous() { # install_previous <version>
  mkdir -p "$web/releases/$1"
  echo "<html>frontend $1</html>" > "$web/releases/$1/index.html"
  ln -sfn "$web/releases/$1" "$web/current"
  echo "$1" > "$server/.current-version"
  echo "$1" > "$state/running"
}

deploy() { (cd "$server" && ./deploy.sh "$@" > "$work/out.log" 2>&1); }
calls() { cat "$state/calls.log"; }
line_of() { grep -n -- "$1" "$state/calls.log" | head -1 | cut -d: -f1; }
current_target() { basename "$(readlink "$web/current" 2>/dev/null)"; }

echo "# deploy.sh"

new_server; make_tarball 1.0.0
deploy 1.0.0; code=$?
check "first deploy succeeds" test "$code" = 0
check "first deploy switches the frontend" test "$(current_target)" = 1.0.0
check "first deploy serves the new files" grep -q "frontend 1.0.0" "$web/current/index.html"
check "first deploy records the version" test "$(cat "$server/.current-version")" = 1.0.0
check "first deploy removes the uploaded tarball" test ! -e "$server/incoming/foodlog-frontend-v1.0.0.tar.gz"
check "image tag comes from the version" grep -q "pull backend \[version=1.0.0\]" "$state/calls.log"
check "compose gets the env file" grep -q -- "--env-file .env.production -f compose.yml" "$state/calls.log"
check "health check uses the configured port" grep -q "127.0.0.1:3999/api/health" "$state/calls.log"
pull="$(line_of ' pull ')"; migrate="$(line_of 'node dist/db/migrate.js')"; up="$(line_of ' up -d backend')"
check "order is pull, migrate, start" test "$pull" -lt "$migrate" -a "$migrate" -lt "$up"
check "migrations run without starting dependencies" grep -q "run --rm --no-deps backend node dist/db/migrate.js" "$state/calls.log"

new_server; make_tarball 1.0.0
cat >> "$server/.env.production" <<'ENV'
DATABASE_URL=mysql://foodlog:x$(touch "$STUB_STATE/pwned")`touch "$STUB_STATE/pwned2"`;touch "$STUB_STATE/pwned3"@host:3306/foodlog
SMTP_FROM="Foodlog <a@example.test>" > "$STUB_STATE/redirected"
SMTP_PASSWORD=<PLACEHOLDER>
ENV
deploy 1.0.0; code=$?
check "shell syntax in .env.production is not executed" test "$code" = 0 -a ! -e "$state/pwned" -a ! -e "$state/pwned2" -a ! -e "$state/pwned3" -a ! -e "$state/redirected"

new_server; install_previous 1.0.0; make_tarball 1.1.0
deploy 1.1.0; code=$?
check "upgrade succeeds" test "$code" = 0
check "upgrade switches the frontend atomically to the new release" test "$(current_target)" = 1.1.0
check "upgrade keeps the previous release for a manual rollback" test -d "$web/releases/1.0.0"
check "upgrade records the new version" test "$(cat "$server/.current-version")" = 1.1.0

new_server; install_previous 1.0.0; make_tarball 1.1.0
echo 1.1.0 > "$state/unhealthy"
deploy 1.1.0; code=$?
check "unhealthy upgrade fails" test "$code" = 1
check "unhealthy upgrade restores the previous backend" grep -q "up -d backend \[version=1.0.0\]" "$state/calls.log"
check "unhealthy upgrade leaves the frontend untouched" test "$(current_target)" = 1.0.0
check "unhealthy upgrade keeps the recorded version" test "$(cat "$server/.current-version")" = 1.0.0
check "unhealthy upgrade removes the unused new release" test ! -e "$web/releases/1.1.0"
check "unhealthy upgrade says what happened" grep -q "restoring 1.0.0" "$work/out.log"

new_server; make_tarball 1.0.0
echo 1.0.0 > "$state/unhealthy"
deploy 1.0.0; code=$?
check "unhealthy first deploy fails" test "$code" = 1
check "unhealthy first deploy does not switch the frontend" test ! -e "$web/current"
check "unhealthy first deploy explains there is nothing to restore" grep -q "no previous version" "$work/out.log"
check "unhealthy first deploy starts the backend only once" test "$(grep -c ' up -d backend' "$state/calls.log")" = 1

new_server; install_previous 1.0.0; make_tarball 1.1.0
FAIL_MIGRATE=1 deploy 1.1.0; code=$?
check "failed migration aborts" test "$code" != 0
check "failed migration never starts the new backend" test -z "$(grep ' up ' "$state/calls.log")"
check "failed migration keeps frontend and version" test "$(current_target)" = 1.0.0 -a "$(cat "$server/.current-version")" = 1.0.0

new_server; install_previous 1.0.0; make_tarball 1.1.0
FAIL_PULL=1 deploy 1.1.0; code=$?
check "failed pull aborts before any change" test "$code" != 0 -a ! -e "$web/releases/1.1.0" -a -z "$(grep -E ' (run|up) ' "$state/calls.log")"

new_server; install_previous 1.0.0; make_tarball 1.1.0
echo 1 > "$state/failures_left"; HEALTH_TIMEOUT=10 deploy 1.1.0; code=$?
check "health check retries until the backend answers" test "$code" = 0 -a "$(current_target)" = 1.1.0

new_server
deploy 1.0.0; code=$?
check "a missing tarball fails without calling docker" test "$code" = 1 -a ! -s "$state/calls.log"

new_server; make_tarball 1.0.0
for bad in "" "v1.0.0" "1.0" "1.0.0; rm -rf /" "../1.0.0"; do
  deploy "$bad"; code=$?
  check "version '$bad' is rejected" test "$code" = 2 -a ! -s "$state/calls.log"
done

new_server; make_tarball 1.0.0
(cd "$server" && env -u WEB_ROOT ./deploy.sh 1.0.0 > "$work/out.log" 2>&1); code=$?
check "WEB_ROOT is required" test "$code" != 0

new_server; make_tarball 1.0.0; install_previous 1.0.0
echo 1.0.0 > "$state/unhealthy"
deploy 1.0.0; code=$?
check "redeploying the live version never deletes it, even when unhealthy" test -d "$web/releases/1.0.0" -a "$(current_target)" = 1.0.0

new_server; install_previous 1.0.0
for v in 1.1.0 1.2.0 1.3.0; do
  make_tarball "$v"
  KEEP_RELEASES=2 deploy "$v"
done
count="$(find "$web/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
check "old releases are pruned, newest versions stay" test "$count" = 2 -a -d "$web/releases/1.3.0" -a -d "$web/releases/1.2.0" -a ! -e "$web/releases/1.0.0"

echo "# backup.sh"

backup_env() {
  export DB_HOST=db.internal DB_NAME=foodlog DB_USER=backup DB_PASSWORD='s3cret-pass' \
    BACKUP_DIR="$work/backups" AGE_RECIPIENT=age1examplerecipient
}

new_server; backup_env
out="$(bash "$root/deploy/backup.sh" 2> "$work/err.log")"; code=$?
check "backup succeeds and prints the file" test "$code" = 0 -a -f "$out"
check "backup file name is timestamped and encrypted" bash -c "[[ '$out' =~ foodlog-[0-9]{8}T[0-9]{6}Z\.sql\.gz\.age$ ]]"
check "backup content went through age" bash -c "head -c 4 '$out' | grep -q ENC:"
check "backup files are private" test "$(stat -c '%a' "$out" 2>/dev/null || stat -f '%Lp' "$out")" = 600
dump_args="$(grep '^mariadb-dump ' "$state/calls.log")"
check "mariadb-dump is preferred when installed" test -n "$dump_args"
# shellcheck disable=SC2016
check "the password is not on the command line" bash -c '! grep -qE "s3cret|--password" <<< "$1"' _ "$dump_args"
check "the password is not in the environment" test -z "$(grep MYSQL_PWD "$state/calls.log")"
check "the password is in a private option file" grep -q 'defaults-content=\[client\]|password="s3cret-pass"|' "$state/calls.log"
check "the option file is private" grep -q "defaults-mode=600" "$state/calls.log"
check "the option file is removed afterwards" test ! -e "$(grep '^defaults-file=' "$state/calls.log" | head -1 | cut -d= -f2-)"
check "the dump is consistent and without tablespaces" grep -q -- "--single-transaction --routines --no-tablespaces foodlog" "$state/calls.log"
check "the option file comes first" grep -q "^mariadb-dump --defaults-extra-file=" "$state/calls.log"
check "the recipient is passed to age" grep -q "age -r age1examplerecipient" "$state/calls.log"
check "no partial files stay" test -z "$(find "$work/backups" -name '*.partial')"

new_server; backup_env; mkdir -p "$work/backups"
touch -d '2026-01-01' "$work/backups/foodlog-20260101T000000Z.sql.gz.age" 2>/dev/null || touch -t 202601010000 "$work/backups/foodlog-20260101T000000Z.sql.gz.age"
touch "$work/backups/foodlog-recent.sql.gz.age"
touch "$work/backups/unrelated.txt"
touch -t 202601010000 "$work/backups/unrelated.txt"
bash "$root/deploy/backup.sh" > /dev/null 2>&1
check "old backups are pruned" test ! -e "$work/backups/foodlog-20260101T000000Z.sql.gz.age"
check "recent backups and unrelated files stay" test -e "$work/backups/foodlog-recent.sql.gz.age" -a -e "$work/backups/unrelated.txt"

new_server; backup_env; rm "$stubs/mariadb-dump"
bash "$root/deploy/backup.sh" > /dev/null 2>&1; code=$?
check "mysqldump is used when mariadb-dump is missing" test "$code" = 0 -a -n "$(grep '^mysqldump ' "$state/calls.log")"

new_server; backup_env
DB_PASSWORD='p#a"s\s$(touch pwned)' bash "$root/deploy/backup.sh" > /dev/null 2>&1; code=$?
# shellcheck disable=SC2016
check "special characters in the password are escaped for the option file" grep -qF 'defaults-content=[client]|password="p#a\"s\\s$(touch pwned)"|' "$state/calls.log"
check "a password with shell syntax is never executed" test "$code" = 0 -a ! -e pwned

new_server; backup_env
FAIL_DUMP=1 bash "$root/deploy/backup.sh" > /dev/null 2>&1; code=$?
check "a failing dump fails the backup and leaves no file" test "$code" != 0 -a -z "$(find "$work/backups" -type f 2>/dev/null)"
FAIL_AGE=1 bash "$root/deploy/backup.sh" > /dev/null 2>&1; code=$?
check "a failing encryption fails the backup and leaves no file" test "$code" != 0 -a -z "$(find "$work/backups" -type f 2>/dev/null)"

new_server; backup_env
env -u AGE_RECIPIENT bash "$root/deploy/backup.sh" > /dev/null 2>&1; code=$?
check "an unset recipient is refused, so no unencrypted dump is written" test "$code" != 0 -a ! -s "$state/calls.log"

echo
echo "$passed passed, $failures failed"
[[ "$failures" = 0 ]]
