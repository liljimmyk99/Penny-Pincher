import { act } from "@testing-library/react";
import type { AuthService, AuthUser } from "../auth/types";

export type FakeAuth = AuthService & {
  /** Simulates Firebase reporting a sign-in (user) or sign-out (null). */
  emit(user: AuthUser | null): void;
  signInWithGoogle: ReturnType<typeof vi.fn<AuthService["signInWithGoogle"]>>;
  signInWithEmail: ReturnType<typeof vi.fn<AuthService["signInWithEmail"]>>;
  sendPasswordReset: ReturnType<typeof vi.fn<AuthService["sendPasswordReset"]>>;
  signOut: ReturnType<typeof vi.fn<AuthService["signOut"]>>;
};

export const testUser: AuthUser = { uid: "uid-1", email: "user@example.com" };

/**
 * An in-memory AuthService. `restored` is what Firebase reports once the saved
 * session is checked; "pending" leaves it restoring until `emit` is called.
 * Successful sign-ins report `testUser`; signOut reports null.
 */
export function fakeAuth(restored: AuthUser | null | "pending" = null): FakeAuth {
  let listener: ((user: AuthUser | null) => void) | null = null;
  const emit = (user: AuthUser | null) => act(() => listener?.(user));

  return {
    emit,
    onUserChange(callback) {
      listener = callback;
      if (restored !== "pending") callback(restored);
      return () => {
        listener = null;
      };
    },
    signInWithGoogle: vi.fn(async () => emit(testUser)),
    signInWithEmail: vi.fn(async () => emit(testUser)),
    sendPasswordReset: vi.fn(async () => {}),
    signOut: vi.fn(async () => emit(null)),
    getToken: vi.fn(async () => "test-token"),
  };
}
