import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { errorMessage, isSessionError, useMe, ApiError } from "../api";
import { useSession, useSessionState } from "./context";
import { SignInScreen } from "./SignInScreen";
import { Splash, StatusScreen } from "./StatusScreen";

/**
 * Renders the app only for a signed-in, allowlisted user:
 * splash while Firebase restores the session, the sign-in screen when signed
 * out, then `/v1/me` before anything else. A 403 `not_allowlisted` from the API
 * signs the user out (see `Session.end`) and the sign-in screen says why.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const state = useSessionState();
  const queryClient = useQueryClient();

  // Nothing fetched for one user may survive into the next session.
  useEffect(() => {
    if (state.status === "signed_out") queryClient.clear();
  }, [state.status, queryClient]);

  switch (state.status) {
    case "restoring":
      return <Splash />;
    case "signed_out":
      return <SignInScreen notice={state.notice} />;
    case "signed_in":
      return <Allowlisted key={state.user.uid}>{children}</Allowlisted>;
  }
}

function Allowlisted({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isSuccess) return <>{children}</>;
  // A session error is already signing us out; keep the splash up until it does.
  if (me.isPending || (me.error instanceof ApiError && isSessionError(me.error))) return <Splash />;
  return <MeFailed error={me.error} retry={() => void me.refetch()} />;
}

/** `/v1/me` failed for a reason other than access (network, server error). */
function MeFailed({ error, retry }: { error: unknown; retry: () => void }) {
  const session = useSession();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <StatusScreen>
      <p className="status-screen__message" role="alert">
        {errorMessage(error)}
      </p>
      <div className="status-screen__actions">
        <button type="button" className="btn btn--primary" onClick={retry}>
          Try again
        </button>
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
    </StatusScreen>
  );
}
