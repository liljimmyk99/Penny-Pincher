# Backups and restore runbook

Policy: AGENTS.md §8 and the 2026-11-06 backup decision. Snapshots are SQLite `VACUUM INTO` copies, encrypted with [age](https://age-encryption.org), stored in an S3-compatible bucket. The server holds only the **public** key, so it can never read past backups.

## Quick reference

**Back up now** (manual snapshot, goes to `manual/` in the bucket):

```bash
docker compose exec api /api backup now
```

**Restore** (on a machine with your private key and the downloaded `.sqlite.age` file):

```bash
api backup restore --in <snapshot>.sqlite.age --identity backup-key.txt --out restored.db
```

Then swap `restored.db` in for `spend.db` with the API stopped. Full steps are below.

| Prefix     | When (UTC)                         | Kept     |
|------------|------------------------------------|----------|
| `weekly/`  | Sundays, from 03:00                | last 8   |
| `monthly/` | the 1st, from 03:00                | last 12  |
| `manual/`  | `api backup now` / admin "Back up now" | not pruned |

The API checks every 15 minutes whether a weekly or monthly snapshot is due and decides from the bucket's contents, so a restart never skips or doubles a run. Names look like `weekly/penny-pincher-20261108T030000Z-weekly.sqlite.age`.

## One-time setup

1. Install age (`brew install age`) and, **on your own machine, not the server**, run `age-keygen -o backup-key.txt`. It prints the public key (`age1...`).
2. Store `backup-key.txt` offline (password manager and a second copy). Without it backups cannot be opened; anyone who has it can read every backup.
3. Create a private bucket on your S3-compatible provider (B2, R2, Wasabi, AWS S3) and a key limited to that bucket.
4. In `.env` set `BACKUP_AGE_RECIPIENT` (the public key) and the `BACKUP_S3_*` values (see `.env.example`), then restart the API. The log line "backups are not configured" disappears.
5. Take a first snapshot to check the setup:

```bash
docker compose exec api /api backup now
```

## Restore

Do this on a machine that has the private key. The API container does not need to be involved.

1. Download the snapshot: from the bucket, or (once the admin panel ships) via "Download". It is the encrypted `.sqlite.age` file.
2. Decrypt into a new database file and verify it:

```bash
api backup restore --in penny-pincher-20261108T030000Z-weekly.sqlite.age --identity backup-key.txt --out restored.db
```

   The command refuses to overwrite an existing file, and runs `PRAGMA integrity_check` before reporting success. (Without the `api` binary: `age -d -i backup-key.txt -o restored.db <file>`.)
3. **Replacing production:** stop the API, move the old `spend.db` and its `-wal`/`-shm` files aside, copy `restored.db` in as `spend.db` (on the `api-data` volume, owned by uid 65532), start the API. Migrations run on startup, so a snapshot from an older version is upgraded.
4. **Scratch check (no downtime):** run a throwaway API against the copy: `DB_PATH=./restored.db FIREBASE_PROJECT_ID=... api` and confirm the same data appears.

## Restore drill

Required before v1 ships (AGENTS.md §8). Last done: 2026-11-06, on a scratch directory with a snapshot taken by the backup service (`internal/backup` tests cover the same path in CI):

- Snapshot encrypted and written; `api backup restore` decrypted it, `integrity_check` passed, and the users and categories in the restored file matched the source.
- Restoring over an existing file was refused; a wrong key failed to decrypt.

Repeat against the real bucket after the first deployment (issue #42), and note the date here.
