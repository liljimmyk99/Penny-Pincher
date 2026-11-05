/**
 * The only module that imports the Firebase SDK (ESLint enforces this).
 * Everything else uses the AuthService interface from ./types.
 */
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import type { FirebaseWebConfig } from "./config";
import { toAuthError } from "./errors";
import type { AuthService } from "./types";

async function mapped<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw toAuthError(err);
  }
}

export function createFirebaseAuth(config: FirebaseWebConfig): AuthService {
  const auth = getAuth(initializeApp(config));
  // Reset emails go out in the browser's language.
  auth.useDeviceLanguage();

  const google = new GoogleAuthProvider();
  // Always show the account chooser, so someone refused access can pick another account.
  google.setCustomParameters({ prompt: "select_account" });

  return {
    onUserChange(callback) {
      return onAuthStateChanged(auth, (user) =>
        callback(user ? { uid: user.uid, email: user.email } : null),
      );
    },

    async signInWithGoogle() {
      await mapped(() => signInWithPopup(auth, google));
    },

    async signInWithEmail(email, password) {
      await mapped(() => signInWithEmailAndPassword(auth, email, password));
    },

    async sendPasswordReset(email) {
      try {
        await mapped(() => sendPasswordResetEmail(auth, email));
      } catch (err) {
        // Don't reveal whether an account exists for this email.
        if (toAuthError(err).code !== "user_not_found") throw err;
      }
    },

    async signOut() {
      await mapped(() => signOut(auth));
    },

    async getToken({ forceRefresh }) {
      await auth.authStateReady();
      const user = auth.currentUser;
      return user ? user.getIdToken(forceRefresh) : null;
    },
  };
}
