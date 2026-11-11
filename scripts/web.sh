#!/usr/bin/env bash
# Generate and run the web stack: backend API + React front end.
#
#   scripts/web.sh                 native dev: Go API on :8080 + Vite on :5173 (hot reload)
#   scripts/web.sh --emulator      same, but sign in against the local Firebase Auth emulator
#                                  (no real Firebase project or secrets; needs Docker)
#   scripts/web.sh --docker        the full Docker Compose stack behind Caddy (https://localhost:8443)
#
# Real Firebase mode reads FIREBASE_PROJECT_ID from .env, secrets/firebase-sa.json,
# and web/.env.local. Ctrl-C stops everything this script started.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

AUTH=firebase; MODE=native
for arg in "$@"; do
  case "$arg" in
    --emulator) AUTH=emulator ;;
    --docker)   MODE=docker ;;
    -h|--help)  sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option $arg (see --help)" ;;
  esac
done

if [ "$MODE" = docker ]; then
  need docker "Install Docker Desktop."
  [ -f "$ROOT/.env" ] || die ".env is missing: cp .env.example .env and fill it in."
  say "Building and starting the Docker stack"
  cd "$ROOT" && docker compose up -d --build --wait
  say "Up: https://localhost:8443 (accept Caddy's local certificate). Logs: docker compose logs -f; stop: docker compose down"
  exit 0
fi

need node "brew install node"; need npm; need curl
[ "$AUTH" = emulator ] && start_emulator
build_api

cd "$ROOT/web"
if [ ! -d node_modules ]; then say "Installing web dependencies"; npm ci; fi
say "Generating API types from api/openapi.yaml"
npm run --silent gen:api

if [ "$AUTH" = emulator ]; then
  export VITE_FIREBASE_API_KEY=demo-api-key VITE_FIREBASE_PROJECT_ID="$EMULATOR_PROJECT" \
         VITE_FIREBASE_AUTH_EMULATOR_URL="http://localhost:$EMULATOR_PORT"
else
  [ -f .env.local ] || die "web/.env.local is missing: cp web/.env.example web/.env.local and fill it in (or use --emulator)."
fi

start_api
if [ "$AUTH" = emulator ]; then
  say "Emulator mode: create an account, then allowlist it:"
  echo "    cd e2e && npm run seed        # demo account, see LOCAL_DEMO.md"
  echo "    $API_BIN user add --uid <uid> --email <email> --role admin   (same env as the API)"
fi
say "Starting Vite: http://localhost:5173 (proxies /v1 to the API)"
npm run dev -- --host localhost
