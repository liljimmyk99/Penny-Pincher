package store

import (
	"context"
	"strings"
	"testing"
)

func TestMerchantsAutocomplete(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	for _, name := range []string{"Corner Cafe", "corn market", "Bakery", "100% Juice", "A_B Store", "AxB Store"} {
		f.add(f.a, f.in(f.a, "2026-03-01", 100, name))
	}
	f.add(f.b, f.in(f.b, "2026-03-01", 100, "Corner Shop")) // B's, never shown to A

	names := func(prefix string, page Page) (string, string) {
		t.Helper()
		out, next, err := f.m.List(ctx, f.a, prefix, page)
		if err != nil {
			t.Fatal(err)
		}
		var n []string
		for _, m := range out {
			n = append(n, m.Name)
		}
		return strings.Join(n, ","), next
	}
	for prefix, want := range map[string]string{
		"":      "100% Juice,A_B Store,AxB Store,Bakery,corn market,Corner Cafe",
		"CORN":  "corn market,Corner Cafe",
		"corne": "Corner Cafe",
		"100%":  "100% Juice", // wildcards match literally
		"%":     "",
		"A_":    "A_B Store",
		"zzz":   "",
	} {
		if got, next := names(prefix, Page{}); got != want || next != "" {
			t.Errorf("q=%q: %s (next %q), want %s", prefix, got, next, want)
		}
	}

	// Pages follow the same order.
	var got []string
	page := Page{Limit: 4}
	for {
		n, next := names("", page)
		got = append(got, n)
		if next == "" {
			break
		}
		page.Cursor = next
	}
	if s := strings.Join(got, "|"); s != "100% Juice,A_B Store,AxB Store,Bakery|corn market,Corner Cafe" {
		t.Fatalf("pages = %s", s)
	}

	if out, _, err := f.m.List(ctx, f.b, "", Page{}); err != nil || len(out) != 1 || out[0].Name != "Corner Shop" {
		t.Fatalf("B's merchants = %+v, %v", out, err)
	}
	_, _, err := f.m.List(ctx, f.a, "", Page{Cursor: "%%%"})
	wantValidation(t, err, "cursor")
}
