package http

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/oapi-codegen/nullable"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const (
	msgExpenseNotFound      = "No such expense."
	msgInvalidRefundLink    = "A refund can only link to one of your expenses with a positive amount, and only a negative amount can be linked."
	msgExpenseLinkedRefunds = "This expense has linked refunds, so its amount can't be negative. Unlink or delete the refunds first."
)

// ListExpenses implements GET /v1/expenses.
func (s *Server) ListExpenses(ctx context.Context, req api.ListExpensesRequestObject) (api.ListExpensesResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	p := req.Params
	f := store.ExpenseFilter{Confirmed: p.Confirmed}
	if p.Month != nil {
		f.Month = *p.Month
	}
	if p.From != nil {
		f.From = p.From.String()
	}
	if p.To != nil {
		f.To = p.To.String()
	}
	if p.CategoryId != nil {
		id := idOrZero(*p.CategoryId)
		f.CategoryID = &id
	}
	if p.MerchantId != nil {
		id := idOrZero(*p.MerchantId)
		f.MerchantID = &id
	}
	if p.Type != nil {
		f.Type = string(*p.Type)
	}
	exps, next, err := s.expenses.List(ctx, uid, f, pageOf(p.Limit, p.Cursor))
	if status, e, ok := expenseError(err); ok && status == http.StatusBadRequest {
		return api.ListExpenses400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]api.Expense, len(exps))
	for i, exp := range exps {
		out[i] = toAPIExpense(exp)
	}
	return api.ListExpenses200JSONResponse{Items: out, NextCursor: cursorOf(next)}, nil
}

// CreateExpense implements POST /v1/expenses.
func (s *Server) CreateExpense(ctx context.Context, req api.CreateExpenseRequestObject) (api.CreateExpenseResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	exp, err := s.expenses.Create(ctx, uid, newExpenseFrom(*req.Body))
	if status, e, ok := expenseError(err); ok && status == http.StatusBadRequest {
		return api.CreateExpense400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.CreateExpense201JSONResponse(toAPIExpense(exp)), nil
}

// CreateExpensesBatch implements POST /v1/expenses/batch: all or nothing.
func (s *Server) CreateExpensesBatch(ctx context.Context, req api.CreateExpensesBatchRequestObject) (api.CreateExpensesBatchResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	items := req.Body.Items
	if len(items) == 0 || len(items) > 200 {
		e := validationError(&store.ValidationError{Field: "items", Issue: "must have between 1 and 200 items"})
		return api.CreateExpensesBatch400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	in := make([]store.NewExpense, len(items))
	for i, item := range items {
		in[i] = newExpenseFrom(item)
	}
	exps, err := s.expenses.CreateBatch(ctx, uid, in)
	if status, e, ok := expenseError(err); ok && status == http.StatusBadRequest {
		return api.CreateExpensesBatch400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]api.Expense, len(exps))
	for i, exp := range exps {
		out[i] = toAPIExpense(exp)
	}
	return api.CreateExpensesBatch201JSONResponse{Items: out}, nil
}

// GetExpense implements GET /v1/expenses/{id}.
func (s *Server) GetExpense(ctx context.Context, req api.GetExpenseRequestObject) (api.GetExpenseResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.GetExpense404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, msgExpenseNotFound))}
	id, ok := parseID(req.Id)
	if !ok {
		return notFound, nil
	}
	exp, err := s.expenses.Get(ctx, uid, id)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	return api.GetExpense200JSONResponse(toAPIExpense(exp)), nil
}

// UpdateExpense implements PATCH /v1/expenses/{id}.
func (s *Server) UpdateExpense(ctx context.Context, req api.UpdateExpenseRequestObject) (api.UpdateExpenseResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.UpdateExpense404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgExpenseNotFound))}, nil
	}
	b := req.Body
	p := store.ExpensePatch{
		AmountCents:          b.AmountCents,
		MerchantName:         b.MerchantName,
		SetNote:              b.Note.IsSpecified(),
		Note:                 ptrOf(b.Note),
		SetRefundedExpenseID: b.RefundedExpenseId.IsSpecified(),
		RefundedExpenseID:    linkID(b.RefundedExpenseId),
		Confirmed:            b.Confirmed,
	}
	if b.Date != nil {
		d := dateString(*b.Date)
		p.Date = &d
	}
	if b.CategoryId != nil {
		id := idOrZero(*b.CategoryId)
		p.CategoryID = &id
	}
	exp, err := s.expenses.Update(ctx, uid, id, p)
	if status, e, ok := expenseError(err); ok {
		switch status {
		case http.StatusBadRequest:
			return api.UpdateExpense400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.UpdateExpense404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.UpdateExpense409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.UpdateExpense200JSONResponse(toAPIExpense(exp)), nil
}

// DeleteExpense implements DELETE /v1/expenses/{id}.
func (s *Server) DeleteExpense(ctx context.Context, req api.DeleteExpenseRequestObject) (api.DeleteExpenseResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.DeleteExpense404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, msgExpenseNotFound))}
	id, ok := parseID(req.Id)
	if !ok {
		return notFound, nil
	}
	err := s.expenses.Delete(ctx, uid, id)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	return api.DeleteExpense204Response{}, nil
}

