package config

import (
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/ratelimit"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestDefaults(t *testing.T) {
	c, err := Load(env(nil))
	if err != nil || c.Port != 8080 || c.DBPath != "/data/spend.db" || c.LogLevel != "info" {
		t.Fatalf("got %+v, %v", c, err)
	}
}

func TestOverrides(t *testing.T) {
	c, err := Load(env(map[string]string{"PORT": "9000", "DB_PATH": "/x.db", "LOG_LEVEL": "debug"}))
	if err != nil || c.Port != 9000 || c.DBPath != "/x.db" || c.LogLevel != "debug" {
		t.Fatalf("got %+v, %v", c, err)
	}
}

func TestInvalid(t *testing.T) {
	for _, m := range []map[string]string{{"PORT": "abc"}, {"PORT": "70000"}, {"LOG_LEVEL": "loud"}} {
		if _, err := Load(env(m)); err == nil {
			t.Errorf("expected error for %v", m)
		}
	}
}

func TestRateLimitOverrides(t *testing.T) {
	c, err := Load(env(nil))
	if err != nil || c.RateLimitPerIP != (ratelimit.Rule{}) || c.RateLimitPerUser != (ratelimit.Rule{}) {
		t.Fatalf("defaults: got %+v, %v", c, err)
	}
	c, err = Load(env(map[string]string{"RATE_LIMIT_PER_IP": "200/400", "RATE_LIMIT_PER_USER": "0.5/3"}))
	if err != nil || c.RateLimitPerIP != (ratelimit.Rule{Rate: 200, Burst: 400}) || c.RateLimitPerUser != (ratelimit.Rule{Rate: 0.5, Burst: 3}) {
		t.Fatalf("overrides: got %+v, %v", c, err)
	}
	for _, v := range []string{"20", "x/40", "20/x", "0/40", "20/0", "-1/4"} {
		if _, err := Load(env(map[string]string{"RATE_LIMIT_PER_IP": v})); err == nil {
			t.Errorf("expected an error for %q", v)
		}
	}
}

func TestBackupConfig(t *testing.T) {
	c, err := Load(env(nil))
	if err != nil || c.Backup.Enabled() {
		t.Fatalf("disabled by default: got %+v, %v", c.Backup, err)
	}
	if _, err := Load(env(map[string]string{"BACKUP_AGE_RECIPIENT": "age1x"})); err == nil {
		t.Fatal("expected an error: recipient without S3 settings")
	}
	c, err = Load(env(map[string]string{
		"BACKUP_AGE_RECIPIENT": "age1x", "BACKUP_S3_ENDPOINT": "s3.example.com", "BACKUP_S3_BUCKET": "b",
		"BACKUP_S3_ACCESS_KEY": "k", "BACKUP_S3_SECRET_KEY": "s",
	}))
	if err != nil || !c.Backup.Enabled() || c.Backup.Insecure {
		t.Fatalf("got %+v, %v", c.Backup, err)
	}
}

func TestBackupInsecureOnlyInTestMode(t *testing.T) {
	m := map[string]string{
		"BACKUP_AGE_RECIPIENT": "age1x", "BACKUP_S3_ENDPOINT": "minio:9000", "BACKUP_S3_BUCKET": "b",
		"BACKUP_S3_ACCESS_KEY": "k", "BACKUP_S3_SECRET_KEY": "s", "BACKUP_S3_INSECURE": "1",
	}
	if _, err := Load(env(m)); err == nil {
		t.Fatal("expected an error for plain HTTP to the bucket outside test mode")
	}
	m["APP_TEST_MODE"] = "1"
	c, err := Load(env(m))
	if err != nil || !c.Backup.Insecure || !c.TestMode {
		t.Fatalf("test mode: got %+v, %v", c.Backup, err)
	}
}
