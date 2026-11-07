import type { ApiError } from "../api";
import type { AuthService, AuthUser } from "./types";

/** Why the user was signed out, shown on the sign-in screen. */
export type SessionNotice =
  | { kind: "no_access"; email: string | null }
  | { kind: "expired" };

export type SessionState =
  | { status: "restoring" }
  | { status: "signed_out"; notice: SessionNotice | null }
  | { status: "signed_in"; user: AuthUser };

export interface Session {
  readonly auth: AuthService;
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  /**
   * The API client's `onSessionError`: the API refused this session
   * (`not_allowlisted`, `unauthenticated` or `session_expired`), so sign out and say why.
   */
  end(err: ApiError): void;
  signOut(): Promise<void>;
  /** Drops the sign-out notice (when the user starts another attempt). */
  clearNotice(): void;
}

/**
 * The auth state the UI renders from: restoring, signed out (with an optional
 * notice) or signed in. Created once, outside React; read with `useSession()`.
 */
export function createSession(auth: AuthService): Session {
  let state: SessionState = { status: "restoring" };
  const listeners = new Set<() => void>();

  const set = (next: SessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  auth.onUserChange((user) => {
    if (user) {
      set({ status: "signed_in", user });
    } else {
      // Keep a notice set by end(): Firebase reports the sign-out after it.
      set({ status: "signed_out", notice: state.status === "signed_out" ? state.notice : null });
    }
  });

  return {
    auth,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    end(err) {
      // Several requests can fail at once; the first one decides the notice.
      if (state.status !== "signed_in") return;
      const notice: SessionNotice =
        err.code === "not_allowlisted"
          ? { kind: "no_access", email: state.user.email }
          : { kind: "expired" };
      set({ status: "signed_out", notice });
      auth.signOut().catch(() => {
        // Already showing the sign-in screen; Firebase will catch up on reload.
      });
    },
    signOut: () => auth.signOut(),
    clearNotice() {
      if (state.status === "signed_out" && state.notice) set({ status: "signed_out", notice: null });
    },
  };
}
