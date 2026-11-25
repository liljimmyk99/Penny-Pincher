# syntax=docker/dockerfile:1
FROM node:26.13-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

# Static files served by a tiny Caddy; the public reverse proxy forwards non-API paths here.
FROM caddy:2.11-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
# Runs as a non-root user (#109). Caddy's /config and /data are its own, so it
# also works without the tmpfs mounts docker-compose.yml puts there.
RUN addgroup -S -g 10001 web && adduser -S -D -H -u 10001 -G web web \
    && chown -R web:web /config /data
USER web
EXPOSE 8080
