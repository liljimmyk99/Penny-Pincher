/**
 * The web app's API layer. Types come from `schema.gen.ts`, generated from
 * `api/openapi.yaml` with `npm run gen:api`; never edit that file or hand-write
 * request/response types.
 */
export type { Schemas } from "./types";
export { ApiProvider } from "./ApiProvider";
export { createApiClient, unwrap, type ApiClient, type TokenGetter } from "./client";
export { useApi } from "./context";
export {
  ApiError,
  errorMessage,
  fieldErrors,
  isSessionError,
  type ApiErrorCode,
  type ServerErrorCode,
} from "./errors";
export { useMe, meQueryKey } from "./me";
export { createQueryClient } from "./queryClient";
export {
  categoriesQueryKey,
  categoryStatsQueryKey,
  incomeSourcesQueryKey,
  incomeSourceStatsQueryKey,
  useCategories,
  useCategoryMutations,
  useCategoryStats,
  useIncomeSourceMutations,
  useIncomeSources,
  useIncomeSourceStats,
} from "./manage";
export {
  templateQueryKey,
  templatesQueryKey,
  useTemplate,
  useTemplateItemMutations,
  useTemplateMutations,
  useTemplates,
} from "./templates";
export {
  expenseQueryKey,
  expensesBetweenQueryKey,
  findMerchant,
  lastCategoryFor,
  merchantSearchQueryKey,
  monthExpensesQueryKey,
  monthIncomeQueryKey,
  useEntryMutations,
  useExpensesBetween,
  useExpensesById,
  useMerchantExpenses,
  useMerchantSearch,
  useMonthExpenses,
  useMonthIncome,
} from "./entries";
