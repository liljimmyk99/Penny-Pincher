# Running the app locally

Two scripts in `scripts/` build and run the app on your machine: `web.sh` for the API and web app, `mac.sh` for the API and the native macOS app. Both share `scripts/lib.sh`.

Everything they create (the API binary, the dev database, logs and the Mac build) goes in `.local/`, which is gitignored. Delete that folder to start from scratch.

For a ready-made demo account with sample data, see `LOCAL_DEMO.md`. It uses the separate `e2e/` stack.

## Prerequisites

| Needed for | Tool |
|---|---|
| Everything | Go (version in `backend/go.mod`), `curl` |
| Web | Node 23.6 or later (CI uses 24) |
| `--docker`, and the Mac app when it points at the demo stack | Docker Desktop, running |
| Mac | Xcode 26 or later, [Tuist](https://tuist.dev) (`brew install tuist`) |

## Signing in

Sign-in is the app's own username and password, checked by the API. Nothing external is needed: no identity provider, emulator or secret.

When the scripts start a native API, they create a local admin the first time, in `.local/spend.db`:

| Username | Password |
|---|---|
| `demo` | `demo-password-123` |

Set `DEV_USERNAME` and `DEV_PASSWORD` to use other values (the password needs at least 12 characters). An existing username is left alone, so a changed password stays changed.

Add more users from the admin panel's **Users** tab, or with the API's CLI against the same database (it prompts for the password):

```bash
DB_PATH=.local/spend.db .local/pp-api user add --username <name> --role member
```

`user set-password --username <name>` resets a password the same way. The Docker stack (`--docker`) starts with no users; create the first admin as the README's "Signing in" section shows.

## `scripts/web.sh`

```bash
scripts/web.sh              # native dev: API on :8080, Vite on :5173
scripts/web.sh --docker     # full Compose stack behind Caddy
```

**Native mode** (the default):

1. Builds the API to `.local/pp-api`.
2. Installs web dependencies (`npm ci`) if `web/node_modules` is missing.
3. Regenerates `web/src/api/schema.gen.ts` from `api/openapi.yaml`.
4. Starts the API (migrations run on start) and waits for `/healthz`. Its log is `.local/api.log`.
5. Creates the local admin (see "Signing in") if it doesn't exist yet, and prints its sign-in details.
6. Starts Vite at http://localhost:5173. Vite proxies `/v1` and `/healthz` to the API.

Ctrl-C stops Vite and the API.

**Docker mode** runs `docker compose up -d --build --wait` from the repo root, using `.env` and the profile in `COMPOSE_PROFILES` (`dev` by default). Open https://localhost:8443 and accept Caddy's local certificate. The script then exits and leaves the stack running. View logs with `docker compose logs -f` and stop it with `docker compose down`.

## `scripts/mac.sh`

```bash
scripts/mac.sh             # start the backend, generate, build, launch
scripts/mac.sh --no-run    # generate and build only
scripts/mac.sh --open      # generate, then open the Xcode workspace
```

The app's server comes from `PP_SERVER_URL` in `mac/Config/Local.xcconfig` (copy `Local.example.xcconfig`). The script reads it to decide what to start:

| `PP_SERVER_URL` | What the script does |
|---|---|
| `http://localhost:<port>` | Builds and runs the Go API on that port, and creates the local admin (see "Signing in") |
| `https://localhost:18443` | Starts the `e2e/` demo stack (API, web, Caddy). Seed it once with `cd e2e && npm run seed`, then sign in as `demo` / `demo-password-123` (`LOCAL_DEMO.md`) |
| Anything else | Starts no server; the app uses the remote one |

Then it:

1. Runs `tuist generate --no-open` in `mac/`. The generated `.xcodeproj` and `.xcworkspace` are gitignored; never edit them.
2. Builds the `PennyPincher` scheme with `xcodebuild` into `.local/mac-build`, passing `-skipPackagePluginValidation` (the OpenAPI generator plugin) and `-allowProvisioningUpdates` (signing).
3. Launches the app and waits. Closing the app, or pressing Ctrl-C, stops a local API the script started.

The first build is slow because it resolves packages and runs the OpenAPI generator. Building needs a signing team: set `DEVELOPMENT_TEAM` once in `Local.xcconfig` (an empty duplicate line overrides a real one), because the Keychain needs the keychain access group. See `mac/AGENTS.md` ("Running it") for the details.

The app keeps its session token in the Keychain, so it stays signed in across launches until the session expires or you sign out.

## Ports

| Port | What |
|---|---|
| 8080 | Native API (`API_PORT` overrides it; the scripts refuse to start if something already answers there) |
| 5173 | Vite dev server |
| 8080 / 8443 | Docker `dev` profile proxy (HTTP / HTTPS) |
| 18443 | `e2e/` demo stack's web app |

The native API and the Docker `dev` proxy both use 8080 by default. Don't run native mode and `--docker` at once, or set `API_PORT`.

## Troubleshooting

- **"Something already answers on port 8080":** a previous API or the Docker stack is running. Stop it, or run with `API_PORT=8081`.
- **API exits on start:** the script prints the end of `.local/api.log`. Common causes are a failed migration on an old `.local/spend.db` (delete it to start over) or an invalid backup setting in the environment.
- **"Wrong username or password":** check `DEV_USERNAME` / `DEV_PASSWORD`, or reset the password with `DB_PATH=.local/spend.db .local/pp-api user set-password --username demo` (above). If you changed it in the app, the script won't change it back.
- **"Signing for PennyPincher requires a development team":** set `DEVELOPMENT_TEAM` in `mac/Config/Local.xcconfig`, once.
- **Xcode build fails on the plugin:** make sure `-skipPackagePluginValidation` is passed (the script does), or trust the plugin once in Xcode.
- **Reset local data:** delete `.local/spend.db` for the native API, or `cd e2e && npm run stack:down` for the demo stack (this also deletes its data).
