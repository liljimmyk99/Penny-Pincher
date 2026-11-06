package http

import (
	"context"
	"net/http"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// sized returns a zeroed slice of n elements of s's type. The generated
// summary types use anonymous element structs that can't be named here.
func sized[T any](_ []T, n int) []T { return make([]T, n) }

// GetMonthlySummary implements GET /v1/summaries/monthly/{month}.
func (s *Server) GetMonthlySummary(ctx context.Context, req api.GetMonthlySummaryRequestObject) (api.GetMonthlySummaryResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	sum, err := s.summaries.Monthly(ctx, uid, req.Month)
	if status, e, ok := categoryError(err); ok && status == http.StatusBadRequest {
		return api.GetMonthlySummary400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	applies, err := s.months.ListApplies(ctx, uid, req.Month)
	if err != nil {
		return nil, err
	}

	var out api.MonthlySummary
	out.Month = sum.Month
	out.Income.Combined = toAPIIncomeTotals(sum.Combined)
	out.Income.Sources = sized(out.Income.Sources, len(sum.Sources))
	for i, r := range sum.Sources {
		o := &out.Income.Sources[i]
		o.IncomeSourceId = formatID(r.IncomeSourceID)
		o.Name = r.Name
		o.IsProtected = r.IsProtected
		o.EntryCount = r.EntryCount
		o.GrossCents = r.GrossCents
		o.GrossTaxableCents = r.GrossTaxableCents
		o.NetCents = r.NetCents
	}
	out.Spending.Categories = sized(out.Spending.Categories, len(sum.Categories))
	for i, r := range sum.Categories {
		o := &out.Spending.Categories[i]
		o.CategoryId = formatID(r.CategoryID)
		o.Name = r.Name
		o.Color = nullableOf(r.Color)
		o.IsSaving = r.IsSaving
		o.IsProtected = r.IsProtected
		o.TotalCents = r.TotalCents
		o.ExpenseCount = r.ExpenseCount
		o.RefundCount = r.RefundCount
		o.PreviousMonthTotalCents = r.PreviousTotalCents
	}
	out.Spending.TotalCents = sum.SpentCents
	out.Spending.SavingCents = sum.SavingCents
	out.Spending.PreviousMonthTotalCents = sum.PreviousMonthSpentCents
	out.LeftOverCents = sum.LeftOverCents
	out.Unconfirmed.ExpenseCount = sum.UnconfirmedExpenseCount
	out.Unconfirmed.IncomeEntryCount = sum.UnconfirmedIncomeEntryCount
	out.TemplateApplies = make([]api.TemplateApply, len(applies))
	for i, a := range applies {
		out.TemplateApplies[i] = toAPITemplateApply(a)
	}
	out.IsEmpty = sum.IsEmpty
	return api.GetMonthlySummary200JSONResponse(out), nil
}

// GetYearlySummary implements GET /v1/summaries/yearly/{year}.
func (s *Server) GetYearlySummary(ctx context.Context, req api.GetYearlySummaryRequestObject) (api.GetYearlySummaryResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	sum, err := s.summaries.Yearly(ctx, uid, req.Year)
	if status, e, ok := categoryError(err); ok && status == http.StatusBadRequest {
		return api.GetYearlySummary400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}

	var out api.YearlySummary
	out.Year = sum.Year
	out.AverageMonthCount = sum.AverageMonthCount
	out.Months = make([]api.MonthTotals, len(sum.Months))
	for i, m := range sum.Months {
		out.Months[i] = api.MonthTotals{
			Month: m.Month, GrossCents: m.GrossCents, GrossTaxableCents: m.GrossTaxableCents,
			NetCents: m.NetCents, SpentCents: m.SpentCents, SavingCents: m.SavingCents,
			LeftOverCents: m.LeftOverCents, HasEntries: m.HasEntries,
		}
	}
	out.Categories = sized(out.Categories, len(sum.Categories))
	for i, r := range sum.Categories {
		o := &out.Categories[i]
		o.CategoryId = formatID(r.CategoryID)
		o.Name = r.Name
		o.Color = nullableOf(r.Color)
		o.IsSaving = r.IsSaving
		o.IsProtected = r.IsProtected
		o.TotalCents = r.TotalCents
		o.MonthlyAverageCents = r.MonthlyAverageCents
	}
	t := sum.Totals
	out.Totals.GrossCents, out.Totals.GrossTaxableCents, out.Totals.NetCents = t.GrossCents, t.GrossTaxableCents, t.NetCents
	out.Totals.SpentCents, out.Totals.SavingCents, out.Totals.LeftOverCents = t.SpentCents, t.SavingCents, t.LeftOverCents
	return api.GetYearlySummary200JSONResponse(out), nil
}

func toAPIIncomeTotals(t store.IncomeTotals) api.IncomeTotals {
	return api.IncomeTotals{
		EntryCount: t.EntryCount, GrossCents: t.GrossCents,
		GrossTaxableCents: t.GrossTaxableCents, NetCents: t.NetCents,
	}
}
