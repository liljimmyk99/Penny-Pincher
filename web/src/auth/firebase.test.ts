import type { User } from "firebase/auth";
import * as sdk from "firebase/auth";
import { createFirebaseAuth } from "./firebase";
import { AuthError } from "./types";

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({})) }));

const fakeAuthInstance = {
  currentUser: null as Partial<User> | null,
  authStateReady: vi.fn(async () => {}),
  useDeviceLanguage: vi.fn(),
};

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => fakeAuthInstance),
  connectAuthEmulator: vi.fn(),
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn();
  },
  onAuthStateChanged: vi.fn(() => () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
  signInWithEmailAndPassword: vi.fn(async () => ({})),
  signInWithPopup: vi.fn(async () => ({})),
  signOut: vi.fn(async () => {}),
}));

const config = { apiKey: "key", projectId: "demo", authDomain: "demo.firebaseapp.com" };
const firebaseError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  fakeAuthInstance.currentUser = null;
});

describe("createFirebaseAuth", () => {
  it("connects to the auth emulator only when the config names one", () => {
    vi.mocked(sdk.connectAuthEmulator).mockClear();
    createFirebaseAuth(config);
    expect(sdk.connectAuthEmulator).not.toHaveBeenCalled();
    createFirebaseAuth({ ...config, emulatorUrl: "http://localhost:9099" });
    expect(sdk.connectAuthEmulator).toHaveBeenCalledWith(fakeAuthInstance, "http://localhost:9099", {
      disableWarnings: true,
    });
  });

  it("returns no token when signed out, after the session is restored", async () => {
    const auth = createFirebaseAuth(config);
    await expect(auth.getToken({ forceRefresh: false })).resolves.toBeNull();
    expect(fakeAuthInstance.authStateReady).toHaveBeenCalled();
  });

  it("returns the ID token, forcing a refresh when asked", async () => {
    const getIdToken = vi.fn(async (force?: boolean) => (force ? "fresh" : "cached"));
    fakeAuthInstance.currentUser = { getIdToken };
    const auth = createFirebaseAuth(config);

    await expect(auth.getToken({ forceRefresh: false })).resolves.toBe("cached");
    await expect(auth.getToken({ forceRefresh: true })).resolves.toBe("fresh");
  });

  it("reports only the uid and email of the user", () => {
    const auth = createFirebaseAuth(config);
    const callback = vi.fn();
    auth.onUserChange(callback);

    const listener = vi.mocked(sdk.onAuthStateChanged).mock.calls.at(-1)![1] as (u: unknown) => void;
    listener({ uid: "u1", email: "user@example.com", getIdToken: () => "secret" });
    listener(null);

    expect(callback).toHaveBeenNthCalledWith(1, { uid: "u1", email: "user@example.com" });
    expect(callback).toHaveBeenNthCalledWith(2, null);
  });

  it("maps Firebase errors to AuthErrors", async () => {
    vi.mocked(sdk.signInWithEmailAndPassword).mockRejectedValueOnce(firebaseError("auth/invalid-credential"));
    const auth = createFirebaseAuth(config);

    const err = await auth.signInWithEmail("user@example.com", "wrong").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err).toMatchObject({ code: "invalid_credentials" });
  });

  it("does not reveal whether a reset email has an account", async () => {
    vi.mocked(sdk.sendPasswordResetEmail).mockRejectedValueOnce(firebaseError("auth/user-not-found"));
    const auth = createFirebaseAuth(config);
    await expect(auth.sendPasswordReset("nobody@example.com")).resolves.toBeUndefined();

    vi.mocked(sdk.sendPasswordResetEmail).mockRejectedValueOnce(firebaseError("auth/network-request-failed"));
    await expect(auth.sendPasswordReset("user@example.com")).rejects.toMatchObject({ code: "network" });
  });
});