// expenseError maps a store error to an HTTP status and error body. A failing
// batch item has its fields prefixed with items[i]. ok is false for nil and
// for unexpected errors, which become 500.
func expenseError(err error) (int, api.Error, bool) {
	if err == nil {
		return 0, api.Error{}, false
	}
	prefix := ""
	var be *store.BatchItemError
	if errors.As(err, &be) {
		prefix = fmt.Sprintf("items[%d].", be.Index)
	}
	var ve *store.ValidationError
	switch {
	case errors.As(err, &ve):
		return http.StatusBadRequest, validationError(&store.ValidationError{Field: prefix + ve.Field, Issue: ve.Issue}), true
	case errors.Is(err, store.ErrInvalidRefundLink):
		e := newError(api.ErrorErrorCodeInvalidRefundLink, msgInvalidRefundLink)
		e.Error.Details = &[]struct {
			Field string `json:"field"`
			Issue string `json:"issue"`
		}{{Field: prefix + "refunded_expense_id", Issue: "must be one of your positive expenses, on a negative amount"}}
		return http.StatusBadRequest, e, true
	case errors.Is(err, store.ErrNotFound):
		return http.StatusNotFound, newError(api.ErrorErrorCodeNotFound, msgExpenseNotFound), true
	case errors.Is(err, store.ErrHasLinkedRefunds):
		return http.StatusConflict, newError(api.ErrorErrorCodeHasLinkedRefunds, msgExpenseLinkedRefunds), true
	}
	return 0, api.Error{}, false
}

func newExpenseFrom(b api.ExpenseCreate) store.NewExpense {
	return store.NewExpense{
		Date:              dateString(b.Date),
		AmountCents:       b.AmountCents,
		CategoryID:        idOrZero(b.CategoryId),
		MerchantName:      b.MerchantName,
		Note:              ptrOf(b.Note),
		RefundedExpenseID: linkID(b.RefundedExpenseId),
		Confirmed:         b.Confirmed == nil || *b.Confirmed,
	}
}

func toAPIExpense(exp store.Expense) api.Expense {
	typ := api.ExpenseType(exp.Type)
	var refunded, apply, imp *string
	if exp.RefundedExpenseID != nil {
		id := formatID(*exp.RefundedExpenseID)
		refunded = &id
	}
	if exp.TemplateApplyID != nil {
		id := formatID(*exp.TemplateApplyID)
		apply = &id
	}
	if exp.ImportID != nil {
		id := formatID(*exp.ImportID)
		imp = &id
	}
	var lastRefund *openapi_types.Date
	if exp.LastRefundDate != nil {
		lastRefund = &openapi_types.Date{Time: mustDate(*exp.LastRefundDate)}
	}
	return api.Expense{
		Id:                 formatID(exp.ID),
		Date:               openapi_types.Date{Time: mustDate(exp.Date)},
		AmountCents:        exp.AmountCents,
		Type:               &typ,
		CategoryId:         formatID(exp.CategoryID),
		Merchant:           toAPIMerchant(exp.Merchant),
		Note:               nullableOf(exp.Note),
		RefundedExpenseId:  nullableOf(refunded),
		RefundedTotalCents: &exp.RefundedTotalCents,
		LastRefundDate:     nullableOf(lastRefund),
		Confirmed:          exp.Confirmed,
		TemplateApplyId:    nullableOf(apply),
		ImportId:           nullableOf(imp),
		CreatedAt:          &exp.CreatedAt,
		UpdatedAt:          &exp.UpdatedAt,
	}
}

// linkID reads refunded_expense_id from a body: nil when null or omitted.
func linkID(n nullable.Nullable[string]) *int64 {
	raw := ptrOf(n)
	if raw == nil {
		return nil
	}
	id := idOrZero(*raw)
	return &id
}
