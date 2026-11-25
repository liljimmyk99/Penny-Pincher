import type { Schemas } from "../api";

/** What `POST /v1/auth/login` returns: the session token and who signed in. */
export type LoginResult = Schemas["LoginResult"];

/**
 * Everything the app does with sign-in. `createApiAuth` implements it against
 * the API; tests pass a fake. Methods reject with an `ApiError`.
 * The session token lives only behind this interface.
 */
export interface AuthService {
  /** The stored session token, or null when signed out. */
  getToken(): string | null;
  /** Signs in and stores the token. */
  signIn(username: string, password: string): Promise<LoginResult>;
  /** Changes the password and stores the new token (the old one stops working). */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /** Revokes this session on the server (best effort) and forgets the token. */
  signOut(): Promise<void>;
  /** Forgets the token without calling the server (the API already refused it). */
  clearToken(): void;
}
