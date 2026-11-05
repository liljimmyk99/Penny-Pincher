import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { unwrap, type ApiClient } from "./client";
import { useApi } from "./context";
import { meQueryKey } from "./me";
import type { Schemas } from "./types";

/** Merchants, expenses and income entries: what the Add entries screen reads and writes. */

export const merchantSearchQueryKey = (q: string) => ["merchants", "search", q.toLowerCase()] as const;
export const merchantExpensesQueryKey = (merchantId: string) => ["expenses", "merchant", merchantId] as const;
export const monthIncomeQueryKey = (month: string) => ["income-entries", "month", month] as const;

const SUGGESTIONS = 8;
/** How many of a merchant's past expenses a refund can be linked to. */
const REFUND_CANDIDATES = 25;

/** Prefix search over the user's merchants. Disabled for an empty query. */
export function useMerchantSearch(q: string) {
  const api = useApi();
  const query = q.trim();
  return useQuery<Schemas["Merchant"][]>({
    queryKey: merchantSearchQueryKey(query),
    queryFn: ({ signal }) => searchMerchants(api, query, signal),
    enabled: query.length > 0,
    staleTime: 60_000,
  });
}

async function searchMerchants(api: ApiClient, q: string, signal?: AbortSignal) {
  const page = await unwrap(api.GET("/v1/merchants", { params: { query: { q, limit: SUGGESTIONS } }, signal }));
  return page.items;
}

/** The existing merchant with exactly this name (case-insensitive), if any. */
export async function findMerchant(qc: QueryClient, api: ApiClient, name: string) {
  const q = name.trim();
  if (!q) return null;
  const items = await qc.fetchQuery({
    queryKey: merchantSearchQueryKey(q),
    queryFn: ({ signal }) => searchMerchants(api, q, signal),
    staleTime: 60_000,
  });
  return items.find((m) => m.name.toLowerCase() === q.toLowerCase()) ?? null;
}

/** A merchant's most recent expenses (not refunds), newest first. */
export function useMerchantExpenses(merchantId: string | null) {
  const api = useApi();
  return useQuery<Schemas["Expense"][]>({
    queryKey: merchantExpensesQueryKey(merchantId ?? ""),
    queryFn: ({ signal }) => fetchMerchantExpenses(api, merchantId!, signal),
    enabled: merchantId !== null,
  });
}

async function fetchMerchantExpenses(api: ApiClient, merchantId: string, signal?: AbortSignal) {
  const page = await unwrap(
    api.GET("/v1/expenses", {
      params: { query: { merchant_id: merchantId, type: "expense", limit: REFUND_CANDIDATES } },
      signal,
    }),
  );
  return page.items;
}

/** The category of a merchant's latest expense, to prefill the next one. */
export async function lastCategoryFor(qc: QueryClient, api: ApiClient, merchantId: string) {
  const items = await qc.fetchQuery({
    queryKey: merchantExpensesQueryKey(merchantId),
    queryFn: ({ signal }) => fetchMerchantExpenses(api, merchantId, signal),
  });
  return items[0]?.category_id ?? null;
}

/** Every income entry in a month (the "so far" panel). */
export function useMonthIncome(month: string) {
  const api = useApi();
  return useQuery<Schemas["IncomeEntry"][]>({
    queryKey: monthIncomeQueryKey(month),
    queryFn: async ({ signal }) => {
      const items: Schemas["IncomeEntry"][] = [];
      let cursor: string | undefined;
      do {
        const page = await unwrap(
          api.GET("/v1/income-entries", { params: { query: { month, limit: 1000, cursor } }, signal }),
        );
        items.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      return items;
    },
  });
}

/** New entries change every total, so refetch everything except the signed-in user. */
function invalidateData(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] });
}

export function useEntryMutations() {
  const api = useApi();
  const qc = useQueryClient();
  const onSuccess = () => invalidateData(qc);

  const createExpenses = useMutation({
    mutationFn: async (items: Schemas["ExpenseCreate"][]) =>
      (await unwrap(api.POST("/v1/expenses/batch", { body: { items } }))).items,
    onSuccess,
  });
  const createIncome = useMutation({
    mutationFn: (body: Schemas["IncomeEntryCreate"]) => unwrap(api.POST("/v1/income-entries", { body })),
    onSuccess,
  });
  return { createExpenses, createIncome };
}
