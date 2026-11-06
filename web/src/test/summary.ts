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
    const month = /^\/v1\/summaries\/monthly\/(.+)$/.exec(path)?.[1];
    if (month) return Response.json(emptySummary(month));
    return Response.json({ items: [], next_cursor: null });
  };
}
