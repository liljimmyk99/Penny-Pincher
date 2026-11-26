import { ChartLine, CircleAlert, CirclePlus, Copy, Lock } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { FormField } from "@/components/FormField";
import { PasswordInput } from "@/components/PasswordInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, errorMessage } from "../api";
import { Brand } from "../components/Brand";
import { useSession } from "./context";
import type { SessionNotice } from "./session";

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
    <AuthLayout
      footer={
        <div className="flex items-center justify-center gap-2 border-t border-border pt-3.5 text-xs font-semibold text-muted-foreground">
          <Lock aria-hidden="true" className="size-3.5" />
          Your data stays on your own server
        </div>
      }
    >
      <form className="flex flex-col gap-[22px]" onSubmit={(e) => void onSubmit(e)}>
        <AuthHeading title="Sign in">Welcome back. Sign in to pick up where you left off.</AuthHeading>

        {failed ? (
          <ErrorAlert id={errorId}>{signInError(error)}</ErrorAlert>
        ) : (
          notice && <ErrorAlert>Your session has expired. Please sign in again.</ErrorAlert>
        )}

        <div className="flex flex-col gap-4">
          <FormField label="Username">
            {(control) => (
              <Input
                {...control}
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
          </FormField>

          <FormField label="Password" invalid={credentialError} describedBy={credentialError ? errorId : undefined}>
            {(control) => (
              <PasswordInput
                {...control}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </FormField>
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>

        <p className="m-0 text-center text-[13px] leading-normal text-muted-foreground">
          New here, or forgot your password? Accounts are created and passwords are reset by an admin. Ask
          them.
        </p>
      </form>
    </AuthLayout>
  );
}

/** The title and lead line at the top of the auth card. */
export function AuthHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em] focus:outline-none">{title}</h1>
      <p className="m-0 text-[15px] text-muted-foreground">{children}</p>
    </div>
  );
}

function ErrorAlert({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <Alert id={id} variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/**
 * The split sign-in layout: the dark brand panel on the left and the card on
 * the right. Below 600px the panel shrinks to a header with just the logo.
 */
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap content-start bg-background min-[601px]:content-stretch">
      <BrandPanel />
      <main className="flex min-w-0 flex-[1_1_480px] items-start justify-center px-4 py-6 min-[601px]:items-center min-[601px]:py-12">
        <Card className="w-full max-w-[420px] gap-[22px] px-6 pt-7 pb-6 shadow-[var(--shadow-raised)] min-[601px]:px-8 min-[601px]:pt-9 min-[601px]:pb-7">
          {children}
          {footer}
        </Card>
      </main>
    </div>
  );
}

const FEATURES = [
  {
    icon: <CirclePlus />,
    title: "Log as you go, or in batches",
    text: "Quick entry for one expense, a table for a whole receipt pile.",
  },
  {
    icon: <Copy />,
    title: "Start each month from a template",
    text: "Rent, bills and paychecks drop in, ready to confirm.",
  },
  {
    icon: <ChartLine />,
    title: "See where it goes",
    text: "Monthly and yearly summaries, plus trends for anything you track.",
  },
];

export function BrandPanel() {
  return (
    <section
      aria-label="About Penny Pincher"
      className="flex min-w-0 flex-[1_1_100%] flex-col justify-between gap-12 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground min-[601px]:flex-[1_1_480px] min-[601px]:p-[clamp(32px,6vw,72px)]"
    >
      <Brand />
      <div className="hidden max-w-[460px] flex-col gap-8 min-[601px]:flex">
        <h2 className="m-0 text-[clamp(30px,3.4vw,42px)] leading-[1.12] font-extrabold tracking-[-0.025em]">
          Every paycheck and purchase, one month at a time.
        </h2>
        <ul className="m-0 flex list-none flex-col gap-[22px] p-0">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="flex size-10 flex-none items-center justify-center rounded-md bg-white/8 text-brand-on-sidebar [&_svg]:size-5"
              >
                {f.icon}
              </span>
              <span className="flex flex-col gap-1 text-sm text-sidebar-muted-foreground">
                <b className="text-base text-sidebar-foreground">{f.title}</b>
                <span>{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <span className="hidden text-[13px] text-sidebar-muted-foreground min-[601px]:inline">Self-hosted</span>
    </section>
  );
}
