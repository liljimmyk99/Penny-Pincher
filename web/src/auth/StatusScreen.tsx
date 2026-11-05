import type { ReactNode } from "react";
import { Brand } from "../components/Brand";
import "./StatusScreen.css";

/** Full-screen dark panel with the logo: the splash and the few auth dead ends. */
export function StatusScreen({ children }: { children: ReactNode }) {
  return (
    <main className="status-screen">
      <Brand size="lg" />
      {children}
    </main>
  );
}

/** Shown while Firebase restores a saved session and while `/v1/me` loads. */
export function Splash() {
  return (
    <StatusScreen>
      <div role="status" className="status-screen__status">
        <span className="spinner" aria-hidden="true" />
        Checking your session…
      </div>
    </StatusScreen>
  );
}
