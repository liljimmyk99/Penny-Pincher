import { useQuery } from "@tanstack/react-query";
import { unwrap } from "./client";
import { useApi } from "./context";
import type { Schemas } from "./types";

export const meQueryKey = ["me"] as const;

/** The signed-in user and their role (`GET /v1/me`). */
export function useMe() {
  const api = useApi();
  return useQuery<Schemas["Me"]>({
    queryKey: meQueryKey,
    queryFn: ({ signal }) => unwrap(api.GET("/v1/me", { signal })),
  });
}
