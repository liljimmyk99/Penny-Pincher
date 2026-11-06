import { useQuery } from "@tanstack/react-query";
import { unwrap } from "./client";
import { useApi } from "./context";
import type { Schemas } from "./types";

/** Server-computed summaries (root AGENTS.md §6.10). */

export const monthlySummaryQueryKey = (month: string) => ["summaries", "monthly", month] as const;

/** One month's income per source, spending per category and left over, zero-filled. */
export function useMonthlySummary(month: string) {
  const api = useApi();
  return useQuery<Schemas["MonthlySummary"]>({
    queryKey: monthlySummaryQueryKey(month),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/v1/summaries/monthly/{month}", { params: { path: { month } }, signal })),
  });
}

export const yearlySummaryQueryKey = (year: number) => ["summaries", "yearly", year] as const;

/** One year's twelve months, category totals and averages, zero-filled. */
export function useYearlySummary(year: number) {
  const api = useApi();
  return useQuery<Schemas["YearlySummary"]>({
    queryKey: yearlySummaryQueryKey(year),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/v1/summaries/yearly/{year}", { params: { path: { year } }, signal })),
  });
}
