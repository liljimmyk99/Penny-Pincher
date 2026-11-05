import { useState } from "react";
import { useMe } from "./api";
import { useSession } from "./auth";
import { ThemeSwitch } from "./theme/ThemeSwitch";
import "./App.css";

/**
 * Placeholder shell for a signed-in user (AuthGate has already loaded `/v1/me`).
 * The sidebar, account menu and screens arrive in later issues.
 */
export function App() {
  const me = useMe();
  const session = useSession();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <main className="app">
      <header className="app__header">
        <h1>Penny Pincher</h1>
        <div className="app__account">
          <ThemeSwitch />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              session.signOut().catch(() => setSigningOut(false));
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <section className="card app__card">
        <p className="eyebrow">Signed in as</p>
        <p className="app__email">{me.data?.email ?? me.data?.display_name ?? "your account"}</p>
      </section>
    </main>
  );
}
