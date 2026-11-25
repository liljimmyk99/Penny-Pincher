package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
	"golang.org/x/term"
)

const userUsage = `usage: api user add --username <name> [--email <email>] [--name <display name>] [--role admin|member] [--must-change]
       api user set-password --username <name> [--must-change]
       api user revoke --username <name>
The password is prompted for (without echo) on a terminal, or read from the first
line of standard input when piped. It is never taken from a flag, so it stays out
of the process list and shell history.`

// confirmPassword asks twice through read and returns the password if both
// answers match and satisfy the password rules.
func confirmPassword(read func(prompt string) (string, error)) (string, error) {
	pw, err := read("Password: ")
	if err != nil {
		return "", err
	}
	again, err := read("Repeat password: ")
	if err != nil {
		return "", err
	}
	if pw != again {
		return "", errors.New("passwords do not match")
	}
	if issue := auth.CheckPasswordRules(pw); issue != "" {
		return "", fmt.Errorf("password %s", issue)
	}
	return pw, nil
}

// readPassword prompts without echo when in is a terminal; otherwise it reads
// one line from in. Either way the result is checked against the password rules.
func readPassword(in io.Reader) (string, error) {
	if f, ok := in.(*os.File); ok && term.IsTerminal(int(f.Fd())) {
		return confirmPassword(func(prompt string) (string, error) {
			fmt.Fprint(os.Stderr, prompt)
			b, err := term.ReadPassword(int(f.Fd()))
			fmt.Fprintln(os.Stderr)
			return string(b), err
		})
	}
	line, err := bufio.NewReader(in).ReadString('\n')
	if err != nil && !(errors.Is(err, io.EOF) && line != "") {
		return "", errors.New("no password on standard input")
	}
	pw := strings.TrimRight(line, "\r\n")
	if issue := auth.CheckPasswordRules(pw); issue != "" {
		return "", fmt.Errorf("password %s", issue)
	}
	return pw, nil
}

// runUser handles `api user add`, `set-password` and `revoke`: the way to
// create the first admin and to reset or lock out an account from the server.
func runUser(ctx context.Context, dbPath string, args []string, in io.Reader, out io.Writer) error {
	if len(args) == 0 || (args[0] != "add" && args[0] != "set-password" && args[0] != "revoke") {
		return errors.New(userUsage)
	}
	cmd := args[0]
	fs := flag.NewFlagSet("user "+cmd, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	username := fs.String("username", "", "username (required)")
	email := fs.String("email", "", "email address")
	name := fs.String("name", "", "display name")
	role := fs.String("role", store.RoleMember, "admin or member")
	must := fs.Bool("must-change", false, "make the person choose their own password at next sign-in")
	if err := fs.Parse(args[1:]); err != nil {
		return fmt.Errorf("%w\n%s", err, userUsage)
	}
	if strings.TrimSpace(*username) == "" {
		return errors.New("--username is required\n" + userUsage)
	}

	var hash string
	if cmd != "revoke" {
		pw, err := readPassword(in)
		if err != nil {
			return err
		}
		hash, err = auth.NewDefaultHasher().Hash(pw)
		if err != nil {
			return err
		}
	}

	db, err := store.Open(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := store.Migrate(ctx, db); err != nil {
		return err
	}
	switch cmd {
	case "add":
		id, err := store.AddUser(ctx, db, store.NewUser{Username: *username, PasswordHash: hash, MustChangePassword: *must,
			Email: *email, DisplayName: *name, Role: *role})
		if errors.Is(err, store.ErrUserExists) {
			return fmt.Errorf("username %q is already taken", *username)
		}
		if err != nil {
			return err
		}
		fmt.Fprintf(out, "added user %d (%s) with role %s\n", id, strings.TrimSpace(*username), *role)
	case "set-password":
		u, err := store.FindUserByUsername(ctx, db, *username)
		if errors.Is(err, store.ErrNoUser) {
			return fmt.Errorf("no user named %q", *username)
		}
		if err != nil {
			return err
		}
		if err := store.SetPassword(ctx, db, u.ID, hash, *must); err != nil {
			return err
		}
		fmt.Fprintf(out, "set the password of %s and signed them out everywhere\n", u.Username)
	case "revoke":
		u, err := store.FindUserByUsername(ctx, db, *username)
		if errors.Is(err, store.ErrNoUser) {
			return fmt.Errorf("no user named %q", *username)
		}
		if err != nil {
			return err
		}
		if err := (store.Sessions{DB: db}).RevokeAllForUser(ctx, u.ID); err != nil {
			return err
		}
		fmt.Fprintf(out, "signed %s out everywhere; their tokens stop working at once\n", u.Username)
	}
	return nil
}
