package http

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/backup"
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
func (s *Server) StartBackup(_ context.Context, _ api.StartBackupRequestObject) (api.StartBackupResponseObject, error) {
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
	cd := fmt.Sprintf("attachment; filename=%q", d.Name)
	return api.DownloadBackup200ApplicationoctetStreamResponse{
		Body:          d.Body,
		ContentLength: d.Size,
		Headers:       api.DownloadBackup200ResponseHeaders{ContentDisposition: &cd},
	}, nil
}
