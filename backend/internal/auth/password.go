package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// MinPasswordLength is the shortest password the API accepts (weak_password).
const MinPasswordLength = 12

// MaxPasswordLength bounds the work a request can cause.
const MaxPasswordLength = 256

// Params are the argon2id cost settings. They are stored in every encoded hash,
// so changing the defaults never breaks existing passwords.
type Params struct {
	Memory  uint32 // KiB
	Time    uint32
	Threads uint8
	KeyLen  uint32
	SaltLen uint32
}

// DefaultParams follow OWASP's argon2id guidance (19 MiB, 2 passes) with room to spare.
var DefaultParams = Params{Memory: 64 * 1024, Time: 3, Threads: 2, KeyLen: 32, SaltLen: 16}

// TestParams make hashing fast enough for tests. Never used in production.
var TestParams = Params{Memory: 8, Time: 1, Threads: 1, KeyLen: 32, SaltLen: 16}

// Hasher hashes and checks passwords with argon2id. A semaphore caps how many
// hashes run at once so a burst of sign-in attempts cannot exhaust memory.
type Hasher struct {
	params Params
	sem    chan struct{}
	dummy  string
}

// NewHasher returns a Hasher that runs at most maxConcurrent hashes at once.
func NewHasher(p Params, maxConcurrent int) *Hasher {
	if maxConcurrent < 1 {
		maxConcurrent = 1
	}
	h := &Hasher{params: p, sem: make(chan struct{}, maxConcurrent)}
	// A real hash of a throwaway password, used to spend the same time on
	// unknown usernames.
	h.dummy, _ = h.Hash("dummy-password-for-timing")
	return h
}

// NewDefaultHasher uses DefaultParams and at most 4 concurrent hashes.
func NewDefaultHasher() *Hasher { return NewHasher(DefaultParams, 4) }

func (h *Hasher) acquire() func() {
	h.sem <- struct{}{}
	return func() { <-h.sem }
}

// Hash returns the encoded argon2id hash of password:
// $argon2id$v=19$m=...,t=...,p=...$salt$key (base64, no padding).
func (h *Hasher) Hash(password string) (string, error) {
	salt := make([]byte, h.params.SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	defer h.acquire()()
	key := argon2.IDKey([]byte(password), salt, h.params.Time, h.params.Memory, h.params.Threads, h.params.KeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version,
		h.params.Memory, h.params.Time, h.params.Threads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// Verify reports whether password matches the encoded hash, in constant time.
// A malformed hash (such as the migration's '!' placeholder) never matches.
func (h *Hasher) Verify(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	// Refuse absurd stored parameters so a corrupted row can't cause huge allocations.
	if m == 0 || m > 1<<20 || t == 0 || t > 20 || p == 0 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false
	}
	defer h.acquire()()
	got := argon2.IDKey([]byte(password), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// DummyVerify spends the time of a real check, for an unknown username.
func (h *Hasher) DummyVerify(password string) {
	h.Verify(password, h.dummy)
}

// CheckPasswordRules returns "" when the password is acceptable, else the
// reason for weak_password.
func CheckPasswordRules(password string) string {
	switch n := len([]rune(password)); {
	case n < MinPasswordLength:
		return fmt.Sprintf("must be at least %d characters", MinPasswordLength)
	case len(password) > MaxPasswordLength:
		return fmt.Sprintf("must be at most %d characters", MaxPasswordLength)
	}
	return ""
}
