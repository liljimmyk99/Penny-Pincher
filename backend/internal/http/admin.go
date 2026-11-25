package http

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/mail"
	"strings"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
	"github.com/liljimmyk99/penny-pincher/backend/internal/backup"
	"github.com/liljimmyk99/penny-pincher/backend/internal/logging"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// Backups is what the admin routes need from the backup service. A nil
// Backups means backups are not configured.
type Backups interface {
	Start(kind backup.Kind) (backup.Run, error)
	Runs(ctx context.Context) ([]backup.Run, error)
	LastRun(ctx context.Context) *backup.Run
	Open(ctx context.Context, id string) (backup.Download, error)
}

var _ Backups = (*backup.Service)(nil)

// logAdminAction writes one security-event line for something an admin did.
// The auth middleware has put the admin's identity on ctx.
func logAdminAction(ctx context.Context, action, backupID string) {
	id, _ := auth.FromContext(ctx)
	slog.Info("admin action",
		"event", logging.EventAdminAction,
		"action", action,
		"user_id", id.ID,
		"backup_id", backupID,
	)
}

// logAdminPasswordReset logs that an admin reset a password: ids only.
func logAdminPasswordReset(ctx context.Context, targetID int64) {
	id, _ := auth.FromContext(ctx)
	slog.Info("admin action",
		"event", logging.EventAdminAction,
		"action", logging.ActionPasswordReset,
		"user_id", id.ID,
		"target_user_id", targetID,
	)
}

// logAdminUserAdded logs that an admin added a user: ids only, never the new
// user's uid or email.
func logAdminUserAdded(ctx context.Context, newUserID int64) {
	id, _ := auth.FromContext(ctx)
	slog.Info("admin action",
		"event", logging.EventAdminAction,
		"action", logging.ActionUserAdded,
		"user_id", id.ID,
		"target_user_id", newUserID,
	)
}

func toAPIBackup(r backup.Run) api.Backup {
	b := api.Backup{
		Id:        r.ID,
		Kind:      api.BackupKind(r.Kind),
		Status:    api.BackupStatus(r.Status),
		StartedAt: &r.Started,
	}
	b.FinishedAt = nullableOf(r.Finished)
	b.SizeBytes = nullableOf(r.Size)
	var msg *string
	if r.Error != "" {
		msg = &r.Error
	}
	b.ErrorMessage = nullableOf(msg)
	return b
}

// GetAdminStatus implements GET /v1/admin/status (admins only, enforced by
// the auth middleware).
func (s *Server) GetAdminStatus(ctx context.Context, _ api.GetAdminStatusRequestObject) (api.GetAdminStatusResponseObject, error) {
	info, err := s.admin.Info(ctx)
	if err != nil {
		return nil, err
	}
	now := s.now()
	started := s.start
	var st api.AdminStatus
	st.Version = s.version
	st.StartedAt = &started
	st.UptimeSeconds = int(now.Sub(s.start).Seconds())
	st.Database.SizeBytes = info.SizeBytes
	st.Database.LastWriteAt = nullableOf(info.LastWrite)
	st.Backups.Schedule = backup.ScheduleText
	st.Backups.Retention.Weekly = backup.Retention[backup.Weekly]
	st.Backups.Retention.Monthly = backup.Retention[backup.Monthly]
	st.Backups.NextWeeklyAt = backup.NextWeekly(now)
	st.Backups.NextMonthlyAt = backup.NextMonthly(now)
	var last *api.Backup
	if s.backups != nil {
		if r := s.backups.LastRun(ctx); r != nil {
			b := toAPIBackup(*r)
			last = &b
		}
	}
	st.Backups.LastRun = nullableOf(last)

	return api.GetAdminStatus200JSONResponse(st), nil
}

// ListBackups implements GET /v1/admin/backups.
func (s *Server) ListBackups(ctx context.Context, _ api.ListBackupsRequestObject) (api.ListBackupsResponseObject, error) {
	items := []api.Backup{}
	if s.backups != nil {
		runs, err := s.backups.Runs(ctx)
		if err != nil {
			return nil, err
		}
		for _, r := range runs {
			items = append(items, toAPIBackup(r))
		}
	}
	return api.ListBackups200JSONResponse{Items: items}, nil
}

// StartBackup implements POST /v1/admin/backups.
func (s *Server) StartBackup(ctx context.Context, _ api.StartBackupRequestObject) (api.StartBackupResponseObject, error) {
	if s.backups == nil {
		return nil, api.ErrNotImplemented // backups not configured
	}
	run, err := s.backups.Start(backup.Manual)
	if errors.Is(err, backup.ErrBusy) {
		return api.StartBackup409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeBackupInProgress, "A backup is already running."))}, nil
	}
	if err != nil {
		return nil, err
	}
	logAdminAction(ctx, logging.ActionBackupStarted, run.ID)
	return api.StartBackup202JSONResponse(toAPIBackup(run)), nil
}

// DownloadBackup implements GET /v1/admin/backups/{id}/download. It streams
// the stored age-encrypted object as is; nothing is decrypted.
func (s *Server) DownloadBackup(ctx context.Context, req api.DownloadBackupRequestObject) (api.DownloadBackupResponseObject, error) {
	if s.backups == nil {
		return api.DownloadBackup404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, "Backup not found."))}, nil
	}
	d, err := s.backups.Open(ctx, req.Id)
	switch {
	case errors.Is(err, backup.ErrNotFound):
		return api.DownloadBackup404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, "Backup not found."))}, nil
	case errors.Is(err, backup.ErrNotReady):
		return api.DownloadBackup409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeBackupNotReady, "This backup has not finished successfully."))}, nil
	case err != nil:
		return nil, err
	}
	logAdminAction(ctx, logging.ActionBackupDownloaded, req.Id)
	cd := fmt.Sprintf("attachment; filename=%q", d.Name)
	return api.DownloadBackup200ApplicationoctetStreamResponse{
		Body:          d.Body,
		ContentLength: d.Size,
		Headers:       api.DownloadBackup200ResponseHeaders{ContentDisposition: &cd},
	}, nil
}

