import { authErrorMessage, isCredentialError, toAuthError } from "./errors";
import { AuthError } from "./types";

const firebaseError = (code: string) => Object.assign(new Error(`Firebase: (${code})`), { code });

describe("toAuthError", () => {
  it.each([
    ["auth/invalid-credential", "invalid_credentials"],
    ["auth/wrong-password", "invalid_credentials"],
    ["auth/user-not-found", "user_not_found"],
    ["auth/invalid-email", "invalid_email"],
    ["auth/user-disabled", "user_disabled"],
    ["auth/admin-restricted-operation", "no_access"],
    ["auth/too-many-requests", "too_many_requests"],
    ["auth/network-request-failed", "network"],
    ["auth/popup-blocked", "popup_blocked"],
    ["auth/popup-closed-by-user", "cancelled"],
    ["auth/unauthorized-domain", "unauthorized_domain"],
    ["auth/something-new", "unknown"],
  ])("maps %s to %s", (firebaseCode, code) => {
    expect(toAuthError(firebaseError(firebaseCode)).code).toBe(code);
  });

  it("treats non-Firebase values as unknown", () => {
    expect(toAuthError(new TypeError("boom")).code).toBe("unknown");
    expect(toAuthError(undefined).code).toBe("unknown");
  });

  it("passes AuthErrors through", () => {
    const err = new AuthError("network");
    expect(toAuthError(err)).toBe(err);
  });
});

describe("authErrorMessage", () => {
  it("explains wrong credentials without saying which part was wrong", () => {
    const wrong = authErrorMessage(new AuthError("invalid_credentials"));
    expect(wrong).toMatch(/email and password don't match/i);
    expect(authErrorMessage(new AuthError("user_not_found"))).toBe(wrong);
  });

  it("says nothing when the user closed the Google popup", () => {
    expect(authErrorMessage(new AuthError("cancelled"))).toBe("");
  });

  it("tells a refused account to ask an admin", () => {
    expect(authErrorMessage(new AuthError("no_access"))).toMatch(/ask an admin/i);
  });
});

describe("isCredentialError", () => {
  it("is true only for wrong email/password", () => {
    expect(isCredentialError(new AuthError("invalid_credentials"))).toBe(true);
    expect(isCredentialError(new AuthError("user_not_found"))).toBe(true);
    expect(isCredentialError(new AuthError("network"))).toBe(false);
  });
});
