import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./errors";
import { saveBlob } from "../lib/download";
import { unwrap } from "./client";
import { useApi } from "./context";
import type { Schemas } from "./types";

/** Admin-only status and backups (root AGENTS.md §6.12). Members get `403 admin_required`. */

export const adminStatusQueryKey = ["admin", "status"] as const;
export const backupsQueryKey = ["admin", "backups"] as const;

/** How often the backups list refreshes while a backup is running. */
const RUNNING_POLL_MS = 2000;

export function useAdminStatus() {
  const api = useApi();
  return useQuery<Schemas["AdminStatus"]>({
    queryKey: adminStatusQueryKey,
    queryFn: ({ signal }) => unwrap(api.GET("/v1/admin/status", { signal })),
  });
}

/** Newest first. Polls while any backup is still running. */
export function useBackups() {
  const api = useApi();
  return useQuery<Schemas["Backup"][]>({
    queryKey: backupsQueryKey,
    queryFn: async ({ signal }) => (await unwrap(api.GET("/v1/admin/backups", { signal }))).items,
    refetchInterval: (query) =>
      query.state.data?.some((b) => b.status === "running") ? RUNNING_POLL_MS : false,
  });
}

/** "Back up now": starts a manual backup; the list then shows it running. */
export function useStartBackup() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<Schemas["Backup"]>({
    mutationFn: () => unwrap(api.POST("/v1/admin/backups")),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: backupsQueryKey });
      void queryClient.invalidateQueries({ queryKey: adminStatusQueryKey });
    },
  });
}

/** Fetches the encrypted archive (with the bearer token) and hands it to the browser as a file. */
export function useDownloadBackup() {
  const api = useApi();
  return useMutation<void, Error, Schemas["Backup"]>({
    mutationFn: async (backup) => {
      let result;
      try {
        result = await api.GET("/v1/admin/backups/{id}/download", {
          params: { path: { id: backup.id } },
          parseAs: "blob",
        });
      } catch (err) {
        throw ApiError.network(err);
      }
      if (!result.response.ok || result.error !== undefined) {
        throw ApiError.fromResponse(result.response.status, result.error, result.response.headers);
      }
      const name =
        /filename="?([^";]+)"?/.exec(result.response.headers.get("Content-Disposition") ?? "")?.[1] ??
        `penny-pincher-${backup.kind}-${backup.id}.enc`;
      saveBlob(result.data as Blob, name);
    },
  });
}
