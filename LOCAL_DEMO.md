# Running the app locally with demo data

How to run the whole app on your own machine, with sample data and no real Firebase project. It uses the end-to-end stack in `e2e/`: the same API and web images as production, behind the same Caddy config, with the **Firebase Auth emulator** in place of Firebase. Everything is made up, and it stays on your machine.

It is separate from the dev stack in the root `docker-compose.yml`. It has its own ports, its own database volume and its own compose project (`pp-e2e`), and it never reads `.env` or `secrets/`, so you can run both at once.

## What you need

- Docker Desktop (or Docker Engine with Compose), running
- Node 24 (CI uses 24; 23.6 or later works)
- `e2e` dependencies, once: `cd e2e && npm ci`

## Quick start

```bash
cd e2e
npm run seed
```

The first run builds the images, which takes a few minutes; after that it starts in seconds. It:

1. starts the stack if it isn't running and waits until every service is healthy,
2. creates the demo account and adds it to the allowlist as an **admin**,
3. fills it with sample data (below) and prints how to sign in.

Then open **https://localhost:18443** and sign in with email and password:

| | |
|---|---|
| Email | `demo@example.test` |
| Password | `demo-password-123` |

Your browser will warn about the certificate: Caddy signs `localhost` with its own local certificate authority. Accept the warning for this site.

These credentials only work with this stack's emulator, which runs under a `demo-` project id. The API and the web build accept the emulator only for `demo-` projects, so they can't work against real Firebase. To use others: `SEED_EMAIL=you@example.test SEED_PASSWORD=something npm run seed`.

## What the demo account has

Generic, made-up data from **January of last year to today**, the same on every run:

- **Expenses** (about 25 a month) in every category: rent, utilities that rise in summer and winter, weekly groceries, cafe visits (some with the note "lunch"), fuel, a transit pass, streaming, a card payment, and occasional cinema, books and hardware. December has higher food spending and two gifts. This year's amounts are about 5% higher than last year's, so year-over-year trends have something to show.
- **Saving:** a brokerage and a savings-account transfer every month.
- **Income:** a salary on the 1st and 15th (with a raise this year), freelance income every third month, and a one-off job under "Other" each June. That one has a gross taxable of $0, so it shows no tax rate.
- **Refunds:** in January of this year, a full refund and a partial refund, each linked to one of December's gifts.
- **This month** was started from the **"Typical month"** template, so its bills are not yet confirmed and the banner shows. Day-to-day spending up to today is already entered and confirmed.
- **Saved trends:** "Coffee visits" (one merchant, count), "Food spending" (one category, amount) and "Lunches" (note text, amount).
- **Admin panel:** the account is an admin. Backups aren't set up on this stack, so backup actions are unavailable.

Good places to look: the current month's summary, December and January (gifts and refunds), the yearly view for last year, and Trends.

## Resetting and re-running

- `npm run seed` again does nothing if the demo account already exists. It says so and leaves the data alone.
- To start over: `npm run stack:down` (stops the stack and **deletes its data**), then `npm run seed`.
- `npm run stack:up` starts the stack without seeding, for example after `docker compose` has stopped it. The data stays until `stack:down`.
- After changing backend or web code, rebuild the images with `npm run stack:up` (it runs `--build`) before you look again.

## Addresses

| What | Where |
|---|---|
| Web app (through Caddy) | https://localhost:18443 |
| Auth emulator | http://localhost:19099 |
| API | `https://localhost:18443/v1/…`; its own port isn't published |

Run `docker compose` commands for this stack from the `e2e/` folder, for example `docker compose logs -f api`.

## Signing in as other accounts

### Your own account

Create it in the emulator, then add it to the allowlist with the API's real CLI. From `e2e/`:

```bash
curl -s -X POST 'http://localhost:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key' \
  -H 'content-type: application/json' \
  -d '{"email":"someone@example.test","password":"any-password","returnSecureToken":true}'
```

Copy `localId` from the response, then:

```bash
docker compose exec -T api /api user add --uid <localId> --email someone@example.test --role member
```

Use `--role admin` to see the admin panel. A new account starts the way a real one does: default categories, an "Other" income source and an empty template.

### Accounts left behind by the end-to-end tests

`E2E_KEEP_STACK=1 npm test` (or `E2E_SKIP_STACK=1 npx playwright test` against a running stack) leaves each test's account and data in place. Every test makes its own account with a random password, and each one holds only that test's small set of data. To sign in as one:

1. List the emulator's accounts (the emulator accepts `owner` as an admin token):
   ```bash
   curl -s -X POST http://localhost:19099/identitytoolkit.googleapis.com/v1/projects/demo-penny-pincher/accounts:query \
     -H 'authorization: Bearer owner' -H 'content-type: application/json' -d '{"returnUserInfo":true}'
   ```
2. The emulator doesn't really hash passwords: each account's `passwordHash` ends in `password=…`, and that is the password. Sign in with it and the account's `email`.
3. Or set one you choose. Replace both values:
   ```bash
   curl -s -X POST http://localhost:19099/identitytoolkit.googleapis.com/v1/projects/demo-penny-pincher/accounts:update \
     -H 'authorization: Bearer owner' -H 'content-type: application/json' \
     -d '{"localId":"<localId from step 1>","password":"<new password>"}'
   ```
   `USER_NOT_FOUND` means the `localId` is wrong, or still the `<…>` placeholder.

The tests' accounts are members, so they don't see the admin panel.

## Troubleshooting

- **The certificate warning won't go away, or an embedded browser refuses the site.** That's expected for Caddy's local certificate authority. Use a regular browser and accept the warning. Some embedded browsers, including the Claude desktop app's browser pane, don't let you skip it.
- **"No access" after signing in.** The account is in the emulator but not on the allowlist. Run the `user add` command above.
- **Sign-in fails for an account that worked before.** The stack was recreated (`stack:down`, or the auth container restarted), and the emulator keeps accounts in memory only. Run `npm run seed` again.
- **Ports 18443 or 19099 are in use.** Another copy of the stack is running, perhaps from an `.claude/worktrees/…` checkout. Stop it with `docker compose -p pp-e2e down` (add `-v` to delete its data too).
- **This month is empty and there's no banner.** Months and "today" come from your computer's clock and time zone when you seeded. If the month has changed since, the new month is empty, which is expected; reset and seed again.

## How it works

- `e2e/compose.yml` defines the stack. `e2e/seed/seed.spec.ts` is the seed, run with its own Playwright config (`e2e/playwright.seed.config.ts`), so `npm test` and CI never run it.
- The seed signs up through the emulator, runs `api user add` in the API container, then writes everything through the public API (`e2e/support/stack.ts`), the same way the web app does. It touches no database files directly.
- `e2e/AGENTS.md` has more on the stack and the test suite.
