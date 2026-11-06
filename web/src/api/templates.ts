import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { unwrap } from "./client";
import { useApi } from "./context";
import type { Schemas } from "./types";

/** Templates: the list, one template with its items, and every edit behind the Templates screen. */

export const templatesQueryKey = ["templates"] as const;
export const templateQueryKey = (id: string) => ["templates", "one", id] as const;

export function useTemplates() {
  const api = useApi();
  return useQuery<Schemas["TemplateSummary"][]>({
    queryKey: templatesQueryKey,
    queryFn: async ({ signal }) => (await unwrap(api.GET("/v1/templates", { signal }))).items,
  });
}

export function useTemplate(id: string | null) {
  const api = useApi();
  return useQuery<Schemas["Template"]>({
    queryKey: templateQueryKey(id ?? ""),
    enabled: id !== null,
    queryFn: ({ signal }) => unwrap(api.GET("/v1/templates/{id}", { params: { path: { id: id! } }, signal })),
  });
}

/** Item counts in the list and the open template both change with any edit. */
function invalidateTemplates(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: templatesQueryKey });
}

export function useTemplateMutations() {
  const api = useApi();
  const qc = useQueryClient();
  const onSuccess = () => invalidateTemplates(qc);

  const create = useMutation({
    mutationFn: (name: string) => unwrap(api.POST("/v1/templates", { body: { name } })),
    onSuccess: (template) => {
      qc.setQueryData(templateQueryKey(template.id), template);
      return onSuccess();
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      unwrap(api.PATCH("/v1/templates/{id}", { params: { path: { id } }, body: { name } })),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/v1/templates/{id}", { params: { path: { id } } })),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: templateQueryKey(id) });
      return onSuccess();
    },
  });
  return { create, rename, remove };
}

type ExpenseItemCreate = Schemas["TemplateExpenseItemCreate"];
type ExpenseItemUpdate = Schemas["TemplateExpenseItemUpdate"];
type IncomeItemCreate = Schemas["TemplateIncomeItemCreate"];
type IncomeItemUpdate = Schemas["TemplateIncomeItemUpdate"];

/** Adding, editing and removing one template's expense and income items. */
export function useTemplateItemMutations(templateId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const path = { id: templateId };
  const onSuccess = () => invalidateTemplates(qc);
  // A new merchant name creates the merchant, so autocomplete may be stale too.
  const onMerchantSuccess = () =>
    Promise.all([onSuccess(), qc.invalidateQueries({ queryKey: ["merchants"] })]);

  const createExpense = useMutation({
    mutationFn: (body: ExpenseItemCreate) =>
      unwrap(api.POST("/v1/templates/{id}/expense-items", { params: { path }, body })),
    onSuccess: onMerchantSuccess,
  });
  const updateExpense = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: ExpenseItemUpdate }) =>
      unwrap(
        api.PATCH("/v1/templates/{id}/expense-items/{item_id}", {
          params: { path: { ...path, item_id: itemId } },
          body,
        }),
      ),
    onSuccess: onMerchantSuccess,
  });
  const removeExpense = useMutation({
    mutationFn: (itemId: string) =>
      unwrap(
        api.DELETE("/v1/templates/{id}/expense-items/{item_id}", { params: { path: { ...path, item_id: itemId } } }),
      ),
    onSuccess,
  });
  const createIncome = useMutation({
    mutationFn: (body: IncomeItemCreate) =>
      unwrap(api.POST("/v1/templates/{id}/income-items", { params: { path }, body })),
    onSuccess,
  });
  const updateIncome = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: IncomeItemUpdate }) =>
      unwrap(
        api.PATCH("/v1/templates/{id}/income-items/{item_id}", {
          params: { path: { ...path, item_id: itemId } },
          body,
        }),
      ),
    onSuccess,
  });
  const removeIncome = useMutation({
    mutationFn: (itemId: string) =>
      unwrap(
        api.DELETE("/v1/templates/{id}/income-items/{item_id}", { params: { path: { ...path, item_id: itemId } } }),
      ),
    onSuccess,
  });
  return { createExpense, updateExpense, removeExpense, createIncome, updateIncome, removeIncome };
}
