# Spend Tracker

See `AGENTS.md` for requirements and scope.

## Running the stack

Requires Docker with Compose v2.

```bash
cp .env.example .env
docker compose up
```

- **Local dev** (`COMPOSE_PROFILES=dev`, the default in `.env.example`): the proxy serves `https://localhost:8443` using Caddy's internal CA. Your browser will warn until you trust it (`docker compose exec proxy-dev caddy trust`, or use `curl -k`).
  ```bash
  curl -k https://localhost:8443/healthz
  ```
- **Production** (`COMPOSE_PROFILES=prod`): set `DOMAIN` and `ACME_EMAIL` in `.env`, point DNS at the server, and open ports 80/443. Caddy obtains and renews certificates automatically.

The SQLite file lives on the `api-data` volume; certificates on `caddy-data`/`caddy-dev-data`. The `api` service is built from `backend/`. The `web` service is built from `web/` (static files served by Caddy); the proxy sends `/v1/*` and `/healthz` to the API and everything else to the web app.

## Running locally without the live service

To try the app on your own machine with sample data:

```bash
cd e2e
npm ci
npm run seed
```

Then sign in at `https://localhost:18443` as `demo` / `demo-password-123`. It runs the end-to-end stack (the same images and Caddy config as production) and never touches your dev stack, `.env` or `secrets/`. See **[LOCAL_DEMO.md](LOCAL_DEMO.md)** for what the data contains, resetting, signing in as other accounts, and troubleshooting.

## Signing in

Sign-in is the app's own username and password; there is no external identity provider and no secret to set up. There is no sign-up either: create the first admin with the API's CLI once the stack is up.

```bash
docker compose exec api /api user add --username <you> --role admin
```

It prompts twice for a password (at least 12 characters, not echoed). Then sign in at `https://localhost:8443` (or your domain). Add everyone else from the admin panel's **Users** tab, which sets their initial password. A forgotten password is reset there (**Reset password**) or with `docker compose exec api /api user set-password --username <name>`.

- Upgrading a server that used Firebase sign-in: follow the one-time [migration runbook](docs/security.md#moving-from-firebase-to-passwords-one-time).
- Serving it on a tailnet-only host: [docs/tailscale.md](docs/tailscale.md).
- Running the API and web app natively for development (it creates a local `demo` admin for you): [docs/running-locally.md](docs/running-locally.md).

## Web app

```bash
cd web
npm ci
npm run dev        # Vite dev server, proxies /v1 and /healthz to localhost:8080
npm run lint && npm run typecheck && npm test
```

`web/.npmrc` sets `legacy-peer-deps` because npm's peer resolver currently crashes on the Vitest 4 peer set.

## Backups

Encrypted snapshots go to an S3-compatible bucket. Take one now with `docker compose exec api /api backup now`; restore with `api backup restore --in <file> --identity <key> --out restored.db`. Setup and the full restore runbook: [docs/backups.md](docs/backups.md).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `master`:

- backend: `go vet ./...`, `go test ./...`, and `make check-generate`
- web: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run check:api`
- api: Redocly lint (`recommended-strict`, so warnings fail too)
- Docker builds of the `backend` and `web` images (not pushed)
