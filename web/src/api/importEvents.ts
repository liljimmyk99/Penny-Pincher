import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

/**
 * Follows a running import's progress. Uses `fetch` and a stream reader because
 * `EventSource` cannot send the bearer token. Reconnects if the stream drops
 * before `finished`, refetching the import each time. When it finishes, every
 * query that depends on entries is refetched.
 */
export function useImportProgress(id: string | null, enabled: boolean) {
  const api = useApi();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  useEffect(() => {
    if (id === null || !enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function follow(): Promise<void> {
      try {
        const { response } = await api.GET("/v1/imports/{id}/events", {
          params: { path: { id: id! } },
          parseAs: "stream",
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error("no stream");
        for await (const frame of readSse(response.body)) {
          if (frame.event === "progress") {
            setProgress(JSON.parse(frame.data) as ImportProgress);
          } else if (frame.event === "finished") {
            qc.setQueryData(importQueryKey(id!), JSON.parse(frame.data) as ImportRecord);
            setProgress(null);
            await qc.invalidateQueries({ queryKey: importsQueryKey });
            await invalidateAllData(qc);
            return;
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        void err;
      }
      if (controller.signal.aborted) return;
      // Dropped before `finished`: refetch the import, then follow again.
      await qc.invalidateQueries({ queryKey: importQueryKey(id!) });
      timer = setTimeout(() => void follow(), RECONNECT_MS);
    }
    void follow();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, qc, id, enabled]);

  return progress;
}
