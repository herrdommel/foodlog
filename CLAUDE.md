# Foodlog I/O

Web app for tracking food, stool consistency (Bristol scale), symptoms and medication to find intolerances. Production: https://foodlog.herrdommel.de. GitHub: `herrdommel/foodlog` (public from the start).

## Working agreements

- This file is the project memory. Keep it current: add decisions, conventions and pitfalls as they come up.
- All files in the repo are written in English.
- No code comments unless explaining a non-obvious why.
- Conventional Commits, tuned for release-please:
  - `feat:` (minor), `fix:` and `perf:` (patch), `feat!:` or a `BREAKING CHANGE:` footer (major).
  - `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `build:` do not trigger a release.
  - Optional scope, e.g. `feat(auth): add google login`. Subject is imperative, lowercase, no trailing period.
  - Prefer squash merges, so the PR title is the commit message and must follow the same format.
  - Commit per logical unit, only when the maintainer asks for it. Never push without being asked.
- No signatures, co-author lines or "generated with" notes in commits, PRs or files.
- The repo is public. Never put secrets, real credentials, hostnames of internal infrastructure, IPs, usernames or server details into any file, commit, issue or PR. Use placeholders and env variables. Server-specific setup lives outside the repo.
- Secrets: never read or print `.env*` or similar files. Maintain only `.env.example` with placeholders. Never touch the server; give the maintainer instructions, SQL or scripts for server setup.
- Open items and the backlog are maintained by the maintainer outside the repo. Do not create a TODO file.

## Stack

- Runtime: Node.js 26 (LTS), pnpm 12 workspaces. Pin via `.nvmrc`, `engines` and `packageManager`.
- pnpm settings live in `pnpm-workspace.yaml` (never create an `.npmrc`). Dependency build scripts need an explicit entry in `allowBuilds` (argon2, esbuild, sharp).
- Backend: TypeScript, Fastify, Drizzle ORM (MariaDB via mysql2), Zod, Argon2, httpOnly cookie sessions.
- Database: MariaDB 12.3 (external to the app, dedicated database and user).
- Frontend: React, Vite, TypeScript, Tailwind, TanStack Query, Recharts, i18n (German and English), dark mode, mobile-first.
- Tests: Vitest (backend and frontend), React Testing Library with MSW, Playwright (E2E incl. axe).
- Monorepo: `backend/`, `frontend/`, `shared/` (Zod schemas and types).

## License

- Code: `AGPL-3.0-or-later` (`LICENSE`, `license` field in every `package.json`). All workspace packages are `"private": true`.
- Name "Foodlog I/O" and `frontend/public/brand/` are excluded from the license (all rights reserved), stated in the README.
- When self-hosting Bricolage Grotesque, ship its `OFL.txt` next to the font files (required by the SIL OFL).
- Only add dependencies with AGPL-compatible licenses (MIT, Apache-2.0, BSD, ISC, OFL).
- Before adding a dependency run `npm view <pkg> deprecated` and check maintenance status. `arctic`/`oslo` are deprecated, do not use them (Google OAuth is implemented with plain `fetch` in `backend/src/lib/google.ts`).

## Branding

- Colors: green `#1F6F54`, cream `#F6F3EC`, coral `#FF8A5B`, dark `#17261F`. Define them as design tokens (Tailwind theme / CSS variables), light and dark theme.
- Logos in `frontend/public/brand/`: `foodlog-icon.svg` (green icon), `foodlog-icon-light.svg` (light icon for dark/green backgrounds).
- Wordmark "Foodlog I/O" is set as HTML text, not part of the SVG: Bricolage Grotesque Bold, "I/O" in coral on dark/green backgrounds and green on light backgrounds. Self-host the font (no Google Fonts requests, privacy).
- Derive a favicon set (ico, 32, 180, 192 px) from the SVG, e.g. with sharp.

## Architecture and deployment

