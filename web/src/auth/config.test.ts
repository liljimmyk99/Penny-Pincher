import { firebaseConfigFromEnv } from "./config";

describe("firebaseConfigFromEnv", () => {
  it("defaults the auth domain from the project id", () => {
    expect(
      firebaseConfigFromEnv({ VITE_FIREBASE_API_KEY: "key", VITE_FIREBASE_PROJECT_ID: "demo-project" }),
    ).toEqual({ apiKey: "key", projectId: "demo-project", authDomain: "demo-project.firebaseapp.com" });
  });

  it("uses an explicit auth domain", () => {
    expect(
      firebaseConfigFromEnv({
        VITE_FIREBASE_API_KEY: "key",
        VITE_FIREBASE_PROJECT_ID: "demo-project",
        VITE_FIREBASE_AUTH_DOMAIN: "auth.example.com",
      })?.authDomain,
    ).toBe("auth.example.com");
  });

  it("returns null when the key or project is missing", () => {
    expect(firebaseConfigFromEnv({})).toBeNull();
    expect(firebaseConfigFromEnv({ VITE_FIREBASE_API_KEY: "key", VITE_FIREBASE_PROJECT_ID: " " })).toBeNull();
  });
});
