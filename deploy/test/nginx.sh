#!/usr/bin/env bash
# Starts nginx with deploy/nginx.conf.example (without TLS) and checks the response headers.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
name="foodlog-nginx-test-$$"
port="${NGINX_TEST_PORT:-18080}"
failures=0

cleanup() { docker rm -f "$name" > /dev/null 2>&1; rm -rf "$work"; }
trap cleanup EXIT

mkdir -p "$work/site/assets"
echo '<html>app</html>' > "$work/site/index.html"
echo 'console.log(1)' > "$work/site/assets/app.js"

sed -e 's/listen 443 ssl;/listen 80;/' -e '/http2 on;/d' -e 's#/var/www/foodlog/current#/site#' \
  -e '/^server {$/,$!b' "${NGINX_CONF:-$root/deploy/nginx.conf.example}" \
  | awk 'BEGIN{n=0} /^server \{/{n++} n<2{print}' > "$work/default.conf"

docker run -d --name "$name" -p "127.0.0.1:$port:80" \
  -v "$work/default.conf:/etc/nginx/conf.d/default.conf:ro" -v "$work/site:/site:ro" \
  nginx:stable-alpine > /dev/null || { echo "could not start nginx"; exit 1; }

for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "http://127.0.0.1:$port/" 2> /dev/null && break
  sleep 0.5
done

expect_header() { # expect_header <url path> <header regex>
  local headers
  headers="$(curl -sI "http://127.0.0.1:$port$1")"
  if grep -qiE "$2" <<< "$headers"; then echo "ok - $1 has $2"; else echo "not ok - $1 misses $2"; failures=$((failures + 1)); fi
}

for path in / /profile /index.html /assets/app.js /api/health; do
  for header in '^strict-transport-security:' '^content-security-policy: default-src' '^x-frame-options: DENY' '^x-content-type-options: nosniff' '^referrer-policy:' '^permissions-policy:'; do
    expect_header "$path" "$header"
  done
done
expect_header /assets/app.js '^cache-control: max-age=31536000'
expect_header /index.html '^cache-control: no-cache'
expect_header /profile '^cache-control: no-cache'

status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/profile")"
if [[ "$status" = 200 ]]; then echo "ok - SPA routes fall back to index.html"; else echo "not ok - /profile returned $status"; failures=$((failures + 1)); fi
status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/assets/missing.js")"
if [[ "$status" = 404 ]]; then echo "ok - missing assets are a 404, not the app"; else echo "not ok - missing asset returned $status"; failures=$((failures + 1)); fi

echo "$failures failed"
[[ "$failures" = 0 ]]
