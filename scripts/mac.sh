#!/usr/bin/env bash
# Generate and run the backend and the native macOS app.
#
#   scripts/mac.sh                 build + start the local API (if the app points at localhost),
#                                  generate the Xcode project with Tuist, build and launch the app
#   scripts/mac.sh --no-run        generate and build only
#   scripts/mac.sh --open          open the Xcode workspace instead of building
#
# The app's server comes from PP_SERVER_URL in mac/Config/Local.xcconfig:
#   http://localhost:<port>   -> builds and runs the Go API natively
#   https://localhost:18443   -> starts the Docker e2e demo stack (LOCAL_DEMO.md)
#   anything else             -> no local server is started
# Closing the app (or Ctrl-C) stops the local API.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

RUN=1; OPEN=0
for arg in "$@"; do
  case "$arg" in
    --no-run)   RUN=0 ;;
    --open)     OPEN=1 ;;
    -h|--help)  sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option $arg (see --help)" ;;
  esac
done

need tuist "brew install tuist (or mise install in mac/)"; need xcodebuild "Install Xcode 26+."; need curl
XCCONFIG="$ROOT/mac/Config/Local.xcconfig"
[ -f "$XCCONFIG" ] || die "mac/Config/Local.xcconfig is missing: copy Local.example.xcconfig and fill it in."
SERVER="$(grep -E '^PP_SERVER_URL' "$XCCONFIG" | tail -1 | cut -d= -f2- | tr -d ' ' | sed 's/\$()//g')"
[ -n "$SERVER" ] || die "PP_SERVER_URL is not set in mac/Config/Local.xcconfig."

if [[ "$SERVER" == http://localhost* || "$SERVER" == http://127.0.0.1* ]]; then
  API_PORT="$(echo "$SERVER" | sed -E 's#.*:([0-9]+).*#\1#')"
  build_api
  start_api
  ensure_dev_admin
elif [[ "$SERVER" == https://localhost:18443* ]]; then
  need docker "Install Docker Desktop."
  say "App points at the e2e demo stack; starting it (API + web + Caddy)"
  (cd "$ROOT/e2e" && docker compose up -d --build --wait)
  say "Seed demo data once with: cd e2e && npm run seed  (see LOCAL_DEMO.md)"
else
  say "App points at $SERVER; not starting a local API"
fi

say "Generating the Xcode project (tuist generate)"
cd "$ROOT/mac"
tuist generate --no-open
if [ "$OPEN" = 1 ]; then open PennyPincher.xcworkspace; exit 0; fi

say "Building PennyPincher (first build resolves packages and runs the OpenAPI generator)"
xcodebuild build -workspace PennyPincher.xcworkspace -scheme PennyPincher \
  -destination 'platform=macOS' -derivedDataPath "$LOCAL_DIR/mac-build" \
  -skipPackagePluginValidation -allowProvisioningUpdates -quiet
[ "$RUN" = 1 ] || { say "Built: $LOCAL_DIR/mac-build/Build/Products/Debug/PennyPincher.app"; exit 0; }

say "Launching the app (close it or press Ctrl-C to stop the API)"
open -W -n "$LOCAL_DIR/mac-build/Build/Products/Debug/PennyPincher.app"
