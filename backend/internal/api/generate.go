// Package api holds the Go types and server interface generated from
// /api/openapi.yaml, the single source of truth for request and response shapes.
//
// Do not edit the *.gen.go files. Change the spec, then run `make generate`
// (or `go generate ./...`) from /backend.
package api

//go:generate go tool oapi-codegen -config oapi-codegen.yaml ../../../api/openapi.yaml
//go:generate go run ./genstub -in openapi.gen.go -out unimplemented.gen.go
