import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { unwrap } from "./client";
import { useApi } from "./context";
import { meQueryKey } from "./me";
import type { Schemas } from "./types";

/**
 * Month actions (root AGENTS.md §6.9): start a month from a template, undo
 * that, confirm every copy as-is, and save a month as a new template.
 */

export const templateAppliesQueryKey = (month: string) => ["template-applies", month] as const;

/** The month's template applies, newest first. */
export function useTemplateApplies(month: string) {
  const api = useApi();
  return useQuery<Schemas["TemplateApply"][]>({
    queryKey: templateAppliesQueryKey(month),
    queryFn: async ({ signal }) =>
      (await unwrap(api.GET("/v1/template-applies", { params: { query: { month } }, signal }))).items,
  });
}

/** Every one of these changes entries, totals and template lists: refetch everything except the user. */
function invalidateData(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] });
}

export interface ApplyTemplateInput {
  month: string;
  templateId: string;
  /** The user confirmed that all of the month's entries are deleted first. */
  resetMonth?: boolean;
}

export function useMonthMutations() {
  const api = useApi();
  const qc = useQueryClient();
  const onSuccess = () => invalidateData(qc);

  /** Rejects with `month_not_empty` when the month has data and `resetMonth` isn't set. */
  const applyTemplate = useMutation({
    mutationFn: ({ month, templateId, resetMonth = false }: ApplyTemplateInput) =>
      unwrap(
        api.POST("/v1/months/{month}/apply-template", {
          params: { path: { month } },
          body: { template_id: templateId, reset_month: resetMonth },
        }),
      ),
    onSuccess,
  });
  const undoApply = useMutation({
    mutationFn: (applyId: string) =>
      unwrap(api.POST("/v1/template-applies/{id}/undo", { params: { path: { id: applyId } } })),
    onSuccess,
  });
  const confirmAll = useMutation({
    mutationFn: (month: string) => unwrap(api.POST("/v1/months/{month}/confirm-all", { params: { path: { month } } })),
    onSuccess,
  });
  const saveAsTemplate = useMutation({
    mutationFn: ({ month, name }: { month: string; name: string }) =>
      unwrap(api.POST("/v1/months/{month}/save-as-template", { params: { path: { month } }, body: { name } })),
    onSuccess,
  });
  return { applyTemplate, undoApply, confirmAll, saveAsTemplate };
}
