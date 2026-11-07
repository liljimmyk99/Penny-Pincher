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

To try the app with no real Firebase project and with sample data:

```bash
cd e2e
npm ci
npm run seed
```

Then sign in at `https://localhost:18443` as `demo@example.test` / `demo-password-123`. It runs the end-to-end stack (the same images, with the Firebase Auth emulator) and never touches your dev stack, `.env` or `secrets/`. See **[LOCAL_DEMO.md](LOCAL_DEMO.md)** for what the data contains, resetting, signing in as other accounts, and troubleshooting.

## Firebase credentials

The API needs Google credentials for the Firebase Admin SDK, which reads each account to refuse revoked or disabled users. Create a service account with only the **Firebase Authentication Admin** role (Google Cloud console → IAM & Admin → Service accounts), add a JSON key, and save it as `secrets/firebase-sa.json`. Avoid the Firebase console's default `firebase-adminsdk` key, which can reach every Firebase product (`docs/security.md`, console checklist). Compose mounts it read-only at `/run/secrets/firebase-sa.json` and sets `GOOGLE_APPLICATION_CREDENTIALS`. The `secrets/` folder is git-ignored; never commit the key. The file must exist before `docker compose up`, or Docker creates a directory in its place.

## Firebase sign-in (web)

The web app needs the project's public web config. In the Firebase console (Project settings → General → Your apps), add a Web app if there isn't one and copy its `apiKey` into `FIREBASE_WEB_API_KEY` in `.env`; Compose passes it and `FIREBASE_PROJECT_ID` to the web build. For `npm run dev`, copy `web/.env.example` to `web/.env.local` and fill in the same values.

Also in the console: enable the Google and Email/Password providers (Authentication → Sign-in method), and add your domain under Authentication → Settings → Authorized domains (`localhost` is there by default). Sign-ins are still refused unless the user is in the API's users table.

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
