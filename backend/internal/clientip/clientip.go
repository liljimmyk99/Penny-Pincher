// Package clientip finds the address a request came from, for rate limits and
// security logs.
package clientip

import (
	"net"
	"net/http"
	"strings"
)

// From returns the address Caddy appended to X-Forwarded-For (the rightmost
// entry). Caddy replaces the header for untrusted clients, and the API port is
// never published, so only Caddy can set it. Without it, the peer address.
func From(r *http.Request) string {
	if xff := r.Header.Values("X-Forwarded-For"); len(xff) > 0 {
		last := xff[len(xff)-1]
		if i := strings.LastIndexByte(last, ','); i >= 0 {
			last = last[i+1:]
		}
		if ip := strings.TrimSpace(last); ip != "" {
			return ip
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
