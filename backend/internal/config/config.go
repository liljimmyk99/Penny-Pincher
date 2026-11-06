// Package config loads settings from environment variables.
package config

import (
	"fmt"
	"strconv"
	"strings"
)

// Config holds runtime settings. Secrets come from the environment only.
type Config struct {
	Port     int
	DBPath   string
	LogLevel string
	Version  string

	// FirebaseProjectID is required to run the server (checked in main).
	FirebaseProjectID string

	// AuthEmulatorHost is FIREBASE_AUTH_EMULATOR_HOST. The Firebase Admin SDK
	// reads it itself and then accepts unsigned emulator tokens, so it is only
	// allowed with a "demo-" project id (Firebase's emulator-only projects).
	// The end-to-end suite in /e2e is the only thing that sets it.
	AuthEmulatorHost string

	// Backup settings. Backups are enabled only when BackupRecipient is set;
	// then the S3 settings are required too (see Backup.Validate).
	Backup Backup
}

// Backup configures encrypted off-server snapshots (AGENTS.md section 8).
type Backup struct {
	// Recipient is the age public key ("age1..."). The server never holds the
	// private key, so it cannot read past backups.
	Recipient string
	// Endpoint is the S3-compatible host[:port] with no scheme.
	Endpoint  string
	Bucket    string
	Region    string
	AccessKey string
	SecretKey string
	// Insecure uses plain HTTP to the endpoint (local test buckets only).
	Insecure bool
}

// Enabled reports whether backups are configured.
func (b Backup) Enabled() bool { return b.Recipient != "" }

// Validate checks that an enabled configuration is complete.
func (b Backup) Validate() error {
	if !b.Enabled() {
		return nil
	}
	for name, v := range map[string]string{
		"BACKUP_S3_ENDPOINT": b.Endpoint, "BACKUP_S3_BUCKET": b.Bucket,
		"BACKUP_S3_ACCESS_KEY": b.AccessKey, "BACKUP_S3_SECRET_KEY": b.SecretKey,
	} {
		if v == "" {
			return fmt.Errorf("%s is required when BACKUP_AGE_RECIPIENT is set", name)
		}
	}
	return nil
}

// Version is overridden at build time: -ldflags "-X .../internal/config.Version=...".
var Version = "dev"

// Load reads configuration using getenv (typically os.Getenv).
func Load(getenv func(string) string) (Config, error) {
	c := Config{Port: 8080, DBPath: "/data/spend.db", LogLevel: "info", Version: Version}
	if v := getenv("PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil || p < 1 || p > 65535 {
			return c, fmt.Errorf("invalid PORT %q", v)
		}
		c.Port = p
	}
	c.FirebaseProjectID = getenv("FIREBASE_PROJECT_ID")
	c.AuthEmulatorHost = getenv("FIREBASE_AUTH_EMULATOR_HOST")
	if c.AuthEmulatorHost != "" && !strings.HasPrefix(c.FirebaseProjectID, "demo-") {
		return c, fmt.Errorf("FIREBASE_AUTH_EMULATOR_HOST is set, but FIREBASE_PROJECT_ID %q is not a demo- project; refusing to accept emulator tokens", c.FirebaseProjectID)
	}
	c.Backup = Backup{
		Recipient: getenv("BACKUP_AGE_RECIPIENT"),
		Endpoint:  getenv("BACKUP_S3_ENDPOINT"),
		Bucket:    getenv("BACKUP_S3_BUCKET"),
		Region:    getenv("BACKUP_S3_REGION"),
		AccessKey: getenv("BACKUP_S3_ACCESS_KEY"),
		SecretKey: getenv("BACKUP_S3_SECRET_KEY"),
		Insecure:  getenv("BACKUP_S3_INSECURE") == "1",
	}
	if err := c.Backup.Validate(); err != nil {
		return c, err
	}
	if v := getenv("DB_PATH"); v != "" {
		c.DBPath = v
	}
	if v := getenv("LOG_LEVEL"); v != "" {
		switch v {
		case "debug", "info", "warn", "error":
			c.LogLevel = v
		default:
			return c, fmt.Errorf("invalid LOG_LEVEL %q", v)
		}
	}
	return c, nil
}
