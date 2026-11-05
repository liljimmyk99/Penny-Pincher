import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { Brand } from "../components/Brand";
import {
  AlertIcon,
  ChartIcon,
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  LockIcon,
  PlusCircleIcon,
} from "../components/icons";
import { useSession } from "./context";
import { authErrorMessage, isCredentialError, toAuthError } from "./errors";
import type { SessionNotice } from "./session";
import type { AuthError } from "./types";
import "./SignInScreen.css";

type Mode = "sign_in" | "reset" | "sent";
type Busy = null | "google" | "email" | "reset";

/**
 * Sign in with Google or email and password, and reset a forgotten password.
 * There is no sign-up: accounts are created by an admin.
 */
export function SignInScreen({ notice }: { notice: SessionNotice | null }) {
  const session = useSession();
  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const ids = useId();
  const errorId = `${ids}-error`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const switched = useRef(false);

  // Move focus to the new heading when switching between sign-in, reset and sent.
  useEffect(() => {
    if (switched.current) headingRef.current?.focus();
  }, [mode]);

  function go(next: Mode) {
    switched.current = true;
    setError(null);
    setMode(next);
  }

  async function attempt(kind: Exclude<Busy, null>, run: () => Promise<void>): Promise<boolean> {
    session.clearNotice();
    setError(null);
    setBusy(kind);
    try {
      await run();
      return true;
    } catch (err) {
      setError(toAuthError(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  function onSignIn(e: FormEvent) {
    e.preventDefault();
    void attempt("email", () => session.auth.signInWithEmail(email.trim(), password));
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    if (await attempt("reset", () => session.auth.sendPasswordReset(email.trim()))) go("sent");
  }

  const errorText = error ? authErrorMessage(error) : "";
  const passwordInvalid = !!error && isCredentialError(error);

  return (
    <div className="signin">
      <BrandPanel />

      <main className="signin__main">
        <div className="signin__card">
          {mode === "sign_in" && (
            <form className="signin__stack" onSubmit={onSignIn}>
              <Heading ref={headingRef} title="Sign in">
                Welcome back. Sign in to pick up where you left off.
              </Heading>

              {errorText ? (
                <Alert id={errorId}>{errorText}</Alert>
              ) : (
                notice && <NoticeAlert notice={notice} />
              )}

              <button
                type="button"
                className="btn btn--ghost btn--block"
                disabled={busy !== null}
                onClick={() => void attempt("google", () => session.auth.signInWithGoogle())}
              >
                <GlobeIcon />
                {busy === "google" ? "Opening Google…" : "Continue with Google"}
              </button>

              <div className="signin__divider">or sign in with email</div>

              <div className="signin__fields">
                <label className="signin__field">
                  <span className="field-label">Email</span>
                  <input
                    className="field"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                <div className="signin__field">
                  <div className="signin__label-row">
                    <label className="field-label" htmlFor={`${ids}-password`}>
                      Password
                    </label>
                    <button type="button" className="text-btn signin__forgot" onClick={() => go("reset")}>
                      Forgot password?
                    </button>
                  </div>
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
                      aria-invalid={passwordInvalid}
                      aria-describedby={passwordInvalid ? errorId : undefined}
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

              <button type="submit" className="btn btn--primary btn--block" disabled={busy !== null}>
                {busy === "email" ? "Signing in…" : "Sign in"}
              </button>

              <p className="signin__note">New here? Accounts are created by an admin.</p>
            </form>
          )}

          {mode === "reset" && (
            <form className="signin__stack" onSubmit={onReset}>
              <BackButton onClick={() => go("sign_in")} />
              <Heading ref={headingRef} title="Reset your password">
                Enter your account email and we'll send you a link to choose a new password.
              </Heading>

              {errorText && <Alert id={errorId}>{errorText}</Alert>}

              <label className="signin__field">
                <span className="field-label">Email</span>
                <input
                  className="field"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={error?.code === "invalid_email"}
                />
              </label>

              <button type="submit" className="btn btn--primary btn--block" disabled={busy !== null}>
                {busy === "reset" ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          {mode === "sent" && (
            <div className="signin__stack">
              <div className="alert alert--success" role="status">
                <CheckIcon />
                <span>
                  <b>Check your email.</b> If an account exists for that address, a reset link is on its
                  way. It expires in 1 hour.
                </span>
              </div>
              <Heading ref={headingRef} title="Reset link sent">
                Didn't get it? Check spam, or try again in a minute.
              </Heading>
              <button type="button" className="btn btn--ghost btn--block" onClick={() => go("sign_in")}>
                Back to sign in
              </button>
            </div>
          )}

          <div className="signin__footer">
            <LockIcon width={14} height={14} />
            Sign-in secured by Firebase Authentication
          </div>
        </div>
      </main>
    </div>
  );
}

function Heading({
  title,
  children,
  ref,
}: {
  title: string;
  children: ReactNode;
  ref: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="signin__head">
      <h1 ref={ref} tabIndex={-1}>
        {title}
      </h1>
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

function NoticeAlert({ notice }: { notice: SessionNotice }) {
  if (notice.kind === "no_access") {
    return (
      <Alert>
        <b>No access.</b> {notice.email ?? "This account"} isn't set up for Penny Pincher. Ask an admin to
        add you, or sign in with a different account.
      </Alert>
    );
  }
  return <Alert>Your session has expired. Please sign in again.</Alert>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="text-btn signin__back" onClick={onClick}>
      <ChevronLeftIcon />
      Back to sign in
    </button>
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

function BrandPanel() {
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
