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
- `@foodlog/shared` is TypeScript source. Once the backend imports it at runtime, it needs a JS build step (Node does not strip types inside `node_modules`, and `pnpm deploy` copies it there). Solve this when the first runtime import is added.
- Backend integration tests will need a MariaDB service in `ci.yml`, and Playwright E2E a compose stack. Add both with the first tests that need them.

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
- [ ] Next: M1 auth, M2 tracking, M3 analysis, M4 AI, M5 admin (incl. public registration switch), M6 GDPR/ops, deploy
