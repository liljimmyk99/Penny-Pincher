# Shared helpers for scripts/web.sh and scripts/mac.sh. Source it; don't run it.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DIR="$ROOT/.local"          # gitignored: built binary, dev database, logs
API_BIN="$LOCAL_DIR/pp-api"
API_PORT="${API_PORT:-8080}"
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

# Builds the Go API into .local/pp-api.
build_api() {
  need go "brew install go"
  mkdir -p "$LOCAL_DIR"
  say "Building the backend"
  (cd "$ROOT/backend" && go build -o "$API_BIN" ./cmd/api)
}

# Sets the API's environment (exported for the child). Sign-in is the app's own
# username and password, so no external service or secret is needed.
api_env() {
  export PORT="$API_PORT" DB_PATH="$LOCAL_DIR/spend.db"
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

# Creates a local admin account for testing, if it doesn't exist yet. These are
# throwaway development credentials for the database in .local/ only. Safe to
# run repeatedly (an existing username is left alone). The API's own CLI reads
# the password from standard input when it isn't a terminal.
DEV_USERNAME="${DEV_USERNAME:-demo}"
DEV_PASSWORD="${DEV_PASSWORD:-demo-password-123}"
ensure_dev_admin() {
  api_env
  if printf '%s\n' "$DEV_PASSWORD" | "$API_BIN" user add --username "$DEV_USERNAME" --role admin >/dev/null 2>&1; then
    say "Created the admin account $DEV_USERNAME"
  fi
  say "Sign in with the username $DEV_USERNAME and the password $DEV_PASSWORD (local test account)"
}
