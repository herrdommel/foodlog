# Foodlog I/O

Track what you eat together with stool consistency, symptoms and medication, and find out what you do not tolerate.

Status: early development.

## Development

Requirements: Node.js 26, pnpm 12, Docker.

```sh
pnpm install
cp .env.example .env
docker compose -f compose.dev.yml up -d
pnpm db:migrate
pnpm dev:backend
pnpm dev:frontend
```

The frontend runs on http://localhost:5173 and proxies `/api` to the backend on port 3000. Mailpit (http://localhost:8025) catches all outgoing mail. If those ports are taken (e.g. by a local Mailpit), set `MAILPIT_SMTP_PORT` and `MAILPIT_UI_PORT` in `.env` and point `SMTP_PORT` to the same SMTP port.

Useful commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## License

The source code is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`).

The license covers the code only. The name "Foodlog I/O" and all brand assets (the logos in `frontend/public/brand/`) are excluded: all rights reserved. Forks and derived works must use a different name and logo.

Third-party components keep their own licenses.
