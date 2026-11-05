/**
 * Sign-in and session state. The Firebase SDK lives only in ./firebase.ts,
 * which main.tsx imports directly so nothing else (tests included) loads it;
 * everything else depends on the AuthService interface.
 */
export { AuthGate } from "./AuthGate";
export { firebaseConfigFromEnv, type FirebaseWebConfig } from "./config";
export { useSession, useSessionState } from "./context";
export { authErrorMessage } from "./errors";
export { createSession, type Session, type SessionNotice, type SessionState } from "./session";
export { SessionProvider } from "./SessionProvider";
export { Splash, StatusScreen } from "./StatusScreen";
export { AuthError, type AuthErrorCode, type AuthService, type AuthUser } from "./types";
