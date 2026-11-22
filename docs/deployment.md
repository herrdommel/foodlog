# Deployment and operations

This guide covers running Foodlog I/O on your own server. The setup is: the backend runs in Docker, the frontend is a static build served by the nginx of the host, MariaDB runs on the host.

```
Browser --TLS--> nginx (host) --/--> static frontend (releases/<version>, symlink "current")
                           \--/api--> 127.0.0.1:3000 --> backend container --TCP--> MariaDB (host)
```

Nothing in this repository contains server addresses, passwords or personal data. You provide those on the server and in GitHub (see below).

## 1. Prerequisites on the server

- Docker with the compose plugin; the deploy user is in the `docker` group.
- nginx (with Plesk: managed through the subdomain settings) and a TLS certificate for the subdomain.
- MariaDB 12.3.
- Optional but recommended: [age](https://age-encryption.org) for encrypted backups.

Directories (adjust the paths, they are configurable in GitHub):

```sh
sudo mkdir -p /opt/foodlog/incoming /opt/foodlog/legal /var/www/foodlog/releases
sudo chown -R deploy:deploy /opt/foodlog /var/www/foodlog
```

## 2. Database

1. Choose a private Docker subnet that is unused on the server, for example a `/24` inside `172.16.0.0/12`. It becomes `FOODLOG_SUBNET`. The database user is restricted to it, so the backend is the only client that can log in.
2. Copy `deploy/setup-database.sql.example`, replace the placeholders and run it as a MariaDB administrator. The user needs schema rights on the `foodlog` database only (the migrations create and alter tables).
3. MariaDB must listen on an address the container can reach and must **not** be reachable from outside:
   - The container reaches the host through the gateway of its network, which is the first address of `FOODLOG_SUBNET` (for `x.y.z.0/24` that is `x.y.z.1`). Use it as the host in `DATABASE_URL`.
   - Set `bind-address` so MariaDB also listens on that address (or on `0.0.0.0`) and **block port 3306 in the firewall for everything except the Docker subnet**. In Plesk, the setting "Allow remote connections from" for MariaDB only changes user permissions. Whether MariaDB listens on the gateway address is set in the server configuration of MariaDB.
   - The host firewall must allow traffic from `FOODLOG_SUBNET` to port 3306 of the host.
4. Check from the host with `docker run --rm --network <network> mariadb mariadb -h <gateway> -u foodlog -p` after the first compose start, or simply look at the backend log: the migration step fails with a connection error if something is wrong.

> The network path between container and MariaDB depends on your server. I could not test it. If the migration cannot connect, check in this order: user host pattern matches the subnet, `bind-address`, firewall.

## 3. Configuration on the server

Copy `deploy/env.production.example` to `/opt/foodlog/.env.production` (mode `600`) and fill it in:

- `FOODLOG_SUBNET`, `FOODLOG_PORT`, `DATABASE_URL`: see above.
- `API_KEY_ENCRYPTION_KEY`: `openssl rand -base64 32`. **Back it up separately from the database.** Without it the stored AI keys are unreadable and users have to enter them again. To rotate it, put the new key in `API_KEY_ENCRYPTION_KEY`, the old one in `API_KEY_ENCRYPTION_KEY_PREVIOUS`, restart, and ask users to re-save their keys over time (new values are written with the new key).
- SMTP settings for verification and reset mails. The sender must be allowed to send for your domain (SPF/DKIM).
- Optional: Google sign-in. In the Google Cloud console create an OAuth client (web application) with the redirect URI `https://<your-domain>/api/auth/google/callback` and enter client id and secret.

Optional: `OPEN_FOOD_FACTS_URL` (default `https://world.openfoodfacts.org`) for the barcode lookup. The backend needs outgoing HTTPS access to it, and to the AI providers if you enable them. Only the barcode number leaves the server.

The AI mock provider (`AI_MOCK_PROVIDER`) is for development only and the backend refuses to start with it in production.

## 4. Legal pages

Copy the templates from `docs/legal-templates` to `/opt/foodlog/legal`, fill in the placeholders and have them reviewed (see the README in that directory). The directory is mounted read-only into the container and read on every request, so changes need no restart.

## 5. nginx

Use `deploy/nginx.conf.example` as a base. The document root is `/var/www/foodlog/current` (a symlink that the deploy script switches), `/api/` is proxied to `127.0.0.1:<FOODLOG_PORT>`. With Plesk, set the document root of the subdomain and put the `location` blocks and `add_header` lines into "Additional nginx directives".

Two things in the example are deliberate. The security headers (HSTS, CSP, frame and referrer policies) are set once on the server block; do not add `add_header` inside a `location`, because nginx then stops inheriting the server-level headers for that location (use `expires` for caching). And `proxy_read_timeout` (150 s) must stay above the 100 s timeout the backend uses for AI requests, otherwise the browser sees a 504 while the request still runs. `bash deploy/test/nginx.sh` starts nginx with the example and checks the headers on a page, an SPA route, an asset and the API.

The backend trusts `X-Forwarded-For` in production and rate limits by the first entry, so it must only be reachable through nginx, and nginx must **replace** the header with `$remote_addr`. With `$proxy_add_x_forwarded_for` a client could send its own first entry and bypass every rate limit; `deploy/test/nginx.sh` checks this. With Plesk, make sure no other directive appends to the header. The compose file publishes the port on `127.0.0.1` only. Keep it that way.

## 6. GitHub setup

Repository settings:

- Actions: allow GitHub Actions to create pull requests (needed by release-please).
- Security: enable Dependabot alerts, secret scanning with push protection and private vulnerability reporting.
- After the first release is published, set the visibility of the `foodlog-backend` package in ghcr to public so the server can pull it without a token.

Environment `production` (Settings, Environments). Optionally add required reviewers if deployments should need approval.

| Kind     | Name                 | Value                                                                      |
| -------- | -------------------- | -------------------------------------------------------------------------- |
| Secret   | `DEPLOY_SSH_KEY`     | private key of the deploy user (a dedicated key, no passphrase)            |
| Secret   | `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -p <port> <host>` after you checked the fingerprint |
| Variable | `DEPLOY_HOST`        | host name of the server                                                    |
| Variable | `DEPLOY_USER`        | deploy user                                                                |
| Variable | `DEPLOY_PORT`        | SSH port, default `22`                                                     |
| Variable | `DEPLOY_PATH`        | default `/opt/foodlog`                                                     |
| Variable | `WEB_ROOT`           | `/var/www/foodlog` (contains `releases/` and the `current` symlink)        |
| Variable | `APP_URL`            | `https://<your-domain>`, used for the final health check                   |

Repository variable `AUTO_DEPLOY`: set to `false` to stop automatic deployments after a release. Manual deployments stay possible.

**First release.** A newly published ghcr package may start as private. If the first automatic deployment would run before you made it public, it fails at the image check and at the pull on the server. Safest sequence: set the repository variable `AUTO_DEPLOY` to `false`, merge the first release pull request, open the package in GitHub (Packages, `foodlog-backend`, Package settings) and set the visibility to public, start the deployment manually, then delete the variable. Check GitHub's current rules for package visibility if the option is not offered.

Hardening: create a deploy user without sudo, only in the `docker` group, and restrict the key to the server where it is used. The deploy script only runs `docker compose` in `DEPLOY_PATH` and writes to `WEB_ROOT`.

## 7. Release and deployment flow

1. Merge pull requests with Conventional Commit titles (`feat:`, `fix:`, ...).
2. release-please keeps a release pull request open with changelog and version. Merging it creates the tag and the GitHub release.
3. The release workflow builds the multi-arch image (`1.2.3`, `1.2`, `1`, `latest`) and attaches the frontend build to the release.
4. Unless `AUTO_DEPLOY` is `false`, the deploy workflow runs next. It can also be started manually (Actions, Deploy, "Run workflow") with a version, which is also how you roll forward or back to a specific release.

What the deploy script does on the server (`deploy/deploy.sh`):

1. Pull the image of the version.
2. Run the database migrations with the new image (the running backend keeps serving).
3. Start the new backend and wait until `/api/health` answers.
4. Only then switch the `current` symlink to the new frontend (atomic).
5. If the new backend is not healthy within 60 seconds, the previous version is started again and the frontend is not switched.

Old releases are removed, the newest three versions are kept.

**Plesk.** Plesk may require the document root of a subdomain to live inside its subscription directory and can enforce `disable_symlinks if_not_owner`. If the `current` symlink is refused, put `WEB_ROOT` inside the vhost directory and make sure the symlink and its target belong to the same owner. I could not check this against Plesk.

**Migrations are not rolled back.** To keep a rollback possible, migrations must work with the previous version of the code too: add columns and tables first, stop using old columns in one release and drop them in a later one (expand, then contract). To go back after a bad release, deploy the previous version manually. If a migration itself broke data, restore from a backup (section 8).

## 8. First start

On the first deployment the workflow creates the files and starts everything. Then create the first administrator (the password comes from stdin, so it does not end up in the shell history):

```sh
cd /opt/foodlog
export FOODLOG_VERSION=$(cat .current-version)
read -rs -p "Password: " PW; echo
printf '%s' "$PW" | docker compose --env-file .env.production -f compose.yml run --rm -T backend \
  node dist/cli/create-admin.js you@example.com "Your Name"
```

Public registration is off by default. Invite people from the admin area (Administration, Invitations), or switch public registration on in the settings. Invitation links can also be created on the server with `node dist/cli/create-invite.js`.

## 9. Backups

`deploy/backup.sh` writes an encrypted, compressed dump and removes old ones. It uses `mariadb-dump` (or `mysqldump` if that is all that is installed) and gives the password to it through a private temporary option file. Create a database user with read-only rights for it, and generate an age key pair on a different machine (`age-keygen`); only the public key goes to the server.

```sh
DB_HOST=<gateway-or-socket-host> DB_NAME=foodlog DB_USER=<backup-user> DB_PASSWORD=<...> \
BACKUP_DIR=/var/backups/foodlog AGE_RECIPIENT=<age public key> KEEP_DAYS=30 \
  /opt/foodlog/backup.sh
```

Run it daily from cron or a systemd timer, and copy the files off the server. The backup retention is part of your privacy policy: deleted accounts stay in backups until they expire. Test a restore once:

```sh
age -d -i key.txt foodlog-<date>.sql.gz.age | gunzip | mariadb -h <host> -u <user> -p <database>
```

## 10. Retention

The backend removes data it no longer needs once a day (first run one minute after start): expired sessions and links, invited email addresses 7 days after an invitation was used or expired, invitations after 90 days, the administration log after 12 months, failed sign-in counters after a day. You can run it by hand with `docker compose ... run --rm backend node dist/cli/retention.js`. The privacy policy template states these periods; keep both in sync.

## 11. Operations

- Logs: `docker compose --env-file .env.production -f compose.yml logs -f backend` (JSON, rotated). Cookies and authorization headers are redacted.
- Health: `curl http://127.0.0.1:3000/api/health` on the server, `https://<domain>/api/health` from outside.
- Update the base image and dependencies through the Dependabot pull requests; every release is scanned for known vulnerabilities in CI and weekly.
- GDPR requests: users can export and delete their data in the profile. Administrators can deactivate accounts. A request to an administrator can be answered with the same functions.

## 12. What is not verified

These parts are written and tested with stand-ins, but have not run against a real server:

- the network path between the container and MariaDB (section 2),
- the deploy workflow over SSH (the script logic is tested including the rollback; no workflow has ever run on GitHub),
- Plesk specifics: document root, symlinks, the nginx directives,
- `backup.sh` on the real server (the logic is tested with stand-ins),
- live calls to Anthropic and OpenAI,
- the legal texts, which need a review before go-live.
