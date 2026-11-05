package config

import "testing"

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

func TestAuthEmulatorOnlyForDemoProjects(t *testing.T) {
	c, err := Load(env(map[string]string{"FIREBASE_PROJECT_ID": "demo-e2e", "FIREBASE_AUTH_EMULATOR_HOST": "auth:9099"}))
	if err != nil || c.AuthEmulatorHost != "auth:9099" {
		t.Fatalf("demo project: got %+v, %v", c, err)
	}
	if _, err := Load(env(map[string]string{"FIREBASE_PROJECT_ID": "real-project", "FIREBASE_AUTH_EMULATOR_HOST": "auth:9099"})); err == nil {
		t.Fatal("expected an error for the emulator with a real project")
	}
	if _, err := Load(env(map[string]string{"FIREBASE_AUTH_EMULATOR_HOST": "auth:9099"})); err == nil {
		t.Fatal("expected an error for the emulator with no project")
	}
}
