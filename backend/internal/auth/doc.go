// Package auth holds username and password sign-in: argon2id password hashing
// and the session middleware that authenticates every request except /healthz
// and POST /v1/auth/login.
package auth
