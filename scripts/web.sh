#!/usr/bin/env bash
# Generate and run the web stack: backend API + React front end.
#
#   scripts/web.sh                 native dev: Go API on :8080 + Vite on :5173 (hot reload)
#   scripts/web.sh --docker        the full Docker Compose stack behind Caddy (https://localhost:8443)
#
# Native mode creates a local admin (demo / demo-password-123) in .local/spend.db the
# first time; override with DEV_USERNAME and DEV_PASSWORD. No Tailscale, no external
# service. Ctrl-C stops everything this script started.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODE=native
for arg in "$@"; do
  case "$arg" in
    --docker)   MODE=docker ;;
    -h|--help)  sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option $arg (see --help)" ;;
  esac
done

if [ "$MODE" = docker ]; then
  need docker "Install Docker Desktop."
  [ -f "$ROOT/.env" ] || die ".env is missing: cp .env.example .env (the defaults run the localhost dev stack)."
  say "Building and starting the Docker stack"
  cd "$ROOT" && docker compose up -d --build --wait
  say "Up: https://localhost:8443 (accept Caddy's local certificate). Logs: docker compose logs -f; stop: docker compose down"
  exit 0
fi

need node "brew install node"; need npm; need curl
build_api

cd "$ROOT/web"
if [ ! -d node_modules ]; then say "Installing web dependencies"; npm ci; fi
say "Generating API types from api/openapi.yaml"
npm run --silent gen:api

start_api
ensure_dev_admin
say "Starting Vite: http://localhost:5173 (proxies /v1 to the API)"
npm run dev -- --host localhost
