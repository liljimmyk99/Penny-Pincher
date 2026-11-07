import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./errors";

const MAX_RETRIES = 2;

/**
 * Retry only failures that might succeed on a second try: network errors, 5xx,
 * and 429 (rate limited), which clears once the client slows down.
 */
export function shouldRetry(failureCount: number, err: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(err instanceof ApiError)) return false;
  return err.status === 0 || err.status === 429 || err.status >= 500;
}

/** Waits as long as a 429's `Retry-After` asks; otherwise TanStack's default backoff. */
export function retryDelay(failureCount: number, err: unknown): number {
  if (err instanceof ApiError && err.retryAfter !== null) return err.retryAfter * 1000;
  return Math.min(1000 * 2 ** failureCount, 30_000);
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
        retryDelay,
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
