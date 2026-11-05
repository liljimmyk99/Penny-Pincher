import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiProvider, createApiClient } from "./api";
import { App } from "./App";
import {
  AuthGate,
  createSession,
  firebaseConfigFromEnv,
  SessionProvider,
  StatusScreen,
} from "./auth";
import { createFirebaseAuth } from "./auth/firebase";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/controls.css";

const root = createRoot(document.getElementById("root")!);
const config = firebaseConfigFromEnv();

if (!config) {
  root.render(
    <ThemeProvider>
      <StatusScreen>
        <p className="status-screen__message" role="alert">
          Sign-in isn't configured. Set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID when building
          the web app (see web/.env.example).
        </p>
      </StatusScreen>
    </ThemeProvider>,
  );
} else {
  const auth = createFirebaseAuth(config);
  const session = createSession(auth);
  const api = createApiClient({ getToken: auth.getToken, onSessionError: session.end });

  root.render(
    <StrictMode>
      <ThemeProvider>
        <SessionProvider session={session}>
          <ApiProvider client={api}>
            <AuthGate>
              <App />
            </AuthGate>
          </ApiProvider>
        </SessionProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}
