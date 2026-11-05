import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { ApiClient } from "./client";
import { ApiContext } from "./context";
import { createQueryClient } from "./queryClient";

type Props = {
  children: ReactNode;
  /** Built once with `createApiClient`, outside React (see main.tsx). */
  client: ApiClient;
  /** Defaults to `createQueryClient()`. Tests pass their own. */
  queryClient?: QueryClient;
};

/** Provides the typed API client and the TanStack Query cache to the app. */
export function ApiProvider({ children, client, queryClient }: Props) {
  const [cache] = useState(() => queryClient ?? createQueryClient());
  return (
    <ApiContext.Provider value={client}>
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}
