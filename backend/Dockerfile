# syntax=docker/dockerfile:1
FROM golang:1.27-alpine@sha256:eb61c3873c97416fff0116553fff65d67a3549f72e11d9758849a689cdd8b523 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X github.com/liljimmyk99/penny-pincher/backend/internal/config.Version=${VERSION}" \
    -o /out/api ./cmd/api
# distroless has no shell, so create the data dir here and copy it across.
RUN mkdir /data

FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
COPY --from=build /out/api /api
# Owned by the nonroot user so a fresh api-data volume mounted here is writable.
COPY --from=build --chown=65532:65532 /data /data
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/api"]