- Backend runs on the server in Docker (Compose), image from `ghcr.io/herrdommel/foodlog-backend`.
- Frontend is a static Vite build served directly by the host Nginx. Nginx proxies `/api` to the backend. Same origin, no CORS.
- The container reaches MariaDB over TCP via the Docker host gateway. The Compose network uses a fixed subnet and the DB user is restricted to it. Host, port and credentials come from env. The DB port must not be exposed publicly.
- SMTP: host and credentials via env. Must be replaceable by an external provider through configuration only.
- Migrations (Drizzle) run during deployment before the new backend starts.

## Decisions

- Registration: invite link only by default. Public registration is part of phase 1 and toggled by an admin setting on the settings page (stored in the DB, default off).
- Email verification on registration and on email change. Password change only via reset link.
- Login: email/password and Google OAuth (authorization code flow). First admin via CLI command or seed.
- Avatars: about 12 generated abstract SVGs or upload (size limit, type check, re-encode with sharp to 256x256 WebP).
- Entry types: meal, drink, symptom, stool, medication/supplement. All on one timeline, timestamp freely selectable and editable later.
- Ingredients: predefined catalog with allergen categories plus free per-user tags. Favorites/templates for fast entry.
- Analysis: correlation of ingredient/category to symptom within a time window, with a minimum number of data points. Always present as a hint, never as a diagnosis. Export as PDF/CSV.
- AI analysis: providers Anthropic and OpenAI, each with the user's own key. Gated by a feature flag.
- Encryption: only users' API keys are encrypted in the app (AES-256-GCM, master key from env, key id per value for rotation). Keys are never returned to the frontend. Other health data is not encrypted at application level; at-rest protection is an operations topic (volume encryption, encrypted backups) and is documented in the deployment docs. This is a deliberate decision, do not change without asking.
- Security: rate limiting and brute-force protection on login, Argon2, CSRF protection, strict input validation. Account deletion and data export for users (GDPR). Privacy policy and imprint pages.
- Timezone per user.

## Feature flags

- Tables: `feature_flags` (key, enabled globally, default for users) and `user_feature_overrides` (user, key, enabled).
- Resolution: globally off means off for everyone (kill switch). Otherwise a user override wins, else the flag default.
- Flags are defined in code (typed registry in `shared/`), rows are created on demand. Unknown keys are rejected.
- Backend: `requireFeature(key)` route guard, returns 403 with code `feature_disabled`. Frontend: flags come with the session/me endpoint, `useFeature(key)` hook hides UI.
- Admin UI: global toggles on the settings page, per-user toggles in user management.
- Initial flags: `ai_analysis`, `google_login`, `data_export`.
- Every new optional feature should ship behind a flag.

## Dev mode

- `docker compose -f compose.dev.yml up` starts MariaDB (same version as production) and Mailpit.
- Backend locally with `tsx watch`, frontend with Vite dev server (proxy to `/api`).
- `pnpm db:seed` creates demo users, an admin, the catalog and sample data.
- Dev mode: Google OAuth can be disabled, AI mock provider so nothing costs money.

## CI/CD (GitHub Actions)

- CI on PR/push: lint, typecheck, tests (incl. integration tests against MariaDB and Playwright E2E), build, Docker build without push.
- Release: release-please (release PR with changelog, tag and GitHub release with notes on merge).
- Images: multi-arch (amd64, arm64) to ghcr.io with tags `1.2.3`, `1.2`, `1`, `latest`. The frontend build is attached to the release as a tarball.
- Dependabot: npm (workspace), Docker, GitHub Actions. Weekly, grouped.
- Deployment via SSH: automatic after a release and manual via `workflow_dispatch` with version selection. Steps: unpack frontend, pull backend image, migrate, compose up, health check, roll back to the previous image on failure. Secrets only in GitHub Environments (never in the repo, never echoed in logs). The ghcr package is public, so no pull token is needed.

## Supply chain and vulnerability management

- Dependabot alerts and security updates enabled, plus version updates (see above).
- CI: `pnpm audit --audit-level=high` fails the build; the same runs weekly on a schedule so new CVEs in unchanged code are noticed.
- CI: Trivy scans the built Docker image (fail on fixed HIGH/CRITICAL) and runs weekly against the latest released image.
- CodeQL (JavaScript/TypeScript) on PRs and weekly. Secret scanning with push protection enabled.
- GitHub Actions pinned by commit SHA (Dependabot keeps them updated), minimal workflow `permissions`, no `pull_request_target` with untrusted code.
- Docker: slim/alpine base image pinned by version and digest, non-root user, read-only filesystem where possible.
- Release images get SBOM and provenance attestations.
- `SECURITY.md` with private vulnerability reporting enabled.

