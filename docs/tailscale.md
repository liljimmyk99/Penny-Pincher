# Serving the app on a tailnet-only host

The server is reached over Tailscale with no port open on the router, so Let's Encrypt can't reach it for the usual public challenge. Tailscale issues a real certificate for the machine's `<host>.<tailnet>.ts.net` name instead (#193). Tailscale is only the network layer: the API ignores `Tailscale-User-*` headers, and **Funnel stays off**.

## One-time setup

1. Enable HTTPS certificates for the tailnet (admin console → DNS → HTTPS Certificates).
2. On the server, make the certificate files in a folder Caddy can read:

   ```bash
   sudo mkdir -p /srv/pp/certs
   sudo tailscale cert --cert-file /srv/pp/certs/cert.pem --key-file /srv/pp/certs/key.pem <host>.<tailnet>.ts.net
   sudo chmod 700 /srv/pp/certs && sudo chmod 600 /srv/pp/certs/key.pem
   ```

   The folder belongs on the encrypted volume (`docs/encryption.md`). The proxy runs as root inside its container, so a root-owned `0600` key is readable to it.
3. In `.env`:

   ```
   COMPOSE_PROFILES=prod
   DOMAIN=<host>.<tailnet>.ts.net
   TLS_DIR=/srv/pp/certs
   ```

   and create `/srv/pp/certs/tls.caddy` with one line, which Caddy imports:

   ```
   tls /certs/cert.pem /certs/key.pem
   ```

4. `docker compose up -d`. Open `https://<host>.<tailnet>.ts.net` from any device on the tailnet.

## Renewal

Tailscale certificates last about 90 days. Renew with a weekly cron job, then reload Caddy:

```bash
sudo tailscale cert --cert-file /srv/pp/certs/cert.pem --key-file /srv/pp/certs/key.pem <host>.<tailnet>.ts.net \
  && docker compose exec proxy caddy reload --config /etc/caddy/Caddyfile
```

## Not using a tailnet name

Leave `TLS_DIR` empty. Caddy then gets its own certificate: Let's Encrypt for a public `DOMAIN`, its internal CA for `localhost` (the `dev` profile).
