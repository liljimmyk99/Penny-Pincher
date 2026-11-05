import { AuthError, type AuthErrorCode } from "./types";

/** Firebase Auth error codes (`auth/…`) mapped to ours. Anything else is `unknown`. */
const FIREBASE_CODES: Record<string, AuthErrorCode> = {
  "auth/invalid-credential": "invalid_credentials",
  "auth/invalid-login-credentials": "invalid_credentials",
  "auth/wrong-password": "invalid_credentials",
  "auth/missing-password": "invalid_credentials",
  "auth/user-not-found": "user_not_found",
  "auth/invalid-email": "invalid_email",
  "auth/missing-email": "invalid_email",
  "auth/user-disabled": "user_disabled",
  // Raised when sign-ups are disabled in Firebase and an unknown account tries to sign in.
  "auth/admin-restricted-operation": "no_access",
  "auth/too-many-requests": "too_many_requests",
  "auth/network-request-failed": "network",
  "auth/timeout": "network",
  "auth/popup-blocked": "popup_blocked",
  "auth/popup-closed-by-user": "cancelled",
  "auth/cancelled-popup-request": "cancelled",
  "auth/user-cancelled": "cancelled",
  "auth/operation-not-allowed": "provider_disabled",
  "auth/account-exists-with-different-credential": "account_exists",
  "auth/unauthorized-domain": "unauthorized_domain",
};

/** Turns whatever the Firebase SDK threw into an AuthError. */
export function toAuthError(err: unknown): AuthError {
  if (err instanceof AuthError) return err;
  const code =
    typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : "";
  return new AuthError(FIREBASE_CODES[code] ?? "unknown", code || "unknown");
}

const INVALID_CREDENTIALS =
  "That email and password don't match. Check them and try again, or reset your password.";

const MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: INVALID_CREDENTIALS,
  user_not_found: INVALID_CREDENTIALS,
  invalid_email: "Enter a valid email address.",
  user_disabled: "This account has been disabled. Ask an admin for help.",
  no_access: "This account isn't set up for Penny Pincher. Ask an admin to add you.",
  too_many_requests: "Too many attempts. Wait a few minutes and try again, or reset your password.",
  network: "Can't reach the sign-in service. Check your connection and try again.",
  popup_blocked: "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
  cancelled: "",
  provider_disabled: "That sign-in method isn't turned on. Ask an admin for help.",
  account_exists: "This email signs in with a password. Use email and password instead.",
  unauthorized_domain:
    "Sign-in isn't allowed from this address yet. An admin needs to add it to Firebase's authorized domains.",
  unknown: "Sign-in failed. Please try again.",
};

/** A message safe to show the user. Empty for `cancelled` (the user closed the popup). */
export function authErrorMessage(err: unknown): string {
  return MESSAGES[toAuthError(err).code];
}

/** True when the failure means the email/password pair was wrong (mark the password invalid). */
export function isCredentialError(err: unknown): boolean {
  const { code } = toAuthError(err);
  return code === "invalid_credentials" || code === "user_not_found";
}
