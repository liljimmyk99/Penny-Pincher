package http

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/importrun"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const (
	// streamPing keeps proxies from closing an idle event stream.
	streamPing = 15 * time.Second
	// streamMinGap spaces progress events to a few per second.
	streamMinGap = 250 * time.Millisecond
)

func importNotFound() api.Error {
	return newError(api.ErrorErrorCodeNotFound, "Import not found.")
}

// importOf loads the caller's import for one of the run routes: it parses the
// id and expires stale review imports. ok is false when the import does not
// exist for this user.
func (s *Server) importOf(ctx context.Context, uid int64, rawID string) (id int64, ok bool, err error) {
	id, ok = parseID(rawID)
	if !ok {
		return 0, false, nil
	}
	if _, err := s.imports.ExpireStale(ctx, uid, s.now()); err != nil {
		return 0, false, err
	}
	return id, true, nil
}

// StartImport implements POST /v1/imports/{id}/start.
func (s *Server) StartImport(ctx context.Context, req api.StartImportRequestObject) (api.StartImportResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.StartImport404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(importNotFound())}
	id, found, err := s.importOf(ctx, uid, req.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return notFound, nil
	}
	imp, err := s.runner.Start(ctx, uid, id)
	switch {
	case errors.Is(err, store.ErrNotFound):
		return notFound, nil
	case errors.Is(err, store.ErrImportInProgress):
		return api.StartImport409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeImportInProgress, "Another import is already running. Wait for it to finish or cancel it."))}, nil
	case errors.Is(err, store.ErrImportWrongStatus):
		return api.StartImport409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeImportWrongStatus, "Only an import that is in review can be started."))}, nil
	case err != nil:
		return nil, err
	}
	out, err := s.importResponse(ctx, uid, imp)
	if err != nil {
		return nil, err
	}
	return api.StartImport202JSONResponse(out), nil
}

// CancelImport implements POST /v1/imports/{id}/cancel.
func (s *Server) CancelImport(ctx context.Context, req api.CancelImportRequestObject) (api.CancelImportResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.CancelImport404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(importNotFound())}
	id, found, err := s.importOf(ctx, uid, req.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return notFound, nil
	}
	imp, err := s.runner.Cancel(ctx, uid, id)
	switch {
	case errors.Is(err, store.ErrNotFound):
		return notFound, nil
	case errors.Is(err, store.ErrImportWrongStatus):
		return api.CancelImport409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeImportWrongStatus, "Only a running import can be cancelled."))}, nil
	case err != nil:
		return nil, err
	}
	out, err := s.importResponse(ctx, uid, imp)
	if err != nil {
		return nil, err
	}
	return api.CancelImport200JSONResponse(out), nil
}

// UndoImport implements POST /v1/imports/{id}/undo.
func (s *Server) UndoImport(ctx context.Context, req api.UndoImportRequestObject) (api.UndoImportResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.UndoImport404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(importNotFound())}
	id, found, err := s.importOf(ctx, uid, req.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return notFound, nil
	}
	imp, err := s.imports.Rollback(ctx, uid, id, store.ImportCompleted, store.ImportUndone, nil)
	switch {
	case errors.Is(err, store.ErrNotFound):
		return notFound, nil
	case errors.Is(err, store.ErrImportWrongStatus):
		return api.UndoImport409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeImportWrongStatus, "Only a completed import can be undone."))}, nil
	case err != nil:
		return nil, err
	}
	out, err := s.importResponse(ctx, uid, imp)
	if err != nil {
		return nil, err
	}
	return api.UndoImport200JSONResponse(out), nil
}

// importProgress builds the progress of a running import: live figures from
// the runner, or just the stored count when no goroutine here owns it.
func (s *Server) importProgress(uid int64, imp store.Import) *api.ImportProgress {
	if run := s.runner.Find(uid, imp.ID); run != nil {
		return apiProgress(run.Progress())
	}
	return apiProgress(importrun.Progress{RowsDone: imp.RowsDone, RowsTotal: imp.RowsReady})
}

func apiProgress(p importrun.Progress) *api.ImportProgress {
	out := &api.ImportProgress{
		Status:       api.ImportStatus(store.ImportRunning),
		RowsDone:     p.RowsDone,
		RowsTotal:    p.RowsTotal,
		CurrentMonth: nullableOf(p.CurrentMonth),
		EtaSeconds:   nullableOf(p.ETASeconds),
		Years: []struct {
			RowsDone  int      `json:"rows_done"`
			RowsTotal int      `json:"rows_total"`
			Year      api.Year `json:"year"`
		}{},
	}
	for _, y := range p.Years {
		out.Years = append(out.Years, struct {
			RowsDone  int      `json:"rows_done"`
			RowsTotal int      `json:"rows_total"`
			Year      api.Year `json:"year"`
		}{RowsDone: y.RowsDone, RowsTotal: y.RowsTotal, Year: y.Year})
	}
	return out
}

// StreamImportEvents implements GET /v1/imports/{id}/events. The strict
// server cannot flush, so the response is written by eventStream.
func (s *Server) StreamImportEvents(ctx context.Context, req api.StreamImportEventsRequestObject) (api.StreamImportEventsResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.StreamImportEvents404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(importNotFound())}
	id, found, err := s.importOf(ctx, uid, req.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return notFound, nil
	}
	if _, err := s.imports.Get(ctx, uid, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return notFound, nil
		}
		return nil, err
	}
	return &eventStream{s: s, ctx: ctx, uid: uid, id: id}, nil
}

// eventStream is the text/event-stream response: `progress` events while the
// import runs, then one `finished` event with the final Import, then it closes.
type eventStream struct {
	s       *Server
	ctx     context.Context
	uid, id int64
}

func (e *eventStream) VisitStreamImportEventsResponse(w http.ResponseWriter) error {
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	rc := http.NewResponseController(w)

	send := func(event string, v any) error {
		data, err := json.Marshal(v)
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data); err != nil {
			return err
		}
		return rc.Flush()
	}
	finish := func() error {
		imp, err := e.s.imports.Get(context.WithoutCancel(e.ctx), e.uid, e.id)
		if err != nil {
			return err
		}
		out, err := e.s.importResponse(context.WithoutCancel(e.ctx), e.uid, imp)
		if err != nil {
			return err
		}
		return send("finished", out)
	}

	run := e.s.runner.Find(e.uid, e.id)
	if run == nil {
		return finish()
	}
	ping := time.NewTicker(streamPing)
	defer ping.Stop()
	for {
		changed := run.Changed() // before reading, so no update is missed
		p := run.Progress()
		if err := send("progress", apiProgress(p)); err != nil {
			return nil // client went away
		}
	wait:
		for {
			select {
			case <-changed:
				select { // throttle to a few events a second
				case <-time.After(streamMinGap):
				case <-run.Done():
				case <-e.ctx.Done():
					return nil
				}
				break wait
			case <-ping.C:
				if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
					return nil
				}
				if err := rc.Flush(); err != nil {
					return nil
				}
			case <-run.Done():
				if err := finish(); err != nil {
					return nil
				}
				return nil
			case <-e.ctx.Done():
				return nil
			}
		}
	}
}
