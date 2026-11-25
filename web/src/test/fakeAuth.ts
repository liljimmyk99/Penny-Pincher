import type { AuthService, LoginResult } from "../auth/types";

export type FakeAuth = AuthService & {
  getToken: ReturnType<typeof vi.fn<AuthService["getToken"]>>;
  signIn: ReturnType<typeof vi.fn<AuthService["signIn"]>>;
  changePassword: ReturnType<typeof vi.fn<AuthService["changePassword"]>>;
  signOut: ReturnType<typeof vi.fn<AuthService["signOut"]>>;
  clearToken: ReturnType<typeof vi.fn<AuthService["clearToken"]>>;
};

export const testMe = {
  id: "1",
  username: "sam",
  email: null,
  display_name: null,
  role: "member",
  must_change_password: false,
} as const;

export const testLogin = (over: Partial<LoginResult> = {}): LoginResult => ({
  token: "new-token",
  expires_at: "2026-12-24T00:00:00Z",
  user: { ...testMe },
  must_change_password: false,
  ...over,
});

/**
 * An in-memory AuthService. `token` is the stored session ("test-token" means
 * already signed in, null means signed out). Sign-in and password changes store
 * a new token; sign-out and clearToken forget it.
 */
export function fakeAuth(token: string | null = null): FakeAuth {
  let current = token;
  return {
    getToken: vi.fn(() => current),
    signIn: vi.fn(async () => {
      current = "new-token";
      return testLogin();
    }),
    changePassword: vi.fn(async () => {
      current = "newer-token";
    }),
    signOut: vi.fn(async () => {
      current = null;
    }),
    clearToken: vi.fn(() => {
      current = null;
    }),
  };
}
