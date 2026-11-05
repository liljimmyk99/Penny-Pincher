import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./errors";

const MAX_RETRIES = 2;

/** Retry only failures that might succeed on a second try: network errors and 5xx. */
export function shouldRetry(failureCount: number, err: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(err instanceof ApiError)) return false;
  return err.status === 0 || err.status >= 500;
}

/**
 * Server state lives here, in memory only (v1 is online-only: nothing is
 * persisted to localStorage). `networkMode: "always"` makes requests run and
 * fail visibly while offline instead of silently pausing.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "always",
        retry: shouldRetry,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
      },
      mutations: {
        networkMode: "always",
        retry: false,
      },
    },
  });
}
