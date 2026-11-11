import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  followImport,
  refreshAfterImport,
  useRunningImports,
  type ImportProgress,
  type ImportRecord,
} from "../../api";
import { useApi } from "../../api/context";

export type ImportBannerState =
  | { kind: "running"; name: string; progress: ImportProgress | null }
  | { kind: "finished"; record: ImportRecord }
  | { kind: "stopped"; record: ImportRecord };

/**
 * App-wide import tracking. Finds a running import on load (and when one is
 * started from the Import screen), follows its stream, and keeps the outcome
 * until the user dismisses it.
 */
export function useImportBanner(): { state: ImportBannerState | null; dismiss: () => void } {
  const api = useApi();
  const qc = useQueryClient();
  const running = useRunningImports().data?.[0];
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [outcome, setOutcome] = useState<ImportRecord | null>(null);
  const done = useRef(new Set<string>());
  const runningId = running?.id;

  useEffect(() => {
    if (runningId === undefined || done.current.has(runningId)) return;
    const id = runningId;
    const controller = new AbortController();
    void followImport(
      api,
      id,
      {
        onProgress: setProgress,
        onFinished: (record) => {
          done.current.add(id);
          setProgress(null);
          setOutcome(record);
          void refreshAfterImport(qc, record);
        },
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [api, qc, runningId]);

  const dismiss = useCallback(() => setOutcome(null), []);

  if (running && outcome?.id !== running.id) {
    return { state: { kind: "running", name: running.file_name, progress }, dismiss };
  }
  if (outcome?.status === "completed") return { state: { kind: "finished", record: outcome }, dismiss };
  if (outcome?.status === "cancelled" || outcome?.status === "failed") {
    return { state: { kind: "stopped", record: outcome }, dismiss };
  }
  return { state: null, dismiss };
}
