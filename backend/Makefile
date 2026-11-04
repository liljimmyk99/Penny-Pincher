.PHONY: generate check-generate test

# Regenerate Go types and the server interface from ../api/openapi.yaml.
generate:
	go generate ./internal/api/...

# Fails if the generated code is out of date with the spec.
check-generate: generate
	git diff --exit-code -- internal/api

test:
	go vet ./... && go test ./...
