import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { unwrap } from "./client";
import { useApi } from "./context";
import { meQueryKey } from "./me";
import type { Schemas } from "./types";

/**
 * Categories and income sources: the lists, their per-year stats, and the
 * mutations behind the Categories & sources screen.
 */

export const categoriesQueryKey = ["categories"] as const;
export const categoryStatsQueryKey = (year: number) => ["categories", "stats", year] as const;
export const incomeSourcesQueryKey = ["income-sources"] as const;
export const incomeSourceStatsQueryKey = (year: number) => ["income-sources", "stats", year] as const;

export function useCategories() {
  const api = useApi();
  return useQuery<Schemas["Category"][]>({
    queryKey: categoriesQueryKey,
    queryFn: async ({ signal }) => (await unwrap(api.GET("/v1/categories", { signal }))).items,
  });
}

export function useCategoryStats(year: number) {
  const api = useApi();
  return useQuery<Schemas["CategoryStats"][]>({
    queryKey: categoryStatsQueryKey(year),
    queryFn: async ({ signal }) =>
      (await unwrap(api.GET("/v1/categories/stats", { params: { query: { year } }, signal }))).items,
  });
}

export function useIncomeSources() {
  const api = useApi();
  return useQuery<Schemas["IncomeSource"][]>({
    queryKey: incomeSourcesQueryKey,
    queryFn: async ({ signal }) => (await unwrap(api.GET("/v1/income-sources", { signal }))).items,
  });
}

export function useIncomeSourceStats(year: number) {
  const api = useApi();
  return useQuery<Schemas["IncomeSourceStats"][]>({
    queryKey: incomeSourceStatsQueryKey(year),
    queryFn: async ({ signal }) =>
      (await unwrap(api.GET("/v1/income-sources/stats", { params: { query: { year } }, signal }))).items,
  });
}

/**
 * Deleting a category moves expenses and template items to Other, so every
 * cached total may be stale. Refetch everything except the signed-in user.
 */
function invalidateData(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] });
}

export function useCategoryMutations() {
  const api = useApi();
  const qc = useQueryClient();
  const onSuccess = () => invalidateData(qc);

  const create = useMutation({
    mutationFn: (name: string) => unwrap(api.POST("/v1/categories", { body: { name, is_saving: false } })),
    onSuccess,
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      unwrap(api.PATCH("/v1/categories/{id}", { params: { path: { id } }, body: { name } })),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/v1/categories/{id}", { params: { path: { id } } })),
    onSuccess,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => unwrap(api.PUT("/v1/categories/order", { body: { ids } })),
    // Show the new order at once; put the old one back if the server refuses.
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: categoriesQueryKey });
      const before = qc.getQueryData<Schemas["Category"][]>(categoriesQueryKey);
      if (before) qc.setQueryData(categoriesQueryKey, reorderBy(before, ids));
      return { before };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.before) qc.setQueryData(categoriesQueryKey, ctx.before);
    },
    onSuccess: (data) => qc.setQueryData(categoriesQueryKey, data.items),
    onSettled: onSuccess,
  });
  return { create, rename, remove, reorder };
}

export function useIncomeSourceMutations() {
  const api = useApi();
  const qc = useQueryClient();
  const onSuccess = () => invalidateData(qc);

  const create = useMutation({
    mutationFn: (name: string) => unwrap(api.POST("/v1/income-sources", { body: { name } })),
    onSuccess,
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      unwrap(api.PATCH("/v1/income-sources/{id}", { params: { path: { id } }, body: { name } })),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/v1/income-sources/{id}", { params: { path: { id } } })),
    onSuccess,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => unwrap(api.PUT("/v1/income-sources/order", { body: { ids } })),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: incomeSourcesQueryKey });
      const before = qc.getQueryData<Schemas["IncomeSource"][]>(incomeSourcesQueryKey);
      if (before) qc.setQueryData(incomeSourcesQueryKey, reorderBy(before, ids));
      return { before };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.before) qc.setQueryData(incomeSourcesQueryKey, ctx.before);
    },
    onSuccess: (data) => qc.setQueryData(incomeSourcesQueryKey, data.items),
    onSettled: onSuccess,
  });
  return { create, rename, remove, reorder };
}

function reorderBy<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}