## CI/CD notes

- Workflows: `ci.yml`, `codeql.yml`, `audit.yml` (weekly), `release.yml` (release-please, then image and frontend tarball publish in the same workflow). Deploy workflow is still to do.
- Tags and PRs created with `GITHUB_TOKEN` do not trigger other workflows. That is why publishing lives inside `release.yml`. Consequence: CI does not run on the release-please PR itself; fix later with a GitHub App or PAT if it matters.
- Docker base image is pinned by digest, Dependabot keeps it current.
- `@foodlog/shared` is TypeScript source and a devDependency of the backend. `backend/build.mjs` (esbuild) bundles it into `dist/`, all other dependencies stay external. The frontend consumes it through Vite.
- Backend integration tests run against a real MariaDB (`foodlog_test`, created by `docker/mariadb-init/`, a service container in CI).
- E2E (`e2e/`, Playwright + axe): `pnpm e2e` runs the suite, `pnpm --filter @foodlog/e2e screenshots` writes PNGs to `e2e/screenshots/` (gitignored). Playwright starts its own backend (`backend/test/e2e-server.ts`, port 3100, in-memory mailer, `/__test/*` helpers) and Vite (port 5174) against the `foodlog_test` database, so it needs the dev DB (`docker compose -f compose.dev.yml up -d db`) and must not run at the same time as the backend tests. Chromium is installed once with `pnpm --filter @foodlog/e2e exec playwright install chromium`.
- To check UI changes visually: run the screenshots project and look at the PNGs with the Read tool (light/dark, desktop/mobile, DE/EN). Fix a11y findings instead of weakening the axe check (serious/critical must stay at zero).
- Contrast: use `text-fg/75` or stronger for secondary text, never `text-accent` on `bg-accent/*`.

## Backend notes

- Auth: opaque session tokens (stored as sha256), httpOnly SameSite=Lax cookie `foodlog_session`, 30 days sliding. Mutating requests must carry an `Origin` header equal to `APP_URL` (CSRF protection). Tokens for email verification, reset and email change live in `auth_tokens`, hashed, single use.
- Never reveal whether an email exists (register, forgot password, resend). Login uses a dummy hash for unknown users.
- Google sign-in links to an existing account only because Google verified the email. If the local account was unverified, its password is cleared on linking (prevents pre-registration takeover).
- All timestamps are UTC (`SET time_zone` on every connection).
- Migrations are append-only and use a timestamp prefix (`migrations.prefix: 'timestamp'` in `backend/drizzle.config.ts`, files look like `20261121213212_bent_pandemic.sql`), so parallel branches do not collide on numbers. Never edit or rename a migration that was merged. If two branches both add a migration, `meta/_journal.json` conflicts: keep both entries ordered by `when`. The initial schema was regenerated several times during M1 to M2 while nothing was deployed; that is over.
- CLI: `pnpm admin:create <email> <name>` (password via stdin), `pnpm invite:create [email]`.

## Tracking notes (M2)

- Entries live in one table (`entries`) with nullable type-specific columns (`title`, `symptom_type`, `severity`, `bristol`) and `entry_ingredients` links. Zod schema is a discriminated union in `shared/src/tracking.ts`; `PUT /api/entries/:id` replaces the whole entry, including its type.
- Time handling: the API receives wall-clock strings (`YYYY-MM-DDTHH:mm`) in the user's time zone and stores UTC. Conversions and day ranges live in `shared/src/time.ts` and use Luxon (moment is legacy, do not use it). Entries more than 10 minutes in the future are rejected. `GET /api/entries?date=` returns one local day.
- Catalog: `backend/src/catalog/ingredients.ts` is the source of truth (key, DE, EN, allergens). `syncCatalog` upserts it on every `db:migrate`, so catalog edits ship with a release. Custom tags are rows in `ingredients` with a `user_id`; names are stored in both language columns. Catalog items are read-only for users.
- Allergen assignments are informational hints, not medical advice. Keep wording accordingly in the UI.
- Templates exist for meal, drink and medication.
- `pnpm db:seed` creates `demo@example.com` and `admin@example.com` (passwords printed by the script) with 28 days of sample data that contains a lactose to bloating pattern. It refuses to run in production.
- Rate limits can only be disabled through `AppDeps.disableRateLimit`, used by the E2E server. Never expose that through config.
- Not in M2 yet: UI to rename or delete own tags (API exists), context factors (stress, sleep, cycle).

