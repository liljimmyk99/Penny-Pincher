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
