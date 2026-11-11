import { useMutation } from "@tanstack/react-query";
import { filenameFrom, saveBlob } from "../lib/download";
import { useApi } from "./context";
import { ApiError } from "./errors";

export type ExportFormat = "csv" | "xlsx";
export interface ExportInput {
  format: ExportFormat;
  /** Inclusive `YYYY-MM-DD`; both empty exports everything. */
  from?: string;
  to?: string;
}

/** Fetches the export (with the bearer token) and hands it to the browser as a file. */
export function useExportData() {
  const api = useApi();
  return useMutation<string, Error, ExportInput>({
    mutationFn: async ({ format, from, to }) => {
      let result;
      try {
        result = await api.GET("/v1/export", {
          params: { query: { format, from: from || undefined, to: to || undefined } },
          parseAs: "blob",
        });
      } catch (err) {
        throw ApiError.network(err);
      }
      if (!result.response.ok || result.error !== undefined) {
        throw ApiError.fromResponse(result.response.status, result.error, result.response.headers);
      }
      const name =
        filenameFrom(result.response.headers.get("Content-Disposition")) ??
        `penny-pincher-export.${format === "csv" ? "zip" : "xlsx"}`;
      saveBlob(result.data as Blob, name);
      return name;
    },
  });
}
