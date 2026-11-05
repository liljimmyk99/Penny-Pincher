import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiProvider, createApiClient } from "./api";
import { App } from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/tokens.css";
import "./styles/global.css";

// Until the Firebase auth wrapper lands (issue #15), requests go out without a
// token. It will supply getToken (the Firebase ID token) and onSessionError
// (sign out on `unauthenticated` / `not_allowlisted`).
const api = createApiClient({ getToken: async () => null });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ApiProvider client={api}>
        <App />
      </ApiProvider>
    </ThemeProvider>
  </StrictMode>,
);
