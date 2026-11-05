// Package config loads settings from environment variables.
package config

import (
	"fmt"
	"strconv"
)

// Config holds runtime settings. Secrets come from the environment only.
type Config struct {
	Port     int
	DBPath   string
	LogLevel string
	Version  string

	// FirebaseProjectID is required to run the server (checked in main).
	FirebaseProjectID string
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
