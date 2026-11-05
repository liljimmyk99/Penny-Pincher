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

## Web app

```bash
cd web
npm ci
npm run dev        # Vite dev server, proxies /v1 and /healthz to localhost:8080
npm run lint && npm run typecheck && npm test
```

`web/.npmrc` sets `legacy-peer-deps` because npm's peer resolver currently crashes on the Vitest 4 peer set.
