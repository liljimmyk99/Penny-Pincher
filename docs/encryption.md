# Encryption at rest and in transit

Policy: AGENTS.md §8 and the 2026-11-06 encryption decision. Do the server setup below **before** the first deployment (issue #42).

## What is covered

**In transit**

| Hop | How |
|---|---|
| Browser / Mac app → Caddy | HTTPS with a Let's Encrypt certificate. Plain HTTP is redirected to HTTPS, and HSTS (`max-age` one year) stops browsers from trying HTTP again. |
| Caddy → `api` / `web` containers | Plain HTTP on Docker's internal network, inside the same host. Those ports are `expose`d only, never published. |
| API → Firebase (token checks) | HTTPS (Firebase Admin SDK). |
| API → backup bucket | HTTPS. The API refuses `BACKUP_S3_INSECURE=1` unless the project is a `demo-` one. Snapshots are also `age`-encrypted before upload. |
| Backup download from the admin panel | HTTPS, and the file is still `age`-encrypted. |

**At rest**

| Data | How |
|---|---|
| SQLite database, `-wal` / `-shm` files | Encrypted LUKS volume (below). |
| Docker's everything else: container layers, logs, Caddy's TLS keys | The same LUKS volume (Docker's `data-root` lives on it). |
| `.env`, `secrets/firebase-sa.json` | The same LUKS volume (the repo checkout lives on it). |
| Plaintext snapshot during a backup | `tmpfs` (memory only) at the API's `/tmp`, so it never touches disk. |
| Off-server backups | `age`-encrypted to a public key; see `docs/backups.md`. |

**What this protects, and what it doesn't.** LUKS protects the data when the server is off or the volume is detached: a stolen or discarded disk, a provider's disk snapshot, a volume moved to another machine. It does not protect a running, unlocked server from someone with root access, or (on a VPS) from the provider reading the VM's memory. Nothing does: the API needs the plaintext to work.

## One-time server setup (Linux)

Written for Debian or Ubuntu; other distributions differ only in package names. Run as a user with `sudo`. Do the server hardening in `docs/security.md` (non-root sudo user, key-only SSH, firewall, fail2ban, unattended upgrades) first or alongside. Use a separate disk for the encrypted volume: a block volume attached to the VPS, or a second disk or partition on a home server. Below it is `/dev/sdX`; **check the name with `lsblk` first**, because `luksFormat` wipes the device.

### 1. Create and open the encrypted volume

```bash
sudo apt install cryptsetup
```

```bash
sudo cryptsetup luksFormat --type luks2 /dev/sdX
```

Choose a long passphrase and store it in your password manager. Without it the data is gone (off-server backups are then the only copy).

```bash
sudo cryptsetup open /dev/sdX ppdata
```

```bash
sudo mkfs.ext4 -L ppdata /dev/mapper/ppdata
```

```bash
sudo mkdir -p /srv/pp && sudo mount /dev/mapper/ppdata /srv/pp
```

Do **not** add the volume to `/etc/fstab` or `/etc/crypttab` for automatic mounting. A VPS has no console to type a passphrase at boot, so boot would hang; you unlock it over SSH instead (step 5).

### 2. Keep Docker off until the volume is unlocked

Install Docker Engine (docs.docker.com/engine/install), then:

```bash
sudo systemctl disable --now docker.service docker.socket
```

```bash
sudo mkdir -p /srv/pp/docker /etc/docker
```

Create `/etc/docker/daemon.json` with:

```json
{ "data-root": "/srv/pp/docker" }
```

If Docker already has data under `/var/lib/docker` you want to keep, copy it with `sudo rsync -aHAX /var/lib/docker/ /srv/pp/docker/` before starting Docker. A fresh server has nothing to keep.

### 3. Put the app checkout on the volume

```bash
sudo mkdir -p /srv/pp/app && sudo chown "$USER" /srv/pp/app
```

```bash
git clone https://github.com/liljimmyk99/Penny-Pincher.git /srv/pp/app
```

Create `/srv/pp/app/.env` and `/srv/pp/app/secrets/firebase-sa.json` there (never anywhere else on the server).

### 4. Swap

Plaintext from memory can be written to swap. Check with `swapon --show`. If it lists anything, either turn swap off (`sudo swapoff -a` and remove its line from `/etc/fstab`) or encrypt it with a random key at each boot (a `swap` line in `/etc/crypttab` with `/dev/urandom` as the key). Many VPS images have no swap.

### 5. Unlock script

Find the volume's UUID with `sudo blkid /dev/sdX` (the `TYPE="crypto_LUKS"` line), then create `/usr/local/sbin/pp-unlock`:

```sh
#!/bin/sh
# Unlocks the encrypted volume and starts the app. Run after every reboot.
set -eu
cryptsetup open /dev/disk/by-uuid/PUT-UUID-HERE ppdata
mount /dev/mapper/ppdata /srv/pp
systemctl start docker.service
cd /srv/pp/app && docker compose up -d
```

```bash
sudo chmod 700 /usr/local/sbin/pp-unlock
```

### 6. Reboots

The app is down after every reboot until you run the unlock script. Turn off automatic reboots after updates, so that happens only when you choose to: in `/etc/apt/apt.conf.d/50unattended-upgrades` set `Unattended-Upgrade::Automatic-Reboot "false";`.

## After every reboot

```bash
ssh <server> sudo /usr/local/sbin/pp-unlock
```

It asks for the LUKS passphrase, then starts Docker and the stack.

## Checks

Run these once after setup, and the reboot check again after any server change.

**Reboot check** (the volume really is locked when the server is off):

```bash
sudo reboot
```

After it comes back, `ls /srv/pp` is empty and `systemctl is-active docker` says `inactive`. Run the unlock script; the app comes back with its data.

**Docker is on the volume:**

```bash
docker info -f '{{.DockerRootDir}}'
```

prints `/srv/pp/docker`.

**Volume is encrypted:**

```bash
sudo cryptsetup status ppdata
```

shows `type: LUKS2` and an `aes-xts` cipher.

**Backups use memory, not disk:**

```bash
docker compose exec api /api backup now
```

succeeds (the snapshot goes through the `tmpfs` at `/tmp`).

**HTTPS and HSTS:**

```bash
curl -sI "http://$DOMAIN/" | head -3
```

shows a `308` redirect to `https://`.

```bash
curl -sI "https://$DOMAIN/healthz" | grep -i strict-transport-security
```

shows `max-age=31536000`.

**Only Caddy is reachable from outside:**

```bash
docker compose ps --format '{{.Service}} {{.Ports}}'
```

shows published ports (`0.0.0.0:...->`) only for `proxy`.

Record the date each check last passed here.

- Last done: not yet (do it during issue #42).
