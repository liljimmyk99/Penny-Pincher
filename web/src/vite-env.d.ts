/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Firebase web config (public, build time). See web/.env.example. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  /** Optional; defaults to <project id>.firebaseapp.com. */
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
