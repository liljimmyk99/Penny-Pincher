# Running the app locally

Two scripts in `scripts/` build and run the app on your machine: `web.sh` for the API and web app, `mac.sh` for the API and the native macOS app. Both share `scripts/lib.sh`.

Everything they create (the API binary, the dev database, logs and the Mac build) goes in `.local/`, which is gitignored. Delete that folder to start from scratch.

For a ready-made demo account with sample data, see `LOCAL_DEMO.md`. It uses the separate `e2e/` stack.

## Prerequisites

| Needed for | Tool |
|---|---|
| Everything | Go (version in `backend/go.mod`), `curl` |
| Web | Node 23.6 or later (CI uses 24) |
| `--docker`, `--emulator`, and the Mac app when it points at the demo stack | Docker Desktop, running |
| Mac | Xcode 26 or later, [Tuist](https://tuist.dev) (`brew install tuist`) |

## Choosing how users sign in

| Mode | When | What it needs |
|---|---|---|
| **Real Firebase** (default) | Your own Firebase project | `FIREBASE_PROJECT_ID` in `.env`, `secrets/firebase-sa.json`, and for web `web/.env.local` (copy `web/.env.example`) |
| **Emulator** (`--emulator`) | Offline development, no secrets | Docker. Uses the Firebase Auth emulator from `e2e/` on port 19099 and the `demo-penny-pincher` project |

The API accepts the emulator only for a `demo-` project id, and refuses to start otherwise (root `AGENTS.md` §10). A user must also exist in the API's users table, because the API is allowlist-only. Create one with the API's CLI:

```bash
.local/pp-api user add --uid <firebase uid> --email <email> --role admin
```

Run that with the same environment variables as the API: `DB_PATH=.local/spend.db`, plus either the emulator variables (`FIREBASE_PROJECT_ID=demo-penny-pincher`, `FIREBASE_AUTH_EMULATOR_HOST=localhost:19099`) or your real project id. In emulator mode, `cd e2e && npm run seed` creates a demo account and allowlists it in the `e2e/` stack.

## `scripts/web.sh`

```bash
scripts/web.sh              # native dev: API on :8080, Vite on :5173
scripts/web.sh --emulator   # same, signing in against the Auth emulator
scripts/web.sh --docker     # full Compose stack behind Caddy
```

**Native mode** (default and `--emulator`):

1. Starts the Auth emulator first, in `--emulator` mode.
2. Builds the API to `.local/pp-api`.
3. Installs web dependencies (`npm ci`) if `web/node_modules` is missing.
4. Regenerates `web/src/api/schema.gen.ts` from `api/openapi.yaml`.
5. Starts the API (migrations run on start) and waits for `/healthz`. Its log is `.local/api.log`.
6. Starts Vite at http://localhost:5173. Vite proxies `/v1` and `/healthz` to the API.

Ctrl-C stops Vite and the API. The emulator container keeps running; stop it with `cd e2e && docker compose stop auth`.

**Docker mode** runs `docker compose up -d --build --wait` from the repo root, using `.env` and the profile in `COMPOSE_PROFILES` (`dev` by default). Open https://localhost:8443 and accept Caddy's local certificate. The script then exits and leaves the stack running. View logs with `docker compose logs -f` and stop it with `docker compose down`.

## `scripts/mac.sh`

```bash
scripts/mac.sh             # start the backend, generate, build, launch
scripts/mac.sh --emulator  # local API against the Auth emulator
scripts/mac.sh --no-run    # generate and build only
scripts/mac.sh --open      # generate, then open the Xcode workspace
```

The app's server comes from `PP_SERVER_URL` in `mac/Config/Local.xcconfig` (copy `Local.example.xcconfig`). The script reads it to decide what to start:

| `PP_SERVER_URL` | What the script does |
|---|---|
| `http://localhost:<port>` | Builds and runs the Go API on that port |
| `https://localhost:18443` | Starts the `e2e/` demo stack (API, web, Auth emulator). Seed it once with `cd e2e && npm run seed` |
| Anything else | Starts no server; the app uses the remote one |

Then it:

1. Runs `tuist generate --no-open` in `mac/`. The generated `.xcodeproj` and `.xcworkspace` are gitignored; never edit them.
2. Builds the `PennyPincher` scheme with `xcodebuild` into `.local/mac-build`, passing `-skipPackagePluginValidation` (the OpenAPI generator plugin) and `-allowProvisioningUpdates` (signing).
3. Launches the app and waits. Closing the app, or pressing Ctrl-C, stops a local API the script started.

The first build is slow because it resolves packages and runs the OpenAPI generator. Building needs a signing team: set `DEVELOPMENT_TEAM` once in `Local.xcconfig` (an empty duplicate line overrides a real one), because Firebase needs the keychain access group. See `mac/AGENTS.md` ("Running it") for the details.

`--emulator` overrides the server and Firebase values in `Local.xcconfig` with command-line build settings (`http://localhost:8080`, the `demo-penny-pincher` project, the emulator on port 19099), so you don't edit that file. It also creates the account `demo@example.test` / `demo-password-123` in the emulator and allowlists it as an admin (override with `EMU_EMAIL` and `EMU_PASSWORD`). Google sign-in is hidden in this mode. These settings apply only to builds the script runs: if you run from Xcode instead, `Local.xcconfig` must hold them.

The emulator keeps accounts in memory, so a restart or reset loses them. If sign-in says "That email and password don't match", run `scripts/mac.sh --emulator` again to recreate the account.

## Ports

| Port | What |
|---|---|
| 8080 | Native API (`API_PORT` overrides it; the scripts refuse to start if something already answers there) |
| 5173 | Vite dev server |
| 8080 / 8443 | Docker `dev` profile proxy (HTTP / HTTPS) |
| 19099 | Auth emulator (the `e2e/` stack) |
| 18443 | `e2e/` demo stack's web app |

The native API and the Docker `dev` proxy both use 8080 by default. Don't run native mode and `--docker` at once, or set `API_PORT`.

## Troubleshooting

- **"Something already answers on port 8080":** a previous API or the Docker stack is running. Stop it, or run with `API_PORT=8081`.
- **API exits on start:** the script prints the end of `.local/api.log`. Common causes are a missing `FIREBASE_PROJECT_ID`, or `FIREBASE_AUTH_EMULATOR_HOST` set with a non-`demo-` project.
- **Signed in but "no access":** the account isn't in the users table. Add it with `pp-api user add` (above), or rerun `scripts/mac.sh --emulator`.
- **"Signing for PennyPincher requires a development team":** set `DEVELOPMENT_TEAM` in `mac/Config/Local.xcconfig`, once.
- **Xcode build fails on the plugin:** make sure `-skipPackagePluginValidation` is passed (the script does), or trust the plugin once in Xcode.
- **Reset local data:** delete `.local/spend.db` for the native API, or `cd e2e && npm run stack:down` for the demo stack (this also deletes its data).
