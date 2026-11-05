/** The public Firebase web config. Not secret: it identifies the project to the browser SDK. */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  /**
   * Firebase Auth emulator URL (e.g. http://localhost:9099), only for the
   * end-to-end suite in /e2e. Honored only for "demo-" projects, which
   * Firebase keeps emulator-only, so a production build can never use it.
   */
  emulatorUrl?: string;
}

type Env = Partial<Record<string, string | undefined>>;

/**
 * Reads the Firebase web config from Vite's build-time env (`VITE_FIREBASE_*`,
 * see web/.env.example). Returns null when it is missing, so the app can say so
 * instead of failing inside the SDK.
 */
export function firebaseConfigFromEnv(env: Env = import.meta.env): FirebaseWebConfig | null {
  const apiKey = env.VITE_FIREBASE_API_KEY?.trim();
  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`;
  const emulatorUrl = env.VITE_FIREBASE_AUTH_EMULATOR_URL?.trim();
  if (emulatorUrl && projectId.startsWith("demo-")) return { apiKey, authDomain, projectId, emulatorUrl };
  return { apiKey, authDomain, projectId };
}
