package backup

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// Schedule times, UTC. Weekly runs on Sundays, monthly on the 1st.
const runHour = 3

// due reports which scheduled kinds should have a snapshot for now's UTC day
// and run hour has passed, given the snapshots that already exist. Deciding
// from the bucket (not memory) means a restart never double-runs or skips.
func (s *Service) due(ctx context.Context, now time.Time) ([]Kind, error) {
	now = now.UTC()
	if now.Hour() < runHour {
		return nil, nil
	}
	var kinds []Kind
	if now.Weekday() == time.Sunday {
		kinds = append(kinds, Weekly)
	}
	if now.Day() == 1 {
		kinds = append(kinds, Monthly)
	}
	var out []Kind
	for _, k := range kinds {
		objs, err := s.List(ctx, k)
		if err != nil {
			return nil, err
		}
		if len(objs) == 0 || !sameDay(objs[0].Time, now) {
			out = append(out, k)
		}
	}
	return out, nil
}

func sameDay(a, b time.Time) bool {
	ay, am, ad := a.UTC().Date()
	by, bm, bd := b.UTC().Date()
	return ay == by && am == bm && ad == bd
}

// RunScheduled checks every interval whether a weekly or monthly snapshot is
// due and takes it, until ctx ends. Failures are logged (without data) and
// retried on the next tick.
func (s *Service) RunScheduled(ctx context.Context, interval time.Duration, log *slog.Logger) {
	tick := func() {
		kinds, err := s.due(ctx, s.now())
		if err != nil {
			log.Error("backup schedule check failed", "err_type", errType(err))
			return
		}
		for _, k := range kinds {
			if _, err := s.Run(ctx, k); err != nil {
				log.Error("backup failed", "kind", string(k), "err_type", errType(err))
				continue
			}
			log.Info("backup done", "kind", string(k))
		}
	}
	tick()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			tick()
		}
	}
}

func errType(err error) string { return typeName(err) }

func typeName(err error) string { return fmt.Sprintf("%T", err) }

// ScheduleText describes the schedule for the admin panel.
const ScheduleText = "Weekly on Sundays, monthly on the 1st (03:00 UTC)"

// NextWeekly is the next Sunday run time strictly after now (UTC).
func NextWeekly(now time.Time) time.Time {
	now = now.UTC()
	t := time.Date(now.Year(), now.Month(), now.Day(), runHour, 0, 0, 0, time.UTC)
	t = t.AddDate(0, 0, (7-int(t.Weekday()))%7)
	if !t.After(now) {
		t = t.AddDate(0, 0, 7)
	}
	return t
}

// NextMonthly is the next run time on the 1st strictly after now (UTC).
func NextMonthly(now time.Time) time.Time {
	now = now.UTC()
	t := time.Date(now.Year(), now.Month(), 1, runHour, 0, 0, 0, time.UTC)
	if !t.After(now) {
		t = t.AddDate(0, 1, 0)
	}
	return t
}
