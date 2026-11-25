import type { ApiError } from "../api";
import type { AuthService } from "./types";

/** Why the user was signed out, shown on the sign-in screen. */
export type SessionNotice = { kind: "expired" };

export type SessionState =
  | { status: "signed_out"; notice: SessionNotice | null }
  /** `mustChange`: an admin set the password, so only Change password and Sign out work. */
  | { status: "signed_in"; mustChange: boolean };

export interface Session {
  readonly auth: AuthService;
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  signIn(username: string, password: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /**
   * The API client's `onSessionError`: 401 `unauthenticated` / `session_expired`
   * signs out and says why; 403 `password_change_required` routes to Change password.
   */
  end(err: ApiError): void;
  signOut(): Promise<void>;
  /** Drops the sign-out notice (when the user starts another attempt). */
  clearNotice(): void;
}

/**
 * The auth state the UI renders from: signed out (with an optional notice) or
 * signed in. Created once, outside React; read with `useSession()`. A stored
 * token counts as signed in until `GET /v1/me` (in AuthGate) says otherwise.
 */
export function createSession(auth: AuthService): Session {
  let state: SessionState = auth.getToken()
    ? { status: "signed_in", mustChange: false }
    : { status: "signed_out", notice: null };
  const listeners = new Set<() => void>();

  const set = (next: SessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    auth,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signIn(username, password) {
      this.clearNotice();
      const result = await auth.signIn(username, password);
      set({ status: "signed_in", mustChange: result.must_change_password });
    },
    async changePassword(currentPassword, newPassword) {
      await auth.changePassword(currentPassword, newPassword);
      set({ status: "signed_in", mustChange: false });
    },
    end(err) {
      // Several requests can fail at once; the first one decides.
      if (state.status !== "signed_in") return;
      if (err.code === "password_change_required") {
        if (!state.mustChange) set({ status: "signed_in", mustChange: true });
        return;
      }
      auth.clearToken();
      set({ status: "signed_out", notice: { kind: "expired" } });
    },
    async signOut() {
      await auth.signOut();
      set({ status: "signed_out", notice: null });
    },
    clearNotice() {
      if (state.status === "signed_out" && state.notice) set({ status: "signed_out", notice: null });
    },
  };
}
