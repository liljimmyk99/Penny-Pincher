// Package importrun runs checked imports in the background: it writes the
// ready rows in batches, publishes progress for the stream and for getImport,
// and handles cancel. Undo and start-up recovery are plain store operations.
package importrun

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// DefaultBatchSize is how many rows each transaction writes.
const DefaultBatchSize = 200

const (
	reasonUnknownName = "A category or income source in the file no longer exists. Nothing from this file was kept."
	reasonWriteFailed = "The import could not be completed. Nothing from this file was kept."
)

// YearProgress is the per-year part of Progress.
type YearProgress struct {
	Year      int
	RowsDone  int
	RowsTotal int
}

// Progress is a snapshot of a running import.
type Progress struct {
	RowsDone     int
	RowsTotal    int     // ready rows only
	CurrentMonth *string // YYYY-MM of the latest row written; nil before the first batch
	ETASeconds   *int    // nil until the first batch is written
	Years        []YearProgress
}

// Options configure a Runner. Zero values use the defaults.
type Options struct {
	BatchSize int
	// AfterBatch, if set, runs in the import goroutine after each batch is
	// written and published. It is a test hook for pausing a run mid-way.
	AfterBatch func(importID int64)
}

// Runner owns the import goroutines of one API process.
type Runner struct {
	imports    store.Imports
	categories store.Categories
	sources    store.IncomeSources
	ctx        context.Context
	opts       Options

	mu   sync.Mutex
	runs map[int64]*Run
}

// New returns a Runner. ctx is the process lifetime: when it ends, running
// imports stop where they are, and RecoverRunning fails them at the next
// start-up.
func New(ctx context.Context, db *sql.DB, o Options) *Runner {
	if o.BatchSize <= 0 {
		o.BatchSize = DefaultBatchSize
	}
	return &Runner{
		imports:    store.Imports{DB: db},
		categories: store.Categories{DB: db},
		sources:    store.IncomeSources{DB: db},
		ctx:        ctx,
		opts:       o,
		runs:       map[int64]*Run{},
	}
}

// Run is one import being written. Its methods are safe for concurrent use.
type Run struct {
	userID, id int64
	started    time.Time

	cancelOnce sync.Once
	cancelCh   chan struct{}
	done       chan struct{}

	mu      sync.Mutex
	prog    Progress
	changed chan struct{}
}

// Progress returns the latest snapshot.
func (r *Run) Progress() Progress {
	r.mu.Lock()
	defer r.mu.Unlock()
	p := r.prog
	p.Years = append([]YearProgress(nil), p.Years...)
	return p
}

// Changed returns a channel that is closed at the next progress update.
// Fetch it before reading Progress so no update is missed.
func (r *Run) Changed() <-chan struct{} {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.changed
}

// Done is closed when the run has ended: completed, cancelled, failed, or
// stopped by process shutdown.
func (r *Run) Done() <-chan struct{} { return r.done }

func (r *Run) publish(update func(*Progress)) {
	r.mu.Lock()
	update(&r.prog)
	close(r.changed)
	r.changed = make(chan struct{})
	r.mu.Unlock()
}

// Find returns the user's active run for the import, or nil.
func (rn *Runner) Find(userID, id int64) *Run {
	rn.mu.Lock()
	defer rn.mu.Unlock()
	if r := rn.runs[id]; r != nil && r.userID == userID {
		return r
	}
	return nil
}

// Start moves the import from review to running and begins writing it in the
// background. The store's errors (ErrNotFound, ErrImportInProgress,
// ErrImportWrongStatus) pass through. If the file no longer matches the
// user's categories or income sources, the import ends failed, nothing is
// written, and that failed import is returned.
func (rn *Runner) Start(ctx context.Context, userID, id int64) (store.Import, error) {
	imp, err := rn.imports.Start(ctx, userID, id)
	if err != nil {
		return store.Import{}, err
	}
	fail := func(reason string) (store.Import, error) {
		return rn.imports.Rollback(context.WithoutCancel(ctx), userID, id, store.ImportRunning, store.ImportFailed, &reason)
	}
	rows, err := rn.imports.Rows(ctx, userID, id, true)
	if err != nil {
		_, _ = fail(reasonWriteFailed)
		return store.Import{}, err
	}
	resolved, err := rn.resolve(ctx, userID, rows)
	if errors.Is(err, errUnknownName) {
		return fail(reasonUnknownName)
	}
	if err != nil {
		_, _ = fail(reasonWriteFailed)
		return store.Import{}, err
	}

	run := &Run{
		userID: userID, id: id, started: time.Now(),
		cancelCh: make(chan struct{}), done: make(chan struct{}), changed: make(chan struct{}),
		prog: initialProgress(resolved),
	}
	rn.mu.Lock()
	rn.runs[id] = run
	rn.mu.Unlock()
	go rn.exec(run, resolved)
	return imp, nil
}