## Analysis notes (M3)

- `GET /api/analysis` (period, window 3/8/12/24/48 h, outcome, min severity) returns an overview plus suspects. The maths lives in `backend/src/services/analysis.ts` and is covered by unit tests.
- Method: each meal or drink is an exposure. It counts as positive if an outcome event follows within the window. Outcomes are symptoms at or above the minimum severity (optionally one symptom type) or abnormal stool (Bristol 1-2, 6-7). Per ingredient and per allergen the risk ratio of exposed against unexposed meals is computed with a 95 percent interval (continuity correction for zero cells).
- Guard rails: at least 5 exposures and 3 positive exposures, meals whose window is not finished yet are excluded, only ratios above 1 are listed. Confidence is high when the interval lower bound is above 1 with at least 10 exposures and 5 positives, medium when only the bound is above 1, otherwise low.
- Ingredients that were always eaten in exactly the same meals are merged into one row (`alsoWith`), because the data cannot tell them apart. Keep this when changing the logic.
- Always show the "hint, not a diagnosis" disclaimer on analysis and report pages.
- Charts use Recharts (MIT, current). Selects use `SelectField` (separate label), never a label wrapping a select.

## Export notes (M3)

- `GET /api/export/entries.csv?from&to` is gated by `app.requireFeature('data_export')` (global kill switch beats user overrides, 403 `feature_disabled`). The frontend hides the links when `me.features.data_export` is false. Use `requireFeature` for every new optional feature.
- CSV: UTF-8 with BOM, CRLF, columns `local_time,utc_time,type,title,ingredients,allergens,symptom_type,severity,bristol,note`. Text cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading apostrophe (spreadsheet formula injection). Do not write the BOM as a literal character, use `BOM` from `lib/csv.ts` (Prettier turns `\uFEFF` escapes into the invisible character, which ESLint rejects).
- The doctor report is a normal page (`/report`) with print styles, no PDF library. Charts have animations switched off, otherwise they print empty. `page.pdf()` in the E2E test only checks that printing works.
- E2E server helpers (`/__test/*`): `invite`, `mail`, `seed-demo`, `feature`. They exist only in `backend/test/e2e-server.ts`.

## Admin notes (M5)

- Admin routes live in `backend/src/routes/admin-*.ts`, all behind `app.requireAdmin`. Every admin mutation writes a row to `admin_audit` (shown on the settings page). Add `recordAudit` to new admin actions.
- Audit log (`admin_audit`) references people by id only (`actor_id`, `target_user_id`, both `ON DELETE SET NULL`). Names and emails are resolved when the log is read, so they follow changes and disappear with a deleted account. `detail` may only hold non-personal values (setting values, feature keys). Never write email addresses or names into the log.
- Admins cannot demote or deactivate themselves (`cannot_modify_self`), so no admin can remove the last admin through the admin API. The one remaining way to lose the last admin is self-deletion, which `POST /api/me/delete` blocks (`last_admin`).
- Changing a user's email as admin sets it unverified, ends all sessions and mails a verification link to the new address. Deactivating ends all sessions.
- Password help is always a reset link (email, or shown once for the admin to hand over), never a password chosen by the admin.
- Invitation links are only returned at creation (only the hash is stored). Public registration is a setting (`public_registration`, default off). Feature flags: global switch beats per-user override (see "Feature flags").
- E2E: controlled checkboxes (state comes from the server) must be toggled with `click()` plus `toBeChecked()`, not `check()`. Tests that change global settings restore them in `finally`, the E2E database is shared across tests. Dark accent colour is `#4cb38e` (contrast on cards), keep contrast checks green.

