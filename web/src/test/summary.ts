import type { Schemas } from "../api";

/** A month with nothing in it, as `GET /v1/summaries/monthly/{month}` returns it. */
export function emptySummary(month: string): Schemas["MonthlySummary"] {
  const none = { gross_cents: 0, gross_taxable_cents: 0, net_cents: 0, entry_count: 0 };
  return {
    month,
    income: { sources: [], combined: none },
    spending: { categories: [], total_cents: 0, saving_cents: 0, previous_month_total_cents: 0 },
    left_over_cents: 0,
    unconfirmed: { expense_count: 0, income_entry_count: 0 },
    template_applies: [],
    is_empty: true,
  };
}

/**
 * For tests that render the whole app on `/summary` but only care about the shell:
 * `/v1/me` gets `me`, the summary is empty, and every other list is empty.
 */
export function shellFetch(me: unknown) {
  return async (req: Request): Promise<Response> => {
    const path = new URL(req.url).pathname;
    if (path === "/v1/me") return Response.json(me);
    if (path === "/v1/admin/status") return Response.json(adminStatus());
    const month = /^\/v1\/summaries\/monthly\/(.+)$/.exec(path)?.[1];
    if (month) return Response.json(emptySummary(month));
    const year = /^\/v1\/summaries\/yearly\/(\d+)$/.exec(path)?.[1];
    if (year) return Response.json(emptyYearly(Number(year)));
    return Response.json({ items: [], next_cursor: null });
  };
}

/** A year with nothing in it, as `GET /v1/summaries/yearly/{year}` returns it. */
export function emptyYearly(year: number): Schemas["YearlySummary"] {
  return {
    year,
    months: Array.from({ length: 12 }, (_, i) => ({
      month: `${year}-${String(i + 1).padStart(2, "0")}`,
      gross_cents: 0,
      gross_taxable_cents: 0,
      net_cents: 0,
      spent_cents: 0,
      saving_cents: 0,
      left_over_cents: 0,
      has_entries: false,
    })),
    categories: [],
    totals: { gross_cents: 0, gross_taxable_cents: 0, net_cents: 0, spent_cents: 0, saving_cents: 0, left_over_cents: 0 },
    average_month_count: 0,
  };
}

/** A healthy `GET /v1/admin/status`, for tests that open the admin page. */
function adminStatus(): Schemas["AdminStatus"] {
  const at = "2026-11-01T10:00:00Z";
  return {
    version: "test",
    started_at: at,
    uptime_seconds: 60,
    database: { size_bytes: 4096, last_write_at: null },
    backups: {
      schedule: "Weekly on Sundays, monthly on the 1st",
      retention: { weekly: 8, monthly: 12 },
      last_run: null,
      next_weekly_at: at,
      next_monthly_at: at,
    },
    auth_provider: { status: "ok", checked_at: at },
  };
}
