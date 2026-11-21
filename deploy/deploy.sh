#!/usr/bin/env bash
# Deploys a released version on the server. Called by the deploy workflow over SSH.
#
# Usage: WEB_ROOT=/var/www/foodlog ./deploy.sh 1.2.3
# Expects in the directory of this script:
#   compose.yml, .env.production, incoming/foodlog-frontend-v<version>.tar.gz
#
# Order: pull image, migrate, start the new backend, wait until it is healthy, then switch the
# frontend. If the new backend does not become healthy, the previous version is started again.
# Database migrations are not rolled back, so they must stay compatible with the previous
# version (expand first, remove old columns in a later release).
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: deploy.sh <version> (for example 1.2.3)" >&2
  exit 2
fi

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_root="${WEB_ROOT:?WEB_ROOT must point at the directory served by nginx}"
compose_cmd="${DOCKER_COMPOSE:-docker compose}"
keep="${KEEP_RELEASES:-3}"
health_timeout="${HEALTH_TIMEOUT:-60}"

cd "$dir"
tarball="incoming/foodlog-frontend-v${version}.tar.gz"
[[ -f "$tarball" ]] || { echo "missing $tarball" >&2; exit 1; }
[[ -f .env.production ]] || { echo "missing .env.production" >&2; exit 1; }

# The file is a Docker env file, not shell code: read the one value needed instead of sourcing it.
port="$(grep -E '^FOODLOG_PORT=' .env.production | tail -n 1 | cut -d= -f2- || true)"
[[ "$port" =~ ^[0-9]+$ ]] || port=3000

health_url="${HEALTH_URL:-http://127.0.0.1:${port}/api/health}"
previous=""
[[ -f .current-version ]] && previous="$(<.current-version)"

# shellcheck disable=SC2086
compose() { FOODLOG_VERSION="$1" $compose_cmd --env-file .env.production -f compose.yml "${@:2}"; }

wait_healthy() {
  local waited=0
  until curl -fsS --max-time 5 "$health_url" > /dev/null; do
    waited=$((waited + 2))
    if ((waited >= health_timeout)); then return 1; fi
    sleep 2
  done
}

rollback() {
  if [[ "$version" != "$previous" ]]; then
    rm -rf "${web_root:?}/releases/$version"
  fi
  if [[ -n "$previous" ]]; then
    echo "new version is not healthy, restoring $previous" >&2
    compose "$previous" up -d backend || true
    wait_healthy || echo "previous version did not become healthy either" >&2
  else
    echo "new version is not healthy and there is no previous version to restore" >&2
  fi
}

echo "deploying $version (previous: ${previous:-none})"

compose "$version" pull backend
compose "$version" run --rm --no-deps backend node dist/db/migrate.js

mkdir -p "$web_root/releases/$version"
tar -xzf "$tarball" -C "$web_root/releases/$version"

compose "$version" up -d backend
if ! wait_healthy; then
  rollback
  exit 1
fi

ln -sfn "$web_root/releases/$version" "$web_root/current.new"
mv -T "$web_root/current.new" "$web_root/current"
echo "$version" > .current-version

while IFS= read -r old; do
  [[ "$old" == "$version" || "$old" == "$previous" ]] && continue
  rm -rf "${web_root:?}/releases/$old"
done < <(find "$web_root/releases" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort -t. -k1,1nr -k2,2nr -k3,3nr | tail -n +$((keep + 1)))
rm -f "$tarball"
echo "deployed $version"
