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

To try the app with no real Firebase project, use the end-to-end stack in `e2e/`. It runs the same API and web images behind Caddy, with the **Firebase Auth emulator** in place of Firebase and an empty database on its own volume. It never touches your dev stack, `.env` or `secrets/`.

```bash
cd e2e
npm ci
npm run stack:up       # builds and starts the stack, waits until healthy
```

- Web app: `https://localhost:18443` (accept the browser's certificate warning for Caddy's internal CA).
- Auth emulator: `http://localhost:19099`.
- `npm run stack:down` stops it and **deletes its data** (the volume).

The database starts empty and sign-in is allowlisted, so create a test user: add an account to the emulator, then allow it in the API with the real CLI (`user add`; `--role admin` for the admin panel).

```bash
curl -s -X POST 'http://localhost:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key' \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.test","password":"demo-password-1","returnSecureToken":true}'
# copy "localId" from the response, then:
docker compose exec -T api /api user add --uid <localId> --email demo@example.test --role admin
```

Run that `docker compose exec` from `e2e/` (project `pp-e2e`). Then sign in at the web address with that email and password. Add entries in the app, or post them through the API (see `e2e/support/stack.ts` for a small client that arranges data). The emulator is honoured only for `demo-` project ids, so this can't be switched on in production by accident.
## Firebase credentials

The API needs Google credentials to initialize the Firebase Admin SDK. Download a service account key (Firebase console → Project settings → Service accounts → Generate new private key) and save it as `secrets/firebase-sa.json`. Compose mounts it read-only at `/run/secrets/firebase-sa.json` and sets `GOOGLE_APPLICATION_CREDENTIALS`. The `secrets/` folder is git-ignored; never commit the key. The file must exist before `docker compose up`, or Docker creates a directory in its place.

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

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `master`:

- backend: `go vet ./...`, `go test ./...`, and `make check-generate`
- web: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run check:api`
- api: Redocly lint (`recommended-strict`, so warnings fail too)
- Docker builds of the `backend` and `web` images (not pushed)
