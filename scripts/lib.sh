# Shared helpers for scripts/web.sh and scripts/mac.sh. Source it; don't run it.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DIR="$ROOT/.local"          # gitignored: built binary, dev database, logs
API_BIN="$LOCAL_DIR/pp-api"
API_PORT="${API_PORT:-8080}"
EMULATOR_PORT=19099               # e2e/compose.yml publishes its Auth emulator here
EMULATOR_PROJECT="demo-penny-pincher"
PIDS=()

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required but not installed. ${2:-}"; }

cleanup() {
  trap - EXIT INT TERM
  for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Reads KEY from the root .env (no sourcing: values may contain odd characters).
env_value() {
  [ -f "$ROOT/.env" ] || return 0
  grep -E "^$1=" "$ROOT/.env" | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

# Starts the Firebase Auth emulator from the e2e stack and waits until healthy.
start_emulator() {
  need docker "Install Docker Desktop for --emulator."
  say "Starting the Firebase Auth emulator (e2e stack, port $EMULATOR_PORT)"
  (cd "$ROOT/e2e" && docker compose up -d --build --wait auth)
}

# Builds the Go API into .local/pp-api.
build_api() {
  need go "brew install go"
  mkdir -p "$LOCAL_DIR"
  say "Building the backend"
  (cd "$ROOT/backend" && go build -o "$API_BIN" ./cmd/api)
}

# Sets the API's environment for AUTH=firebase|emulator (exported for the child).
api_env() {
  export PORT="$API_PORT" DB_PATH="$LOCAL_DIR/spend.db"
  if [ "$AUTH" = emulator ]; then
    export FIREBASE_PROJECT_ID="$EMULATOR_PROJECT" FIREBASE_AUTH_EMULATOR_HOST="localhost:$EMULATOR_PORT"
    unset GOOGLE_APPLICATION_CREDENTIALS
  else
    local pid; pid="${FIREBASE_PROJECT_ID:-$(env_value FIREBASE_PROJECT_ID)}"
    [ -n "$pid" ] || die "FIREBASE_PROJECT_ID is not set in .env (or use --emulator)."
    [ -f "$ROOT/secrets/firebase-sa.json" ] || die "secrets/firebase-sa.json is missing (or use --emulator)."
    export FIREBASE_PROJECT_ID="$pid" GOOGLE_APPLICATION_CREDENTIALS="$ROOT/secrets/firebase-sa.json"
    unset FIREBASE_AUTH_EMULATOR_HOST
  fi
}

# Runs the API in the background (migrations run on start) and waits for /healthz.
start_api() {
  if curl -fsS "http://localhost:$API_PORT/healthz" >/dev/null 2>&1; then
    die "Something already answers on port $API_PORT. Stop it or set API_PORT."
  fi
  api_env
  say "Starting the API on http://localhost:$API_PORT (log: .local/api.log)"
  "$API_BIN" >"$LOCAL_DIR/api.log" 2>&1 &
  API_PID=$!
  PIDS+=("$API_PID")
  for _ in $(seq 1 40); do
    curl -fsS "http://localhost:$API_PORT/healthz" >/dev/null 2>&1 && return 0
    kill -0 "$API_PID" 2>/dev/null || { tail -20 "$LOCAL_DIR/api.log"; die "API exited on start."; }
    sleep 0.5
  done
  tail -20 "$LOCAL_DIR/api.log"; die "API did not become healthy."
}

# Emulator mode: creates (or finds) a test account in the Auth emulator and adds it
# to the API's allowlist as an admin. Test credentials only; they work only against
# the emulator's demo- project. Safe to run repeatedly.
EMU_EMAIL="${EMU_EMAIL:-demo@example.test}"
EMU_PASSWORD="${EMU_PASSWORD:-demo-password-123}"
ensure_emulator_user() {
  local base="http://localhost:$EMULATOR_PORT/identitytoolkit.googleapis.com/v1/accounts" body uid
  body="{\"email\":\"$EMU_EMAIL\",\"password\":\"$EMU_PASSWORD\",\"returnSecureToken\":true}"
  uid="$(curl -fsS -X POST "$base:signUp?key=demo-api-key" -H 'content-type: application/json' -d "$body" 2>/dev/null \
         | sed -n 's/.*"localId": *"\([^"]*\)".*/\1/p')"
  [ -n "$uid" ] || uid="$(curl -fsS -X POST "$base:signInWithPassword?key=demo-api-key" -H 'content-type: application/json' -d "$body" \
         | sed -n 's/.*"localId": *"\([^"]*\)".*/\1/p')"
  [ -n "$uid" ] || die "Could not create or find $EMU_EMAIL in the Auth emulator."
  "$API_BIN" user add --uid "$uid" --email "$EMU_EMAIL" --role admin >/dev/null 2>&1 || true
  say "Sign in with $EMU_EMAIL / $EMU_PASSWORD"
}
