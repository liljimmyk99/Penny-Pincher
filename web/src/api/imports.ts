import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { filenameFrom, saveBlob } from "../lib/download";
import { unwrap } from "./client";
import { useApi } from "./context";
import { ApiError } from "./errors";
import { meQueryKey } from "./me";
import type { Schemas } from "./types";

export type ImportRecord = Schemas["Import"];
export type ImportSummary = Schemas["ImportSummary"];

export const importsQueryKey = ["/v1/imports"] as const;
export const importQueryKey = (id: string) => ["/v1/imports", id] as const;

/** Imports change every total, so refetch everything except the signed-in user. */
export function invalidateAllData(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] });
}

/** The import history, newest first (includes imports still in review). */
export function useImports() {
  const api = useApi();
  return useQuery<ImportSummary[]>({
    queryKey: importsQueryKey,
    queryFn: async ({ signal }) => (await unwrap(api.GET("/v1/imports", { signal }))).items,
  });
}

/** Imports that are running now. The app-wide banner checks this on load. */
export function useRunningImports() {
  const api = useApi();
  return useQuery<ImportSummary[]>({
    queryKey: [...importsQueryKey, "running"],
    queryFn: async ({ signal }) =>
      (await unwrap(api.GET("/v1/imports", { params: { query: { status: "running" } }, signal }))).items,
  });
}

export function useImport(id: string | null) {
  const api = useApi();
  return useQuery<ImportRecord>({
    queryKey: importQueryKey(id ?? ""),
    enabled: id !== null,
    queryFn: ({ signal }) => unwrap(api.GET("/v1/imports/{id}", { params: { path: { id: id! } }, signal })),
  });
}

/** Downloads a blob response through the authenticated client. */
async function downloadBlob(
  call: () => Promise<{ data?: unknown; error?: unknown; response: Response }>,
  fallbackName: string,
): Promise<string> {
  let result;
  try {
    result = await call();
  } catch (err) {
    throw ApiError.network(err);
  }
  if (!result.response.ok || result.error !== undefined) {
    throw ApiError.fromResponse(result.response.status, result.error, result.response.headers);
  }
  const name = filenameFrom(result.response.headers.get("Content-Disposition")) ?? fallbackName;
  saveBlob(result.data as Blob, name);
  return name;
}

export function useDownloadImportTemplate() {
  const api = useApi();
  return useMutation<string, Error, void>({
    mutationFn: () =>
      downloadBlob(() => api.GET("/v1/imports/template", { parseAs: "blob" }), "penny-pincher-import-template.xlsx"),
  });
}

export function useDownloadImportProblems() {
  const api = useApi();
  return useMutation<string, Error, string>({
    mutationFn: (id) =>
      downloadBlob(
        () => api.GET("/v1/imports/{id}/problems", { params: { path: { id } }, parseAs: "blob" }),
        "penny-pincher-import-problems.xlsx",
      ),
  });
}

export function useImportMutations() {
  const api = useApi();
  const qc = useQueryClient();
  const refreshImports = () => qc.invalidateQueries({ queryKey: importsQueryKey });

  const upload = useMutation<ImportRecord, Error, File>({
    mutationFn: (file) =>
      unwrap(
        api.POST("/v1/imports", {
          // The generated body type is `{ file: string }`; the wire format is multipart.
          body: { file: file as unknown as string },
          bodySerializer: () => {
            const form = new FormData();
            form.append("file", file, file.name);
            return form;
          },
        }),
      ),
    onSuccess: (record) => {
      qc.setQueryData(importQueryKey(record.id), record);
      return refreshImports();
    },
  });
  const start = useMutation<ImportRecord, Error, string>({
    mutationFn: (id) => unwrap(api.POST("/v1/imports/{id}/start", { params: { path: { id } } })),
    onSuccess: (record) => {
      qc.setQueryData(importQueryKey(record.id), record);
      return refreshImports();
    },
  });
  const discard = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await unwrap(api.DELETE("/v1/imports/{id}", { params: { path: { id } } }));
    },
    onSuccess: refreshImports,
  });
  const cancel = useMutation<ImportRecord, Error, string>({
    mutationFn: (id) => unwrap(api.POST("/v1/imports/{id}/cancel", { params: { path: { id } } })),
    onSuccess: (record) => {
      qc.setQueryData(importQueryKey(record.id), record);
      return invalidateAllData(qc);
    },
  });
  const undo = useMutation<ImportRecord, Error, string>({
    mutationFn: (id) => unwrap(api.POST("/v1/imports/{id}/undo", { params: { path: { id } } })),
    onSuccess: (record) => {
      qc.setQueryData(importQueryKey(record.id), record);
      return invalidateAllData(qc);
    },
  });
  return { upload, start, discard, cancel, undo };
}
