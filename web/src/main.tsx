import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiProvider, createApiClient } from "./api";
import { App } from "./App";
import { AuthGate, createApiAuth, createSession, SessionProvider } from "./auth";
import { ThemeProvider } from "./theme/ThemeProvider";
// Tailwind (preflight, theme, utilities), then the token values it reads.
import "./index.css";
import "./styles/tokens.css";

const auth = createApiAuth();
const session = createSession(auth);
const api = createApiClient({ getToken: auth.getToken, onSessionError: session.end });

createRoot(document.getElementById("root")!).render(
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
