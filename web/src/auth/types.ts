import type { TokenGetter } from "../api";

/** The signed-in Firebase user, as much of it as the app needs. */
export interface AuthUser {
  uid: string;
  email: string | null;
}

/**
 * Our own codes for sign-in failures. The Firebase wrapper maps Firebase's
 * codes onto these, so nothing outside `src/auth` sees Firebase error codes.
 */
export type AuthErrorCode =
  | "invalid_credentials"
  | "user_not_found"
  | "invalid_email"
  | "user_disabled"
  | "no_access"
  | "too_many_requests"
  | "network"
  | "popup_blocked"
  | "cancelled"
  | "provider_disabled"
  | "account_exists"
  | "unauthorized_domain"
  | "unknown";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string = code) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

/**
 * Everything the app does with Firebase Authentication. `createFirebaseAuth`
 * implements it; tests pass a fake. Every method rejects with an AuthError.
 */
export interface AuthService {
  /**
   * Calls back once Firebase has finished restoring any saved session (with
   * the user or null), then again on every sign-in and sign-out.
   */
  onUserChange(callback: (user: AuthUser | null) => void): () => void;
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  /** Resolves even when no account has that email, so the UI can't reveal which emails exist. */
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** The current ID token for the API client, or null when signed out. */
  getToken: TokenGetter;
}
