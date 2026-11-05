package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

func (a *testAPI) categories(token string) []api.Category {
	a.t.Helper()
	rec := a.call("GET", "/v1/categories", token, "")
	if rec.Code != http.StatusOK {
		a.t.Fatalf("list status = %d (%s)", rec.Code, rec.Body)
	}
	var body struct{ Items []api.Category }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		a.t.Fatal(err)
	}
	return body.Items
}

func (a *testAPI) category(token, name string) api.Category {
	a.t.Helper()
	for _, c := range a.categories(token) {
		if c.Name == name {
			return c
		}
	}
	a.t.Fatalf("no category %q", name)
	return api.Category{}
}

func decodeCategory(t *testing.T, body []byte) (api.Category, map[string]any) {
	t.Helper()
	var c api.Category
	var raw map[string]any
	if err := json.Unmarshal(body, &c); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatal(err)
	}
	return c, raw
}

func TestListCategoriesHTTP(t *testing.T) {
	a := newTestAPI(t)
	rec := a.call("GET", "/v1/categories", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct{ Items []map[string]any }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 8 {
		t.Fatalf("items = %d", len(body.Items))
	}
	first, last := body.Items[0], body.Items[7]
	if first["name"] != "Saving" || first["is_saving"] != true || first["is_protected"] != false {
		t.Fatalf("first = %v", first)
	}
	if last["name"] != "Other" || last["is_protected"] != true {
		t.Fatalf("last = %v", last)
	}
	// Every required field is present; a missing colour is JSON null, not "".
	for _, k := range []string{"id", "name", "color", "is_saving", "is_protected", "sort_order", "created_at", "updated_at"} {
		if _, ok := first[k]; !ok {
			t.Errorf("missing %q in %v", k, first)
		}
	}
	if first["color"] != nil {
		t.Fatalf("color = %#v, want null", first["color"])
	}
	if _, ok := first["id"].(string); !ok {
		t.Fatalf("id is not a string: %#v", first["id"])
	}
}

func TestCreateCategoryHTTP(t *testing.T) {
	a := newTestAPI(t)
	rec := a.call("POST", "/v1/categories", tokMember, `{"name":" Pets ","color":"#2F80ED","is_saving":true}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	c, _ := decodeCategory(t, rec.Body.Bytes())
	if c.Name != "Pets" || c.Color.MustGet() != "#2F80ED" || !c.IsSaving || *c.IsProtected {
		t.Fatalf("created = %+v", c)
	}
	names := a.categories(tokMember)
	if names[len(names)-2].Name != "Pets" || names[len(names)-1].Name != "Other" {
		t.Fatalf("Pets not placed before Other")
	}
	rec = a.call("POST", "/v1/categories", tokMember, `{"name":"Gifts","color":null}`)
	if c, raw := decodeCategory(t, rec.Body.Bytes()); rec.Code != http.StatusCreated || raw["color"] != nil || c.IsSaving {
		t.Fatalf("null colour create = %d %s", rec.Code, rec.Body)
	}

	wantError(t, a.call("POST", "/v1/categories", tokMember, `{"name":"pets"}`), http.StatusConflict, api.ErrorErrorCodeNameTaken)
	wantError(t, a.call("POST", "/v1/categories", tokMember, `{"name":""}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("POST", "/v1/categories", tokMember, `{"name":"X","color":"blue"}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("POST", "/v1/categories", tokMember, `{"name":`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("POST", "/v1/categories", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	// Validation errors name the field.
	rec = a.call("POST", "/v1/categories", tokMember, `{"name":"X","color":"blue"}`)
	var e api.Error
	json.Unmarshal(rec.Body.Bytes(), &e)
	if e.Error.Details == nil || (*e.Error.Details)[0].Field != "color" {
		t.Fatalf("details = %s", rec.Body)
	}

	// The admin's list is unaffected by the member's create.
	for _, c := range a.categories(tokAdmin) {
		if c.Name == "Pets" || c.Name == "Gifts" {
			t.Fatalf("member's category visible to admin")
		}
	}
}

func TestUpdateCategoryHTTP(t *testing.T) {
	a := newTestAPI(t)
	food := a.category(tokMember, "Food")
	path := "/v1/categories/" + food.Id

	rec := a.call("PATCH", path, tokMember, `{"name":"Groceries","color":"#00AA00"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	c, _ := decodeCategory(t, rec.Body.Bytes())
	if c.Name != "Groceries" || c.Color.MustGet() != "#00AA00" || c.Id != food.Id {
		t.Fatalf("updated = %+v", c)
	}
	// Omitting color keeps it; null clears it.
	rec = a.call("PATCH", path, tokMember, `{"is_saving":true}`)
	if c, _ := decodeCategory(t, rec.Body.Bytes()); rec.Code != http.StatusOK || c.Color.MustGet() != "#00AA00" || !c.IsSaving {
		t.Fatalf("flag only = %d %s", rec.Code, rec.Body)
	}
	rec = a.call("PATCH", path, tokMember, `{"color":null}`)
	if _, raw := decodeCategory(t, rec.Body.Bytes()); rec.Code != http.StatusOK || raw["color"] != nil {
		t.Fatalf("clear = %d %s", rec.Code, rec.Body)
	}

	wantError(t, a.call("PATCH", path, tokMember, `{"name":"HOUSING"}`), http.StatusConflict, api.ErrorErrorCodeNameTaken)
	wantError(t, a.call("PATCH", path, tokMember, `{}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("PATCH", path, tokMember, `{"name":"  "}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("PATCH", path, tokMember, `{"color":"#12"}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("PATCH", "/v1/categories/9999", tokMember, `{"name":"X"}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("PATCH", "/v1/categories/abc", tokMember, `{"name":"X"}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
}

func TestOtherCategoryProtectedHTTP(t *testing.T) {
	a := newTestAPI(t)
	other := a.category(tokMember, "Other")
	path := "/v1/categories/" + other.Id
	for _, body := range []string{`{"name":"Misc"}`, `{"name":"Other"}`, `{"is_saving":true}`, `{"name":"Misc","color":"#111111"}`} {
		wantError(t, a.call("PATCH", path, tokMember, body), http.StatusConflict, api.ErrorErrorCodeProtectedResource)
	}
	wantError(t, a.call("DELETE", path, tokMember, ""), http.StatusConflict, api.ErrorErrorCodeProtectedResource)

	rec := a.call("PATCH", path, tokMember, `{"color":"#999999"}`)
	if c, _ := decodeCategory(t, rec.Body.Bytes()); rec.Code != http.StatusOK || c.Name != "Other" || c.Color.MustGet() != "#999999" {
		t.Fatalf("recolor = %d %s", rec.Code, rec.Body)
	}
	if got := a.category(tokMember, "Other"); got.Id != other.Id || !*got.IsProtected {
		t.Fatalf("Other = %+v", got)
	}
}

func TestReorderCategoriesHTTP(t *testing.T) {
	a := newTestAPI(t)
	cats := a.categories(tokMember)
	var ids []string
	for i := len(cats) - 1; i >= 0; i-- {
		ids = append(ids, fmt.Sprintf("%q", cats[i].Id))
	}
	rec := a.call("PUT", "/v1/categories/order", tokMember, `{"ids":[`+strings.Join(ids, ",")+`]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var body struct{ Items []api.Category }
	json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Items) != 8 || body.Items[0].Name != "Other" || body.Items[7].Name != "Saving" {
		t.Fatalf("reordered = %s", rec.Body)
	}
	if got := a.categories(tokMember); got[0].Name != "Other" {
		t.Fatalf("not persisted")
	}

	adminFood := a.category(tokAdmin, "Food")
	for _, bad := range []string{
		`{"ids":[` + strings.Join(ids[1:], ",") + `]}`,                               // missing one
		`{"ids":[` + strings.Join(append(ids[1:], ids[1]), ",") + `]}`,               // repeated
		`{"ids":[` + strings.Join(append(ids[1:], `"abc"`), ",") + `]}`,              // not an id
		`{"ids":[` + strings.Join(append(ids[1:], `"`+adminFood.Id+`"`), ",") + `]}`, // another user's
		`{"ids":[]}`,
		`{}`,
	} {
		wantError(t, a.call("PUT", "/v1/categories/order", tokMember, bad), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	}
	if got := a.categories(tokMember); got[0].Name != "Other" {
		t.Fatalf("rejected reorder changed the order")
	}
	if got := a.categories(tokAdmin); got[0].Name != "Saving" {
		t.Fatalf("admin's order changed")
	}
}

func TestDeleteCategoryHTTP(t *testing.T) {
	a := newTestAPI(t)
	food, other := a.category(tokMember, "Food"), a.category(tokMember, "Other")
	var uid int64
	a.db.QueryRow(`SELECT id FROM users WHERE firebase_uid = 'uid-member'`).Scan(&uid)
	res, _ := a.db.Exec(`INSERT INTO merchants (user_id, name) VALUES (?, 'Shop')`, uid)
	merchant, _ := res.LastInsertId()
	res, err := a.db.Exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents) VALUES (?, ?, ?, '2026-03-01', 1234)`, uid, food.Id, merchant)
	if err != nil {
		t.Fatal(err)
	}
	exp, _ := res.LastInsertId()

	rec := a.call("DELETE", "/v1/categories/"+food.Id, tokMember, "")
	if rec.Code != http.StatusNoContent || rec.Body.Len() != 0 {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var cat string
	a.db.QueryRow(`SELECT category_id FROM expenses WHERE id = ?`, exp).Scan(&cat)
	if cat != other.Id {
		t.Fatalf("expense category = %s, want Other (%s)", cat, other.Id)
	}
	if len(a.categories(tokMember)) != 7 {
		t.Fatal("category not deleted")
	}
	wantError(t, a.call("DELETE", "/v1/categories/"+food.Id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("DELETE", "/v1/categories/abc", tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
}

func TestCategoriesTenancyHTTP(t *testing.T) {
	a := newTestAPI(t)
	adminFood, adminOther := a.category(tokAdmin, "Food"), a.category(tokAdmin, "Other")
	for _, id := range []string{adminFood.Id, adminOther.Id} {
		wantError(t, a.call("PATCH", "/v1/categories/"+id, tokMember, `{"color":"#000000"}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
		wantError(t, a.call("DELETE", "/v1/categories/"+id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	}
	for _, c := range a.categories(tokMember) {
		if c.Id == adminFood.Id || c.Id == adminOther.Id {
			t.Fatal("admin's category listed for member")
		}
	}
	if got := a.category(tokAdmin, "Food"); got.Color.IsSpecified() && !got.Color.IsNull() {
		t.Fatalf("admin's category changed: %+v", got)
	}
	if len(a.categories(tokAdmin)) != 8 {
		t.Fatal("admin's categories changed")
	}
}

func TestCategoriesNeedAuth(t *testing.T) {
	a := newTestAPI(t)
	wantError(t, a.call("GET", "/v1/categories", "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
	wantError(t, a.call("POST", "/v1/categories", tokStray, `{"name":"X"}`), http.StatusForbidden, api.ErrorErrorCodeNotAllowlisted)
}
