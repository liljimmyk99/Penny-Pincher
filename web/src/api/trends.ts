import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "./client";
import { useApi } from "./context";
import type { Schemas } from "./types";

/** Saved trends and the custom trend series behind them (root AGENTS.md §6.11). */

export const savedTrendsQueryKey = ["saved-trends"] as const;

/** The period a trend is charted over (`YYYY-MM-DD` bounds, grouped by month). */
export interface TrendRange {
  from: string;
  to: string;
}

type Definition = Pick<Schemas["SavedTrend"], "match_type" | "merchant_id" | "category_id" | "match_text">;

/** The filter the API wants for a saved trend's one matching field. */
function filterOf(t: Definition) {
  if (t.match_type === "merchant" && t.merchant_id) return { merchant_id: t.merchant_id };
  if (t.match_type === "category" && t.category_id) return { category_id: t.category_id };
  if (t.match_type === "note" && t.match_text) return { text: t.match_text };
  return null;
}

export const customTrendQueryKey = (t: Definition, range: TrendRange) =>
  ["trends", "custom", filterOf(t), range.from, range.to] as const;

export function useSavedTrends() {
  const api = useApi();
  return useQuery<Schemas["SavedTrend"][]>({
    queryKey: savedTrendsQueryKey,
    queryFn: async ({ signal }) => (await unwrap(api.GET("/v1/saved-trends", { signal }))).items,
  });
}

/** Both measures per month over `range`, zero-filled. */
export function useCustomTrend(trend: Definition, range: TrendRange) {
  const api = useApi();
  const filter = filterOf(trend);
  return useQuery<Schemas["CustomTrend"]>({
    queryKey: customTrendQueryKey(trend, range),
    enabled: filter !== null,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET("/v1/trends/custom", {
          params: { query: { ...filter, from: range.from, to: range.to, group_by: "month" } },
          signal,
        }),
      ),
  });
}

export function useSavedTrendMutations() {
  const api = useApi();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (body: Schemas["SavedTrendCreate"]) => unwrap(api.POST("/v1/saved-trends", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedTrendsQueryKey }),
  });
  return { create };
}

export const categoryTrendsQueryKey = (year: number) => ["trends", "by-category", year] as const;

/** Twelve monthly totals for `year` and `year - 1`, per category and all spending. */
export function useCategoryTrends(year: number) {
  const api = useApi();
  return useQuery<Schemas["CategoryTrends"]>({
    queryKey: categoryTrendsQueryKey(year),
    queryFn: ({ signal }) => unwrap(api.GET("/v1/trends/by-category", { params: { query: { year } }, signal })),
  });
}
