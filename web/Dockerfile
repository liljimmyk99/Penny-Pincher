# syntax=docker/dockerfile:1
FROM node:24.22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# Public Firebase web config, baked into the bundle at build time (see .env.example).
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_AUTH_DOMAIN
# End-to-end tests only (/e2e); ignored unless the project id starts with demo-.
ARG VITE_FIREBASE_AUTH_EMULATOR_URL
RUN npm run build

# Static files served by a tiny Caddy; the public reverse proxy forwards non-API paths here.
FROM caddy:2.11-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
# Runs as a non-root user (#109). Caddy's /config and /data are its own, so it
# also works without the tmpfs mounts docker-compose.yml puts there.
RUN addgroup -S -g 10001 web && adduser -S -D -H -u 10001 -G web web \
    && chown -R web:web /config /data
USER web
EXPOSE 8080
