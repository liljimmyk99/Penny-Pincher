import { createContext, useContext, useSyncExternalStore } from "react";
import type { Session, SessionState } from "./session";

export const SessionContext = createContext<Session | null>(null);

/** The session store (sign in, sign out, the auth service). */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}

/** The current auth state; re-renders when it changes. */
export function useSessionState(): SessionState {
  const session = useSession();
  return useSyncExternalStore(session.subscribe, session.getState);
}