## AI analysis notes (M4)

- Gated by the `ai_analysis` flag (default off per user). All `/api/ai/*` routes require it; the page redirects when it is off.
- Providers use the official SDKs (`@anthropic-ai/sdk`, `openai`), never hand-written HTTP. The SDKs get an injectable `fetch`, which is how the adapters are tested. The Anthropic SDK 1.x sends `Authorization: Bearer`, not `x-api-key`. OpenAI uses the Responses API with `store: false` (health data must not be stored at the provider). Models are listed live with the user's key (no hard-coded model lists). `claude-opus-5-5` is only the pre-selected suggestion if the account has it.
- Not enabled on purpose: server-side refusal fallbacks (beta parameter we cannot verify without a live key). A refusal is mapped to `ai_refused`. All provider code is tested against stubbed HTTP only; live calls have never been run.
- Keys: AES-256-GCM (`lib/secret-box.ts`), ciphertext `v1.<keyId>.<iv>.<tag>.<data>`, bound to `userId:provider` as associated data so a copied value is unreadable for another user. Master key from `API_KEY_ENCRYPTION_KEY`; rotate by setting the new key and listing the old one in `API_KEY_ENCRYPTION_KEY_PREVIOUS`. Keys are never returned, only `last4`. Never log keys, prompts or provider error bodies.
- Consent: required before any send, versioned (`AI_CONSENT_VERSION`); bump it when the consent text changes, old consents become void. Withdrawing is always possible.
- The preview and the request are built by the same function (`services/ai/payload.ts`); `payloadHash` (sha256 of system + user message) is returned by both so the UI can show that exactly the previewed data was sent. Notes, email and name are never sent. User text is JSON inside `<data>` tags, the system prompt calls it untrusted; the answer is rendered as plain text only.
- `AI_MOCK_PROVIDER=true` (dev, tests, E2E) replaces both providers; keys `mock-invalid`, `mock-ratelimit`, `mock-refuse`, `mock-down`, `mock-broken` simulate failures. It is refused in production by `loadConfig`.
- Primary button hover uses `bg-brand-hover` (a darker tone). Opacity hovers lower contrast below 4.5:1.

## Privacy and operations notes (M6)

- Registration requires `acceptPrivacy: true` and stores `users.privacy_consent_at`. Google sign-up of a new account needs the `consent=1` query on `/api/auth/google` (cookie), otherwise the callback redirects to `/login?error=consent_required`. Existing accounts sign in with Google without it. Accounts created by the CLI or the seed have no consent date; there is deliberately no forced re-consent flow.
- `POST /api/me/delete` (confirm email, password if set) deletes the user; the foreign keys do the rest (`CASCADE` for personal data, `SET NULL` for audit and invite references). A test reads `information_schema` and fails if any foreign key to `users` is neither, so new tables are covered automatically. Always choose `CASCADE` or `SET NULL` for a new reference to `users`.
- `GET /api/me/export` (JSON, all own data, no secrets) is a GDPR right and is not gated by `data_export` (that flag only controls the CSV export and the report). Keep it ungated. When you add personal data, add it to `services/account-export.ts` and to its test.
- Retention (`services/retention.ts`): auth tokens 7 days after expiry or use, expired sessions, invite emails 7 days after use or expiry, invites 90 days, admin audit 12 months. Runs daily from `server.ts` (first run one minute after start) and via `node dist/cli/retention.js`. Keep the privacy text in `docs/legal-templates` in sync with these numbers.
- Legal pages: the operator provides `privacy.<lang>.md` and `imprint.<lang>.md` in `LEGAL_DIR`; nothing personal lives in this repo. Missing files show "not configured". The frontend renders them with a small safe Markdown renderer (`components/Markdown.tsx`, no HTML, only http, https and mailto links).
- Legal text on the page and in `docs/legal-templates` is a developer draft, not legal advice. It needs a review before go-live.

## Deployment notes

