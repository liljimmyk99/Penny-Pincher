import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, errorMessage } from "../api";
import { Brand } from "../components/Brand";
import {
  AlertIcon,
  ChartIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  PlusCircleIcon,
} from "../components/icons";
import { useSession } from "./context";
import type { SessionNotice } from "./session";
import "./SignInScreen.css";

/** The one line shown under a failed sign-in. It never says which half was wrong. */
function signInError(err: unknown): string {
  if (err instanceof ApiError && err.code === "rate_limited") {
    return "Too many attempts. Try again in a minute.";
  }
  return errorMessage(err);
}

/**
 * Sign in with a username and password. There is no sign-up, no Google and no
 * reset email: an admin creates accounts and resets forgotten passwords.
 */
export function SignInScreen({ notice }: { notice: SessionNotice | null }) {
  const session = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const ids = useId();
  const errorId = `${ids}-error`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await session.signIn(username.trim(), password);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const failed = error !== null;
  const credentialError = error instanceof ApiError && error.code === "invalid_credentials";

  return (
    <div className="signin">
      <BrandPanel />

      <main className="signin__main">
        <div className="signin__card">
          <form className="signin__stack" onSubmit={(e) => void onSubmit(e)}>
            <Heading title="Sign in">Welcome back. Sign in to pick up where you left off.</Heading>

            {failed ? (
              <Alert id={errorId}>{signInError(error)}</Alert>
            ) : (
              notice && <Alert>Your session has expired. Please sign in again.</Alert>
            )}

            <div className="signin__fields">
              <label className="signin__field">
                <span className="field-label">Username</span>
                <input
                  className="field"
                  type="text"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>

              <div className="signin__field">
                <label className="field-label" htmlFor={`${ids}-password`}>
                  Password
                </label>
                <div className="signin__password">
                  <input
                    id={`${ids}-password`}
                    className="field"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={credentialError}
                    aria-describedby={credentialError ? errorId : undefined}
                  />
                  <button
                    type="button"
                    className="signin__toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <p className="signin__note">
              New here, or forgot your password? Accounts are created and passwords are reset by an admin. Ask
              them.
            </p>
          </form>

          <div className="signin__footer">
            <LockIcon width={14} height={14} />
            Your data stays on your own server
          </div>
        </div>
      </main>
    </div>
  );
}

function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="signin__head">
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}

function Alert({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div id={id} className="alert alert--danger" role="alert">
      <AlertIcon />
      <span>{children}</span>
    </div>
  );
}

const FEATURES = [
  {
    icon: <PlusCircleIcon />,
    title: "Log as you go, or in batches",
    text: "Quick entry for one expense, a table for a whole receipt pile.",
  },
  {
    icon: <CopyIcon />,
    title: "Start each month from a template",
    text: "Rent, bills and paychecks drop in, ready to confirm.",
  },
  {
    icon: <ChartIcon />,
    title: "See where it goes",
    text: "Monthly and yearly summaries, plus trends for anything you track.",
  },
];

export function BrandPanel() {
  return (
    <section className="signin__panel" aria-label="About Penny Pincher">
      <Brand />
      <div className="signin__pitch">
        <h2>Every paycheck and purchase, one month at a time.</h2>
        <ul className="signin__features">
          {FEATURES.map((f) => (
            <li key={f.title} className="signin__feature">
              <span className="signin__feature-icon" aria-hidden="true">
                {f.icon}
              </span>
              <span>
                <b>{f.title}</b>
                <span>{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <span className="signin__meta">Self-hosted</span>
    </section>
  );
}