func toAPIUser(u store.UserRow) api.AdminUser {
	out := api.AdminUser{
		Id:                 formatID(u.ID),
		Username:           u.Username,
		MustChangePassword: u.MustChangePassword,
		Email:              nullableOf(u.Email),
		DisplayName:        nullableOf(u.DisplayName),
		Role:               api.AdminUserRole(u.Role),
	}
	if t, err := time.Parse(time.RFC3339Nano, u.CreatedAt); err == nil {
		out.CreatedAt = &t
	}
	return out
}

// ListUsers implements GET /v1/admin/users. It returns account details only.
func (s *Server) ListUsers(ctx context.Context, _ api.ListUsersRequestObject) (api.ListUsersResponseObject, error) {
	rows, err := store.ListUsers(ctx, s.admin.DB)
	if err != nil {
		return nil, err
	}
	items := make([]api.AdminUser, 0, len(rows))
	for _, u := range rows {
		items = append(items, toAPIUser(u))
	}
	return api.ListUsers200JSONResponse{Items: items}, nil
}

func addUserInvalid(field, issue string) api.AddUserResponseObject {
	return api.AddUser400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(
		validationError(&store.ValidationError{Field: field, Issue: issue}))}
}

func addUserWeak(issue string) api.AddUserResponseObject {
	return api.AddUser400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(weakPasswordError("password", issue))}
}

// maxUsername bounds the username; the spec allows 1 to 64 characters.
const maxUsername = 64

// AddUser implements POST /v1/admin/users: the account, its initial password
// (stored only as an argon2id hash) and its seeded defaults.
func (s *Server) AddUser(ctx context.Context, req api.AddUserRequestObject) (api.AddUserResponseObject, error) {
	in := store.NewUser{
		Username:           strings.TrimSpace(req.Body.Username),
		Role:               store.RoleMember,
		MustChangePassword: true,
	}
	if req.Body.MustChangePassword != nil {
		in.MustChangePassword = *req.Body.MustChangePassword
	}
	if e := ptrOf(req.Body.Email); e != nil {
		in.Email = strings.TrimSpace(*e)
	}
	if n := ptrOf(req.Body.DisplayName); n != nil {
		in.DisplayName = strings.TrimSpace(*n)
	}
	if req.Body.Role != nil {
		in.Role = string(*req.Body.Role)
	}
	password := ""
	if req.Body.Password != nil {
		password = *req.Body.Password
	}
	switch {
	case in.Username == "":
		return addUserInvalid("username", "is required"), nil
	case len(in.Username) > maxUsername:
		return addUserInvalid("username", "must be at most 64 characters"), nil
	case in.Role != store.RoleAdmin && in.Role != store.RoleMember:
		return addUserInvalid("role", "must be admin or member"), nil
	case len(in.DisplayName) > 100:
		return addUserInvalid("display_name", "must be at most 100 characters"), nil
	}
	if issue := auth.CheckPasswordRules(password); issue != "" {
		return addUserWeak(issue), nil
	}
	if in.Email != "" {
		if a, err := mail.ParseAddress(in.Email); err != nil || a.Address != in.Email || len(in.Email) > 254 {
			return addUserInvalid("email", "must be an email address"), nil
		}
	}
	hash, err := s.hasher.Hash(password)
	if err != nil {
		return nil, err
	}
	in.PasswordHash = hash
	id, err := store.AddUser(ctx, s.admin.DB, in)
	if errors.Is(err, store.ErrUserExists) {
		return api.AddUser409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeUserExists, "That username is already taken."))}, nil
	}
	if err != nil {
		return nil, err
	}
	row, err := store.GetUserRow(ctx, s.admin.DB, id)
	if err != nil {
		return nil, err
	}
	logAdminUserAdded(ctx, id)
	return api.AddUser201JSONResponse(toAPIUser(row)), nil
}

// ResetUserPassword implements POST /v1/admin/users/{id}/password. It signs
// the user out everywhere. The new password is never logged or returned.
func (s *Server) ResetUserPassword(ctx context.Context, req api.ResetUserPasswordRequestObject) (api.ResetUserPasswordResponseObject, error) {
	notFound := api.ResetUserPassword404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, "User not found."))}
	uid, ok := parseID(req.Id)
	if !ok {
		return notFound, nil
	}
	password := ""
	if req.Body != nil && req.Body.Password != nil {
		password = *req.Body.Password
	}
	if issue := auth.CheckPasswordRules(password); issue != "" {
		return api.ResetUserPassword400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(weakPasswordError("password", issue))}, nil
	}
	must := true
	if req.Body.MustChangePassword != nil {
		must = *req.Body.MustChangePassword
	}
	if _, err := store.GetUserRow(ctx, s.admin.DB, uid); errors.Is(err, sql.ErrNoRows) {
		return notFound, nil
	} else if err != nil {
		return nil, err
	}
	hash, err := s.hasher.Hash(password)
	if err != nil {
		return nil, err
	}
	if err := store.SetPassword(ctx, s.admin.DB, uid, hash, must); errors.Is(err, store.ErrNoUser) {
		return notFound, nil
	} else if err != nil {
		return nil, err
	}
	logAdminPasswordReset(ctx, uid)
	return api.ResetUserPassword204Response{}, nil
}
