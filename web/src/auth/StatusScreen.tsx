import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "../components/Brand";

/** Full-screen dark panel with the logo: the splash and the few auth dead ends. */
export function StatusScreen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 bg-sidebar px-4 py-8 text-center text-sidebar-foreground">
      <Brand size="lg" />
      {children}
    </main>
  );
}

/** A short explanation on the status screen, in the sidebar's muted text. */
export function StatusMessage({ children, role }: { children: ReactNode; role?: "alert" }) {
  return (
    <p role={role} className="m-0 max-w-[420px] text-[15px] leading-normal text-sidebar-muted-foreground">
      {children}
    </p>
  );
}

/** Buttons under a status message, centred and wrapping. */
export function StatusActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-center gap-3">{children}</div>;
}

/** Shown while `GET /v1/me` checks the stored session token. */
export function Splash() {
  return (
    <StatusScreen>
      <div role="status" className="flex items-center gap-3.5 text-[15px] font-semibold text-sidebar-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-9 text-brand-on-sidebar motion-safe:animate-spin" />
        Checking your session…
      </div>
    </StatusScreen>
  );
}
