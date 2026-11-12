package http

import (
	"context"
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

// AuthCheck reports whether the sign-in provider is reachable.
type AuthCheck func(ctx context.Context) error

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

	st.AuthProvider.CheckedAt = now
	st.AuthProvider.Status = api.AdminStatusAuthProviderStatusOk
	if s.authCheck != nil {
		cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		if err := s.authCheck(cctx); err != nil {
			st.AuthProvider.Status = api.AdminStatusAuthProviderStatusUnreachable
		}
	}
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
		Id:          formatID(u.ID),
		FirebaseUid: u.FirebaseUID,
		Email:       nullableOf(u.Email),
		DisplayName: nullableOf(u.DisplayName),
		Role:        api.AdminUserRole(u.Role),
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

// AddUser implements POST /v1/admin/users. It writes the app's database only
// (the allowlist plus the new user's defaults); Firebase is never called.
func (s *Server) AddUser(ctx context.Context, req api.AddUserRequestObject) (api.AddUserResponseObject, error) {
	in := store.NewUser{
		FirebaseUID: strings.TrimSpace(req.Body.FirebaseUid),
		Role:        store.RoleMember,
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
	switch {
	case in.FirebaseUID == "":
		return addUserInvalid("firebase_uid", "is required"), nil
	case len(in.FirebaseUID) > 128:
		return addUserInvalid("firebase_uid", "must be at most 128 characters"), nil
	case in.Role != store.RoleAdmin && in.Role != store.RoleMember:
		return addUserInvalid("role", "must be admin or member"), nil
	case len(in.DisplayName) > 100:
		return addUserInvalid("display_name", "must be at most 100 characters"), nil
	}
	if in.Email != "" {
		if a, err := mail.ParseAddress(in.Email); err != nil || a.Address != in.Email || len(in.Email) > 254 {
			return addUserInvalid("email", "must be an email address"), nil
		}
	}
	id, err := store.AddUser(ctx, s.admin.DB, in)
	if errors.Is(err, store.ErrUserExists) {
		return api.AddUser409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeUserExists, "A user with this Firebase uid has already been added."))}, nil
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
