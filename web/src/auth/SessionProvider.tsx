import type { ReactNode } from "react";
import { SessionContext } from "./context";
import type { Session } from "./session";

/** Provides the session store, built once with `createSession` (see main.tsx). */
export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