// Cancel stops a running import after its current batch, deletes everything it
// added and returns the cancelled import. An import that is not running
// (including one that finished meanwhile) is ErrImportWrongStatus.
func (rn *Runner) Cancel(ctx context.Context, userID, id int64) (store.Import, error) {
	imp, err := rn.imports.Get(ctx, userID, id)
	if err != nil {
		return store.Import{}, err
	}
	if imp.Status != store.ImportRunning {
		return store.Import{}, store.ErrImportWrongStatus
	}
	run := rn.Find(userID, id)
	if run == nil {
		// Marked running but no goroutine here; nothing is writing it.
		return rn.imports.Rollback(ctx, userID, id, store.ImportRunning, store.ImportCancelled, nil)
	}
	run.cancelOnce.Do(func() { close(run.cancelCh) })
	select {
	case <-run.done:
	case <-ctx.Done():
		return store.Import{}, ctx.Err()
	}
	imp, err = rn.imports.Get(ctx, userID, id)
	if err != nil {
		return store.Import{}, err
	}
	if imp.Status != store.ImportCancelled {
		return store.Import{}, store.ErrImportWrongStatus
	}
	return imp, nil
}

var errUnknownName = errors.New("unknown category or source")

func (rn *Runner) resolve(ctx context.Context, userID int64, rows []store.ImportRow) ([]store.ResolvedImportRow, error) {
	cats, err := rn.categories.List(ctx, userID)
	if err != nil {
		return nil, err
	}
	srcs, err := rn.sources.List(ctx, userID)
	if err != nil {
		return nil, err
	}
	catID := make(map[string]int64, len(cats))
	for _, c := range cats {
		catID[strings.ToLower(c.Name)] = c.ID
	}
	srcID := make(map[string]int64, len(srcs))
	for _, s := range srcs {
		srcID[strings.ToLower(s.Name)] = s.ID
	}
	out := make([]store.ResolvedImportRow, 0, len(rows))
	for _, r := range rows {
		if r.Date == nil {
			return nil, errUnknownName
		}
		x := store.ResolvedImportRow{Sheet: r.Sheet, Date: *r.Date, Note: r.Note}
		if r.Sheet == store.SheetIncome {
			if r.Source == nil || r.Gross == nil || r.Taxable == nil || r.Net == nil {
				return nil, errUnknownName
			}
			id, ok := srcID[strings.ToLower(*r.Source)]
			if !ok {
				return nil, errUnknownName
			}
			x.SourceID, x.Gross, x.Taxable, x.Net = id, *r.Gross, *r.Taxable, *r.Net
		} else {
			if r.Category == nil || r.Merchant == nil || r.Amount == nil {
				return nil, errUnknownName
			}
			id, ok := catID[strings.ToLower(*r.Category)]
			if !ok {
				return nil, errUnknownName
			}
			x.CategoryID, x.Merchant, x.Amount = id, *r.Merchant, *r.Amount
		}
		out = append(out, x)
	}
	return out, nil
}

func yearOf(date string) int {
	y, _ := strconv.Atoi(date[:4])
	return y
}

func initialProgress(rows []store.ResolvedImportRow) Progress {
	p := Progress{RowsTotal: len(rows), Years: []YearProgress{}}
	for _, r := range rows { // rows are oldest first, so years come out in order
		y := yearOf(r.Date)
		if n := len(p.Years); n == 0 || p.Years[n-1].Year != y {
			p.Years = append(p.Years, YearProgress{Year: y})
		}
		p.Years[len(p.Years)-1].RowsTotal++
	}
	return p
}

func (rn *Runner) exec(run *Run, rows []store.ResolvedImportRow) {
	defer func() {
		rn.mu.Lock()
		delete(rn.runs, run.id)
		rn.mu.Unlock()
		close(run.done)
	}()
	fail := func() {
		reason := reasonWriteFailed
		_, _ = rn.imports.Rollback(context.WithoutCancel(rn.ctx), run.userID, run.id,
			store.ImportRunning, store.ImportFailed, &reason)
	}
	cancelled := func() bool {
		select {
		case <-run.cancelCh:
			_, _ = rn.imports.Rollback(context.WithoutCancel(rn.ctx), run.userID, run.id,
				store.ImportRunning, store.ImportCancelled, nil)
			return true
		default:
			return false
		}
	}

	for i := 0; i < len(rows); i += rn.opts.BatchSize {
		if cancelled() || rn.ctx.Err() != nil {
			return
		}
		end := min(i+rn.opts.BatchSize, len(rows))
		batch := rows[i:end]
		err := rn.imports.WriteBatch(rn.ctx, run.userID, run.id, batch)
		if rn.ctx.Err() != nil || errors.Is(err, store.ErrImportWrongStatus) {
			return // shutting down (recovery fails it), or someone else ended it
		}
		if err != nil {
			fail()
			return
		}
		rn.advance(run, batch, end, len(rows))
		if rn.opts.AfterBatch != nil {
			rn.opts.AfterBatch(run.id)
		}
	}
	if cancelled() || rn.ctx.Err() != nil {
		return
	}
	if _, err := rn.imports.Complete(rn.ctx, run.userID, run.id); err != nil &&
		!errors.Is(err, store.ErrImportWrongStatus) && rn.ctx.Err() == nil {
		fail()
	}
}

func (rn *Runner) advance(run *Run, batch []store.ResolvedImportRow, done, total int) {
	month := batch[len(batch)-1].Date[:7]
	eta := int(time.Since(run.started).Seconds() / float64(done) * float64(total-done))
	run.publish(func(p *Progress) {
		p.RowsDone = done
		p.CurrentMonth = &month
		p.ETASeconds = &eta
		for _, r := range batch {
			y := yearOf(r.Date)
			for i := range p.Years {
				if p.Years[i].Year == y {
					p.Years[i].RowsDone++
				}
			}
		}
	})
}
