package http

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

// newError builds the shared error body defined in the OpenAPI spec.
func newError(code api.ErrorErrorCode, message string) api.Error {
	var e api.Error
	e.Error.Code = code
	e.Error.Message = message
	return e
}

// writeError writes the shared error body with the given status.
func writeError(w http.ResponseWriter, status int, code api.ErrorErrorCode, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(newError(code, message))
}

func errType(err error) string { return fmt.Sprintf("%T", err) }
