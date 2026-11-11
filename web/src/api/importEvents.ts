import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useApi } from "./context";
import { importQueryKey, importsQueryKey, invalidateAllData, type ImportRecord } from "./imports";
import type { Schemas } from "./types";

export type ImportProgress = Schemas["ImportProgress"];

export interface SseFrame {
  event: string;
  data: string;
}

/** Splits an SSE byte stream into frames. Comment lines (`: ping`) are dropped. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith(":")) continue;
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (data.length > 0) yield { event, data: data.join("\n") };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const RECONNECT_MS = 1500;

type ApiClient = ReturnType<typeof useApi>;

export interface FollowHandlers {
  onProgress: (progress: ImportProgress) => void;
  /** Called once, with the final import, when the stream ends or the import is no longer running. */
  onFinished: (record: ImportRecord) => void;
}

/**
 * Follows one import's `/events` stream until it finishes or `signal` aborts.
 * Uses `fetch` and a stream reader because `EventSource` cannot send the
 * bearer token. If the stream drops before `finished`, it refetches the import
 * (finishing at once if it is no longer running) and reconnects.
 */
export async function followImport(
  api: ApiClient,
  id: string,
  handlers: FollowHandlers,
  signal: AbortSignal,
  reconnectMs = RECONNECT_MS,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const { response } = await api.GET("/v1/imports/{id}/events", {
        params: { path: { id } },
        parseAs: "stream",
        signal,
      });
      if (!response.ok || !response.body) throw new Error("no stream");
      for await (const frame of readSse(response.body)) {
        if (frame.event === "progress") {
          handlers.onProgress(JSON.parse(frame.data) as ImportProgress);
        } else if (frame.event === "finished") {
          handlers.onFinished(JSON.parse(frame.data) as ImportRecord);
          return;
        }
      }
    } catch {
      if (signal.aborted) return;
    }
    if (signal.aborted) return;
    // Dropped before `finished`: ask the server where the import stands.
    try {
      const record = await api.GET("/v1/imports/{id}", { params: { path: { id } }, signal });
      if (record.data && record.data.status !== "running") {
        handlers.onFinished(record.data);
        return;
      }
    } catch {
      if (signal.aborted) return;
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, reconnectMs);
      signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
    });
  }
}

/** Refetches everything an import can change. */
export async function refreshAfterImport(qc: QueryClient, record: ImportRecord) {
  qc.setQueryData(importQueryKey(record.id), record);
  await qc.invalidateQueries({ queryKey: importsQueryKey });
  await invalidateAllData(qc);
}

/** Follows a running import's progress for the Import screen. */
export function useImportProgress(id: string | null, enabled: boolean) {
  const api = useApi();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  useEffect(() => {
    if (id === null || !enabled) return;
    const controller = new AbortController();
    void followImport(
      api,
      id,
      {
        onProgress: setProgress,
        onFinished: (record) => {
          setProgress(null);
          void refreshAfterImport(qc, record);
        },
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [api, qc, id, enabled]);

  return progress;
}