- Guide for operators: `docs/deployment.md` (server, database, nginx, GitHub environment, backups). Keep it in sync with `deploy/*` and the workflows.
- `deploy/compose.yml` runs the image from ghcr with `HOST=0.0.0.0` inside the container (the config default `127.0.0.1` would make it unreachable), publishes the port on `127.0.0.1` only, read-only root filesystem, no capabilities. The Docker subnet comes from `FOODLOG_SUBNET` in the server's `.env.production`; no real addresses live in this repo (documentation ranges like 198.51.100.0/24 appear in CI and tests only).
- Deploy flow (`deploy/deploy.sh`, driven by `.github/workflows/deploy.yml`): pull, migrate, start, wait for health, then switch the frontend symlink; unhealthy means the previous backend is started again and the frontend is not switched. The workflow is reusable: `release.yml` calls it after publishing (unless the repo variable `AUTO_DEPLOY` is `false`) and it can be started manually with a version. The called job declares `environment: production` so environment secrets resolve.
- `deploy/nginx.conf.example` must not use `add_header` in locations (it disables inheritance of the security headers); `deploy/test/nginx.sh` runs a real nginx container and checks this, also in CI. `proxy_read_timeout` (150 s) must stay above the AI provider timeout (100 s, `services/ai/providers.ts`). AI generation requests are never retried (`maxRetries: 0`), a retry could bill the user's key twice.
- `.env.production` is a Docker env file, never source it in a shell; `deploy.sh` only extracts `FOODLOG_PORT`. `backup.sh` passes the DB password through a private option file.
- Migrations must be backward compatible with the previous release (expand first, contract in a later release), because a rollback does not undo them.
- `deploy/test/run.sh` tests `deploy.sh` and `backup.sh` with stand-ins for docker, curl, mysqldump and age, and runs in CI together with ShellCheck. Run it locally with `bash deploy/test/run.sh`; ShellCheck and actionlint are available through their Docker images. Scripts must stay portable to bash 3.2 (no `mapfile`); `mv -T` is GNU only on purpose (the server is Linux), the test emulates it on macOS.
- Checklist when adding configuration: `config.ts`, `test/helpers.ts`, `e2e/playwright.config.ts`, `.env.example`, `deploy/env.production.example`, `docs/deployment.md`. Every new CLI entry point must be listed in `backend/build.mjs`, otherwise it is missing from the image.
- Never verified against a real server: the container to MariaDB path, the SSH deployment, live AI calls.

## Conventions

- TypeScript strict, ESM, no `any`.
- Validate with Zod at every API boundary, schemas in `shared/`.
- API errors are uniform: `{ error: { code, message } }`. UI text comes from i18n, not from the backend.
- Every feature ships with tests: logic as unit tests, API routes as integration tests, core flows as E2E.

## Status

- [x] Brainstorming, decisions above
- [x] CLAUDE.md, git init, logos copied
- [x] Plan agreed
- [x] M0 scaffold (monorepo, backend health + env config, Drizzle setup, frontend shell, dev compose, lint/test setup). Docker, migration and health check verified locally.
- [x] CI workflows, Dockerfile, Dependabot, SECURITY.md (not yet run on GitHub)
- [x] M1 backend (auth, sessions, invites, Google, profile, avatar, email change, feature flag resolution)
- [x] M1 frontend (login, register, verify, forgot/reset, profile with avatar and email change, DE/EN, brand font)
- [x] Playwright E2E + a11y + screenshots, CI job
- [x] M2 tracking (catalog, tags, entries, templates, dashboard, seed)
- [x] M3 ingredients page and analysis (suspects, charts)
- [x] M3 export (CSV, printable report) and feature gate
- [x] M5 admin (users, invitations, settings, feature flags, activity log)
- [x] M4 AI analysis (encrypted keys, consent, preview, mock provider)
- [x] M6 privacy and operations (consent, deletion, export, retention, legal pages, backup)
- [x] Deploy (compose, scripts with tests, deploy workflow, docs)
- [ ] Go-live (maintainer): create the GitHub repo and settings, fill the production environment, set up the server (database, nginx, `.env.production`), provide and review the legal texts, run one real AI call per provider, first release and deployment. See `docs/deployment.md`.
