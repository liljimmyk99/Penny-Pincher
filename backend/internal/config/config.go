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
