// Command api is the Spend Tracker API server. It only wires packages together.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
	"github.com/liljimmyk99/penny-pincher/backend/internal/config"
	apihttp "github.com/liljimmyk99/penny-pincher/backend/internal/http"
	"github.com/liljimmyk99/penny-pincher/backend/internal/logging"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		return healthcheck(cfg.Port)
	}
	log := logging.New(os.Stdout, cfg.LogLevel)

	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		db, err := store.Open(cfg.DBPath)
		if err != nil {
			return err
		}
		defer db.Close()
		return store.Migrate(context.Background(), db)
	}

	db, err := store.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := store.Migrate(context.Background(), db); err != nil {
		return err
	}
	if cfg.FirebaseProjectID == "" {
		return errors.New("FIREBASE_PROJECT_ID is required")
	}
	verifier, err := auth.NewFirebaseVerifier(context.Background(), cfg.FirebaseProjectID)
	if err != nil {
		return err
	}
	authn := auth.Middleware(verifier, store.Users{DB: db})
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           apihttp.NewRouter(cfg.Version, db, time.Now, authn),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
	}()

	log.Info("listening", "port", cfg.Port, "version", cfg.Version)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// healthcheck probes the local /healthz; used by the container HEALTHCHECK
// because the distroless image has no wget or curl.
func healthcheck(port int) error {
	c := http.Client{Timeout: 3 * time.Second}
	resp, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/healthz", port))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthz returned %d", resp.StatusCode)
	}
	return nil
}
