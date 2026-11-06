package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	"filippo.io/age"

	"github.com/liljimmyk99/penny-pincher/backend/internal/backup"
	"github.com/liljimmyk99/penny-pincher/backend/internal/config"
)

const backupUsage = `usage:
  api backup now                      take a manual encrypted snapshot and upload it
  api backup restore --in <file.sqlite.age> --identity <age-key-file> --out <new.db>`

// newBackupService builds the snapshot service, or nil when backups are not
// configured.
func newBackupService(cfg config.Backup, db *sql.DB, tempDir string) (*backup.Service, error) {
	if !cfg.Enabled() {
		return nil, nil
	}
	rcpt, err := backup.ParseRecipient(cfg.Recipient)
	if err != nil {
		return nil, err
	}
	bucket, err := backup.NewS3(cfg.Endpoint, cfg.Bucket, cfg.Region, cfg.AccessKey, cfg.SecretKey, cfg.Insecure)
	if err != nil {
		return nil, err
	}
	return &backup.Service{DB: db, Bucket: bucket, Recipient: rcpt, TempDir: tempDir}, nil
}

// runBackup handles `api backup ...`. "restore" needs the private key and no
// server settings, so it works on any machine.
func runBackup(ctx context.Context, cfg config.Config, db *sql.DB, args []string, out io.Writer) error {
	if len(args) == 0 {
		return errors.New(backupUsage)
	}
	switch args[0] {
	case "now":
		svc, err := newBackupService(cfg.Backup, db, "")
		if err != nil {
			return err
		}
		if svc == nil {
			return errors.New("backups are not configured: set BACKUP_AGE_RECIPIENT and the BACKUP_S3_* variables")
		}
		res, err := svc.Run(ctx, backup.Manual)
		if err != nil {
			return err
		}
		fmt.Fprintln(out, "uploaded", res.Key)
		return nil
	case "restore":
		return runRestore(ctx, args[1:], out)
	}
	return errors.New(backupUsage)
}

func runRestore(ctx context.Context, args []string, out io.Writer) error {
	fs := flag.NewFlagSet("backup restore", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	in := fs.String("in", "", "encrypted snapshot (.sqlite.age)")
	idFile := fs.String("identity", "", "age private key file")
	dst := fs.String("out", "", "database file to create (must not exist)")
	if err := fs.Parse(args); err != nil {
		return fmt.Errorf("%w\n%s", err, backupUsage)
	}
	if *in == "" || *idFile == "" || *dst == "" {
		return errors.New("--in, --identity and --out are required\n" + backupUsage)
	}
	f, err := os.Open(*idFile)
	if err != nil {
		return err
	}
	defer f.Close()
	ids, err := age.ParseIdentities(f)
	if err != nil {
		return fmt.Errorf("read identity: %w", err)
	}
	if err := backup.RestoreFile(ctx, *in, *dst, ids...); err != nil {
		return err
	}
	if err := backup.VerifyFile(ctx, *dst); err != nil {
		os.Remove(*dst)
		return err
	}
	fmt.Fprintf(out, "restored and verified %s\n", *dst)
	return nil
}
