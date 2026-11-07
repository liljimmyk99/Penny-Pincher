# Security

Policy: AGENTS.md §4 (tenancy), §8 (non-functional requirements) and §10 (decisions). This page lists the security measures in the project, what is still planned, and the risks we accept. Encryption is covered in more depth in `docs/encryption.md`, and backups in `docs/backups.md`.

Last audit: 2026-11-06, a code and configuration review against a widely used list of 100 common web vulnerabilities (scorecard below). It is not a penetration test. The scorecard is updated as M6 issues close (so far: #105, #106, #107, #108). Server and Firebase console settings live outside the repo, so they are checked through the runbooks and checklists, not the code.

Remaining work is tracked in the **M6 · Cyber Security** milestone, which must be done before the first deployment (#42).

## Threat model in one paragraph

Penny Pincher holds personal financial data for a handful of allowlisted users on one self-hosted server. The main threats are:
- someone on the internet reading or changing a user's data
- one user seeing another user's data
- stolen sessions or passwords
- a lost, stolen or snapshotted disk or backup
- financial data leaking into logs or third-party services
- the server being made unavailable or taken over through a vulnerable dependency

The design doesn't try to protect a running, unlocked server from someone who already has root on it (see `docs/encryption.md`).

## Measures in place

### Authentication and access control

| Measure | Where |
|---|---|
| Sign-in is delegated to Firebase Authentication (Google or email and password). The app never sees or stores a password. Firebase handles password hashing, brute-force throttling and reset emails. | `web/src/auth/firebase.ts` |
| Every API request needs a Firebase ID token in the `Authorization: Bearer` header, verified by the Firebase Admin SDK (signature, issuer, audience, expiry). The only exception is `GET /healthz`. | `backend/internal/auth/middleware.go`, `firebase.go` |
| **Revocation (#108):** a token is refused (`401 unauthenticated`) when its Firebase account is disabled or deleted, or its sessions were revoked after the token was issued. Each account is looked up with the service account and cached for 5 minutes, so access stops within 5 minutes. If Firebase can't be reached, a cached account up to an hour old is still used, otherwise the request fails. | `backend/internal/auth/revocation.go`, `firebase.go` |
| **Session lifetime (#108):** a sign-in lasts 30 days, measured from the token's `auth_time` (refreshing the token doesn't extend it). After that the API answers `401 session_expired`, and the web signs out and says "Your session has expired. Please sign in again." | `backend/internal/auth/middleware.go`, `web/src/api/client.ts` |
| **Password policy (#108):** email-and-password accounts need at least 12 characters, set in the Firebase console (see the checklist below). In-app MFA is v2; until then, users with a Google account should turn on its 2-Step Verification and sign in with Google. | Firebase console |
| **Allowlist:** a valid token is not enough. The uid must also exist in the local `users` table, or the API answers `403 not_allowlisted`. Accounts are added only by an admin with the `api user add` CLI, and `api user revoke` signs one out everywhere. There is no sign-up screen. | `backend/internal/auth/middleware.go`, `backend/cmd/api/user.go` |
| **Roles:** `/v1/admin/*` requires the `admin` role, checked on the server. The web hides admin pages from members and shows them "Page not found". A role can only be changed with the CLI, never through the API. | `backend/internal/auth/middleware.go`, `web/src/pages/AdminOnly.tsx` |
| Routes not built yet return `501`, but only after authentication, so unfinished routes are never open. | `backend/internal/http/server.go` |
| The Firebase Auth emulator (unsigned tokens) is accepted only for a `demo-` project id. Otherwise the API refuses to start. | `backend/internal/config/config.go` |
| **No CSRF exposure:** auth is a bearer header, not a cookie, so another site can't make the browser send authenticated requests. No CORS headers are sent, so other origins can't read API responses. | — |
| **No account enumeration in the UI:** a wrong email and a wrong password show the same message, and "Forgot password" never reveals whether an account exists. | `web/src/auth/errors.ts`, `web/src/auth/firebase.ts` |

### Tenancy (one user can't reach another's data)

| Measure | Where |
|---|---|
| Every table has `user_id`, and every query filters on the authenticated user's id, taken from the verified token and never from the request. | `backend/internal/store/*.go` |
| **Composite foreign keys** `(id, user_id)` make it impossible at the database level to point an expense at another user's category, merchant, template or income source. | `backend/migrations/0001_init.sql` |
| Triggers enforce the domain rules (protected "Other", refund links to the same user's positive expense, source deletion rules) even if backend code is wrong. | `backend/migrations/0001_init.sql` |
| Tests check that one user can't see or change another user's records, including through reorder lists that mix in another user's ids. | `backend/internal/http/*_test.go` |

### Input handling and injection

| Measure | Where |
|---|---|
| **SQL injection:** every value is passed as a `?` parameter. Where SQL is built from parts (filters, partial updates), only constant fragments are joined. Table names come from code, never from input. | `backend/internal/store/*.go` |
| Request parsing and types are generated from the OpenAPI spec, so malformed bodies and parameters are rejected with `400` before handlers run, and web and API share one contract. | `api/openapi.yaml`, `backend/internal/api`, `web/src/api/schema.gen.ts` |
| Server-side limits: names ≤ 100 characters, notes ≤ 500, trend text bounded, batches ≤ 200 items, pages ≤ 1000 rows. Pagination cursors are decoded and validated. | `backend/internal/store`, `backend/internal/http/expenses.go` |
| Money is integer cents everywhere. Derived values (refund type, tax rate) are computed, never accepted from clients. | AGENTS.md §5 |
| **No code-execution paths:** the backend doesn't use `os/exec`, server-side templates, XML, `gob` or redirects. JSON is decoded into typed structs only. The server never fetches a URL that came from a user (no SSRF). | `backend/` |
| **XSS:** React escapes all output, and there is no `dangerouslySetInnerHTML`, `eval` or `postMessage`. `localStorage` holds only UI preferences (theme, sidebar, welcome dismissed), never financial data or tokens. The Content-Security-Policy (below) is a second layer if an escaping bug ever lands. | `web/src/` |

### Transport and data at rest

See `docs/encryption.md` for details and the server runbook.

| Measure | Where |
|---|---|
| HTTPS only through Caddy with automatic certificates. HTTP redirects to HTTPS. HSTS for one year (not for `localhost`). | `deploy/Caddyfile` |
| `api` and `web` ports are only `expose`d on Docker's internal network. Only the proxy publishes 80/443. | `docker-compose.yml` |
| Every outbound connection uses TLS (Firebase, backup bucket). Plain HTTP to the bucket is refused outside `demo-` projects. | `backend/internal/config/config.go` |
| The database, Docker's data, `.env` and `secrets/` live on a LUKS2 volume that is unlocked by hand after each reboot. | `docs/encryption.md` |
| Backups are `VACUUM INTO` copies in a memory-only `tmpfs`, encrypted with `age` to a public key before upload. The server can't decrypt its own backups, and admins can download only the encrypted file. | `backend/internal/backup`, `docs/backups.md` |

### Browser security headers

The public proxy adds these to every response, from the web app and the API alike, and checks them in the e2e suite (`e2e/tests/security-headers.spec.ts`).

| Measure | Where |
|---|---|
| **Content-Security-Policy:** `default-src 'self'`. Scripts only from our own files and `https://apis.google.com` (the loader the Firebase Auth popup uses): no inline script, no `eval`. Connections to the API and Firebase Auth's two token hosts. Frames only from the Firebase auth domain. Styles from our CSS and Google Fonts, fonts from Google Fonts. `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. | `deploy/Caddyfile` |
| **No inline code to allow:** the theme script that runs before first paint is a file (`theme-init.js`), not inline. Radix's scroll lock would inject a `<style>` element, so a stand-in adds that CSS as a constructed stylesheet, which the policy doesn't restrict. Neither `script-src` nor `style-src` has `'unsafe-inline'`. | `web/public/theme-init.js`, `web/src/lib/cspStyleSingleton.ts`, `web/vite.config.ts` |
| **Clickjacking:** `frame-ancestors 'none'`, plus `X-Frame-Options: DENY` for older browsers. | `deploy/Caddyfile` |
| **MIME sniffing:** `X-Content-Type-Options: nosniff`. | `deploy/Caddyfile` |
| `Referrer-Policy: strict-origin-when-cross-origin` (no paths or query strings to other sites), `Permissions-Policy` turning off camera, microphone, geolocation and payment, and `Cross-Origin-Opener-Policy: same-origin-allow-popups` (isolates the window but keeps the Google sign-in popup working). | `deploy/Caddyfile` |
| **No caching of financial data:** `Cache-Control: no-store` on every `/v1/*` and `/healthz` response. | `deploy/Caddyfile` |
| The `Server` and `Via` headers, which name Caddy, are removed. | `deploy/Caddyfile` |
| The Firebase Auth emulator's origin is allowed only by the e2e stack (`FIREBASE_AUTH_EMULATOR_URL` in `e2e/compose.yml`). The root `docker-compose.yml` never passes it to the proxy. | `e2e/compose.yml` |

### Request limits and rate limiting (#106)

| Measure | Where |
|---|---|
| **Body caps:** every request body is wrapped in `http.MaxBytesReader`, 1 MB by default and 11 MiB for the import upload (a 10 MB file plus multipart overhead). A `Content-Length` over the cap is refused before the token is checked; a body that runs over while being read is refused too. Both answer `413 request_too_large` (`file_too_large` on the import upload). | `backend/internal/http/limits.go` |
| Caddy caps `/v1/*` bodies at 12 MiB as a backstop, so the API's JSON 413 is what clients normally see. | `deploy/Caddyfile` |
| **Slow clients at the edge:** Caddy times out request headers after 10 s and bodies after 2 min, and closes idle connections after 2 min. It has no write timeout, so long streams keep working. | `deploy/Caddyfile` |
| **Slow clients at the API:** besides `ReadHeaderTimeout`, `ReadTimeout` and `IdleTimeout` are 2 min. There is no server-wide `WriteTimeout`: each response gets a 30 s write deadline through `http.ResponseController`, except the streaming routes (import progress over SSE, backup download, export), which clear both deadlines. | `backend/cmd/api/main.go`, `backend/internal/http/limits.go` |
| **Per-IP rate limit, before the token is verified:** a token bucket of 20 requests a second, burst 40. A flood of bad tokens is refused without verifying them. The client IP is the address Caddy appends to `X-Forwarded-For`; that is trusted only because the API port is never published. | `backend/internal/http/limits.go` |
| **Per-user rate limit, after auth:** 10 requests a second, burst 60, plus 5 in a row then one every 10 s on expensive routes (back up now, import upload, export). One user's burst never affects another. | `backend/internal/http/limits.go` |
| Over a limit, the API answers `429 rate_limited` with `Retry-After` in seconds, and the web shows "Too many requests, try again in a moment". Buckets live in memory (one process) and idle ones are evicted after 10 minutes. | `backend/internal/ratelimit`, `web/src/api/errors.ts` |
| The per-IP and per-user limits can be overridden with `RATE_LIMIT_PER_IP` / `RATE_LIMIT_PER_USER` (`rate/burst`). Production leaves them unset. Only the e2e stack raises them, because all its tests come from one address. | `backend/internal/config`, `e2e/compose.yml` |
| Web queries that get a 429 retry once `Retry-After` has passed, so a page that loads during a burst recovers by itself. Saves are never retried automatically. | `web/src/api/queryClient.ts` |
| Checked in the backend tests and in the e2e suite (`e2e/tests/request-limits.spec.ts`). | — |

### Dependencies and patching (#107)

| Measure | Where |
|---|---|
| **Dependabot** opens weekly update PRs (Mondays) for Go modules, npm packages (`web`, `e2e`), Dockerfile base images, the Caddy image in both compose files, and GitHub Actions. Minor and patch updates are grouped into one PR per ecosystem; majors come one at a time. | `.github/dependabot.yml` |
| **`govulncheck`** fails CI when backend code reaches a known Go vulnerability. Vulnerable modules our code never calls are reported but don't fail the build. | `.github/workflows/ci.yml` (`security` job) |
| **`npm audit --omit=dev --audit-level=high`** fails CI on high or critical advisories in the web app's runtime dependencies. Dev tools never ship, so they don't count. `@grpc/grpc-js` (pulled in by Firebase's Firestore, which we don't use) is overridden to a patched version. | `.github/workflows/ci.yml`, `web/package.json` |
| **Trivy** scans the built `backend` and `web` images (OS packages and the Go binaries inside) and fails on HIGH or CRITICAL findings that have a fix. Accepted findings live in `.trivyignore.yaml`, each scoped to one binary and with an expiry date, so CI fails again if the fix hasn't landed by then. | `.github/workflows/ci.yml`, `.trivyignore.yaml` |
| **No floating image tags:** Caddy is pinned to a minor version (`caddy:2.11`, `caddy:2.11-alpine`), Node to a minor (`node:24.22-alpine`), Go to a minor (`golang:1.27-alpine`), and the distroless runtime image by digest. Dependabot proposes each bump, so a deploy only gets an image version CI has tested. The third-party Trivy action is pinned by commit SHA. | `docker-compose.yml`, `e2e/compose.yml`, `*/Dockerfile`, `.github/workflows/ci.yml` |
| **Secret scanning with push protection** is on for the repository (GitHub settings, not in the repo). A push containing a recognised secret is blocked, and any secret already committed raises an alert. | GitHub → Settings → Code security |

#### Patching

- **Dependabot PRs:** review and merge them weekly once CI is green. Merge a security update (CI's `security` job failing on master, or a Dependabot security alert) within a few days.
- **Redeploy** after merging updates that change what runs: Go modules, web runtime packages, Dockerfiles or the Caddy tag. On the server, in `/srv/pp/app`: `git pull`, then `docker compose build --pull && docker compose up -d` (`--pull` fetches patched base images; the profile comes from `COMPOSE_PROFILES` in `.env`). Updates to tests, dev tools or CI need no redeploy.
- **When a `.trivyignore.yaml` entry expires,** CI fails again. Bump the image if a fixed release exists; otherwise re-check that the finding still doesn't reach us, and extend the date.
- **Server OS:** unattended-upgrades installs security updates daily, with automatic reboots off (`docs/encryption.md`). Once a month, or when a kernel or `libc` update is waiting (`/var/run/reboot-required` exists), SSH in, run `sudo apt update && sudo apt full-upgrade`, reboot, and then run the unlock script from `docs/encryption.md` ("After every reboot"). The app is down until it is unlocked.

### Secrets, logging and errors

| Measure | Where |
|---|---|
| Secrets live in `.env` and `secrets/`, both git-ignored. The Firebase web API key is public by design and grants no data access on its own. | `.gitignore`, `.env.example` |
| Logs are JSON through a **redacting handler** that blanks any attribute whose key looks like money, a merchant, a note, a token or a secret. Handlers log only error *types*, never error text. | `backend/internal/logging` |
| Errors to clients are generic ("Something went wrong.") with stable codes. No stack traces or SQL errors leave the server. | `backend/internal/http/errors.go`, `server.go` |
| Web server state (TanStack Query) is in memory only. Nothing financial is persisted in the browser. | `web/src/api/queryClient.ts` |

### Containers, build and slow clients

| Measure | Where |
|---|---|
| The API image is `distroless/static`, running as the `nonroot` user, with a static Go binary (no shell or package manager). | `backend/Dockerfile` |
| The internal web Caddy has its admin API off, no directory listing, and serves static files only. | `web/Caddyfile` |
| The API server has a 5-second `ReadHeaderTimeout` against slow-header attacks. | `backend/cmd/api/main.go` |
| CI runs vet, tests, lint, type checks, spec lint, the generated-code checks, the end-to-end suite and the vulnerability scans on every PR. GitHub Actions has read-only `contents` permission. | `.github/workflows/ci.yml` |

## Planned: M6 · Cyber Security

| Issue | What it adds | Audit items |
|---|---|---|
| #109 | Read-only containers, dropped capabilities, `no-new-privileges`, resource limits; firewall, SSH and fail2ban runbook | 31, 98, 100 |
| #110 | Auth-failure and admin-action logs, Caddy access logs without query strings, log rotation, alerting, Firebase console checklist | 33, 73, 96 |

When an issue is closed, update its rows in the scorecard below.

**Excel import (M8)** brings file uploads into scope. `.xlsx` files are zipped XML, so the library chosen in #93 must cap the unzipped size and the XML size (for example excelize's `UnzipSizeLimit` and `UnzipXMLSizeLimit`), on top of the 10 MB / 50,000-row limits in AGENTS.md §10. This covers audit items 39 and 65.

### Lock someone out now

Use this when an account is compromised, a device is lost, or someone should no longer have access. Either step stops their API access within 5 minutes (the revocation cache); their data stays in the database.

1. **Block the account:** Firebase console → Authentication → Users → the user's ⋮ menu → **Disable account**. Firebase stops issuing tokens for it, and the API refuses the tokens it already has.
2. **Or sign them out everywhere but keep the account** (a lost device, or right after resetting a compromised password). The console has no button for this, so the API binary does it with the service account, on the server in `/srv/pp/app`:
   ```bash
   docker compose exec api /api user revoke --uid <firebase-uid>
   ```
   Tokens issued before now are refused; signing in again works.
3. Do both for a compromised account: revoke, reset the password in the console, and disable it until the owner has confirmed the new one.
4. Check the API logs for `401`s from that account afterwards (#110 adds security-event logs).

### Firebase console checklist (sign-in)

- **Authentication → Settings → Password policy:** require a minimum length of 12, and enforce it (not just notify).
- **Authentication → Settings → User actions:** "Enable create (sign-up)" off, so accounts are made only by an admin.

## Accepted risks

- **No in-app MFA in v1 (item 21).** A reused or phished password still gives access to that user's data. The 12-character password policy and Google sign-in with 2-Step Verification reduce the risk; in-app TOTP is v2 (AGENTS.md §10).

- **DDoS (item 61).** One server with no CDN. A large network flood will take the app down. At this scale that is acceptable, and the data stays safe.
- **`/healthz` is public** and shows the version and uptime, because the admin status and container health checks read it (AGENTS.md §6.12). It shows no data.
- **CVE-2026-78661 in Caddy's bundled `golang.org/x/net/html`** (a denial of service on crafted HTML). Caddy 2.11.9, the latest release, still bundles the affected version. Our Caddy serves static files and proxies requests; it never parses HTML, so the code isn't reached. Ignored in `.trivyignore.yaml` until 2026-12-07, then re-checked.
- **A running, unlocked server** is not protected from someone with root, or from a VPS provider reading memory (`docs/encryption.md`).

## Audit scorecard (2026-11-06)

✅ guarded · ⚠️ partly guarded · ❌ not guarded · — doesn't apply.

**Totals: 74 ✅ · 5 ⚠️ · 1 ❌ · 20 —.** Of the 80 that apply, 93% are fully guarded (70% at the audit; #105 closed 8 items, #106 closed 5, #107 closed 2 and #108 closed 3). M6 targets every remaining ⚠️ and ❌ except items 21 and 61 (accepted risks).

| # | Item | Status | Notes / issue |
|---|---|---|---|
| **Injection** ||||
| 1 | SQL injection | ✅ | Parameterized queries only |
| 2 | Cross-site scripting | ✅ | React escaping, plus a strict CSP (#105) |
| 3 | CSRF | ✅ | Bearer header, no cookies |
| 4 | Remote code execution | ✅ | No exec, templates or dynamic code; distroless image |
| 5 | Command injection | ✅ | No `os/exec` |
| 6 | XML injection | — | No XML (see M8 note) |
| 7 | LDAP injection | — | |
| 8 | XPath injection | — | |
| 9 | HTML injection | ✅ | React escaping |
| 10 | SSI injection | — | Caddy `templates` not used |
| 11 | OS command injection | ✅ | No `os/exec` |
| 12 | Blind SQL injection | ✅ | Parameterized queries only |
| 13 | Server-side template injection | — | No server templates |
| **Authentication and sessions** ||||
| 14 | Session fixation | ✅ | Firebase-issued tokens, no server sessions |
| 15 | Brute force | ✅ | Firebase throttling, plus per-IP API rate limits (#106) |
| 16 | Session hijacking | ✅ | HTTPS/HSTS and CSP, revocation within 5 minutes, 30-day sessions (#108) |
| 17 | Password cracking | ✅ | Firebase hashing |
| 18 | Weak password storage | ✅ | No passwords stored by the app |
| 19 | Insecure authentication | ✅ | Token on every request + allowlist |
| 20 | Cookie theft | ✅ | No auth cookies |
| 21 | Credential reuse | ⚠️ | 12-character password policy (#108); MFA is v2, an accepted risk |
| **Sensitive data exposure** ||||
| 22 | Inadequate encryption | ✅ | TLS, LUKS, `age` |
| 23 | IDOR | ✅ | `user_id` scoping + composite FKs + tests |
| 24 | Data leakage | ✅ | Redacting logger, generic errors |
| 25 | Unencrypted data storage | ✅ | LUKS, `tmpfs` for snapshots |
| 26 | Missing security headers | ✅ | CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP (#105) |
| 27 | Insecure file handling | ✅ | Backup ids mapped to known keys only |
| **Security misconfiguration** ||||
| 28 | Default passwords | ✅ | None exist |
| 29 | Directory listing | ✅ | Not enabled |
| 30 | Unprotected API endpoints | ✅ | Auth middleware wraps every route |
| 31 | Open ports and services | ✅ | Only 80/443 published. Host firewall in #109 |
| 32 | Improper access controls | ✅ | Server-side role check |
| 33 | Information disclosure | ⚠️ | Version on `/healthz` (accepted), no audit log (#110). `Server`/`Via` removed (#105) |
| 34 | Unpatched software | ✅ | Dependabot, `govulncheck`, `npm audit` and Trivy in CI; pinned image tags (#107) |
| 35 | Misconfigured CORS | ✅ | No CORS headers sent |
| 36 | Security headers misconfiguration | ✅ | One policy for every response, checked in e2e (#105) |
| **XML** ||||
| 37 | XXE | — | No XML. Go's parser doesn't load external entities |
| 38 | XML entity expansion | — | See M8 note |
| 39 | XML bomb | — | See M8 note |
| **Broken access control** ||||
| 40 | Inadequate authorization | ✅ | |
| 41 | Privilege escalation | ✅ | Roles set only by the CLI |
| 42 | IDOR (repeat) | ✅ | |
| 43 | Forceful browsing | ✅ | API enforces; web shows "Page not found" |
| 44 | Missing function-level access control | ✅ | `/v1/admin/*` checked in middleware |
| **Insecure deserialization** ||||
| 45 | RCE via deserialization | ✅ | JSON into typed structs only |
| 46 | Data tampering | ✅ | Server validates; derived values computed |
| 47 | Object injection | ✅ | |
| **API security** ||||
| 48 | Insecure API endpoints | ✅ | |
| 49 | API key exposure | ✅ | Secrets git-ignored. Web key public by design (restrict in #110) |
| 50 | Lack of rate limiting | ✅ | Per-IP and per-user token buckets, tighter on expensive routes (#106) |
| 51 | Inadequate input validation | ✅ | Spec-generated parsing + server limits |
| **Insecure communication** ||||
| 52 | Man-in-the-middle | ✅ | TLS + HSTS |
| 53 | Insufficient transport security | ✅ | |
| 54 | Insecure TLS configuration | ✅ | Caddy's modern defaults |
| 55 | Insecure protocols | ✅ | Plain HTTP redirected or refused |
| **Client-side** ||||
| 56 | DOM-based XSS | ✅ | No `innerHTML`/`eval` |
| 57 | Insecure cross-origin communication | ✅ | No `postMessage` |
| 58 | Browser cache poisoning | ✅ | No reflected headers. API responses `no-store` (#105) |
| 59 | Clickjacking | ✅ | `frame-ancestors 'none'` + `X-Frame-Options: DENY` (#105) |
| 60 | HTML5 security issues | ✅ | Storage holds UI preferences only |
| **Denial of service** ||||
| 61 | DDoS | ❌ | Accepted risk |
| 62 | Application-layer DoS | ✅ | Rate limits, body caps and timeouts (#106) |
| 63 | Resource exhaustion | ✅ | Body caps in the API and Caddy (#106) |
| 64 | Slowloris | ✅ | Header, body and idle timeouts in Caddy and the API (#106) |
| 65 | XML denial of service | — | See M8 note |
| **Other** ||||
| 66 | SSRF | ✅ | Outbound hosts come from config only |
| 67 | HTTP parameter pollution | ✅ | Generated typed parameter binding |
| 68 | Open redirects | ✅ | No redirects from input |
| 69 | File inclusion | ✅ | Migrations embedded; static root only |
| 70 | Security header bypass | ✅ | Set by the proxy after the upstreams, on every response (#105) |
| 71 | Clickjacking (repeat) | ✅ | See 59 |
| 72 | Inadequate session timeout | ✅ | 30 days from sign-in, enforced by the API (#108); idle sign-out is v2 |
| 73 | Insufficient logging and monitoring | ⚠️ | #110 |
| 74 | Business logic | ✅ | Triggers + transactions + tests |
| 75 | API abuse | ✅ | Allowlist plus per-user rate limits (#106) |
| **Mobile** ||||
| 76 | Insecure data storage on mobile | — | No mobile app (Mac app not built yet) |
| 77 | Insecure data transmission on mobile | — | |
| 78 | Insecure mobile API endpoints | ✅ | Same API and checks |
| 79 | Mobile app reverse engineering | — | No secrets in clients |
| **IoT and Web of Things** ||||
| 80–84 | IoT device management, weak IoT auth, IoT device bugs, smart-home access, IoT data privacy | — | |
| **Authentication bypass** ||||
| 85 | Insecure "remember me" | ✅ | Sessions end 30 days after sign-in and can be revoked (#108) |
| 86 | CAPTCHA bypass | — | No public sign-up |
| **SSRF** ||||
| 87 | Blind SSRF | ✅ | |
| 88 | Time-based blind SSRF | ✅ | |
| **Content spoofing** ||||
| 89 | MIME sniffing | ✅ | `X-Content-Type-Options: nosniff` (#105) |
| 90 | X-Content-Type-Options bypass | ✅ | On every response, correct content types (#105) |
| 91 | CSP bypass | ✅ | No `'unsafe-inline'`, `'unsafe-eval'` or wildcards; `object-src 'none'`, `base-uri 'self'` (#105) |
| **Business logic flaws** ||||
| 92 | Inconsistent validation | ✅ | One spec; DB triggers back up the backend |
| 93 | Race conditions | ✅ | SQLite transactions, unique constraints, backup lock |
| 94 | Order processing | — | |
| 95 | Price manipulation | — | |
| 96 | Account enumeration | ✅ | UI and reset hide it. Console setting checked in #110 |
| 97 | User-based flaws | ✅ | |
| **Zero-day** ||||
| 98 | Unknown vulnerabilities | ⚠️ | Hardening in #109 |
| 99 | Unpatched vulnerabilities | ✅ | Scanning in CI, weekly updates and a patching routine (#107) |
| 100 | Day-zero exploits | ⚠️ | #109 |
