package auth

import (
	"strings"
	"sync"
	"testing"
)

func TestHashAndVerify(t *testing.T) {
	h := NewHasher(TestParams, 2)
	enc, err := h.Hash("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(enc, "$argon2id$v=19$m=8,t=1,p=1$") {
		t.Fatalf("encoding = %q", enc)
	}
	if !h.Verify("correct horse battery", enc) || h.Verify("wrong", enc) || h.Verify("", enc) {
		t.Fatal("verify gave the wrong answer")
	}
	again, _ := h.Hash("correct horse battery")
	if again == enc {
		t.Fatal("two hashes of one password are identical: no salt")
	}
	// Parameters travel with the hash, so another Hasher can still check it.
	if !NewHasher(DefaultParams, 1).Verify("correct horse battery", enc) {
		t.Fatal("a hash made with other parameters did not verify")
	}
}

func TestVerifyRejectsMalformedHashes(t *testing.T) {
	h := NewHasher(TestParams, 1)
	for _, enc := range []string{"", "!", "$argon2id$", "$argon2i$v=19$m=8,t=1,p=1$AAAA$AAAA",
		"$argon2id$v=19$m=999999999,t=1,p=1$AAAA$AAAA", "$argon2id$v=19$m=8,t=1,p=1$%%%$AAAA", "$argon2id$v=19$m=8,t=1,p=1$AAAA$"} {
		if h.Verify("x", enc) {
			t.Errorf("accepted %q", enc)
		}
	}
}

func TestConcurrentHashesAreCapped(t *testing.T) {
	h := NewHasher(TestParams, 1)
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = h.Hash("some password here") }()
	}
	wg.Wait() // would deadlock if the semaphore leaked a slot
	h.DummyVerify("x")
}

func TestCheckPasswordRules(t *testing.T) {
	if CheckPasswordRules("12345678901") == "" || CheckPasswordRules("") == "" {
		t.Error("short passwords accepted")
	}
	if CheckPasswordRules("123456789012") != "" {
		t.Error("12 characters refused")
	}
	if CheckPasswordRules(strings.Repeat("a", MaxPasswordLength+1)) == "" {
		t.Error("over-long password accepted")
	}
}
