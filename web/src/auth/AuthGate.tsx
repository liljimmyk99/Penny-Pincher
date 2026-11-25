import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { errorMessage, isSessionError, useMe, ApiError } from "../api";
import { useSession, useSessionState } from "./context";
import { ChangePasswordScreen } from "./ChangePasswordScreen";
import { SignInScreen } from "./SignInScreen";
import { Splash, StatusScreen } from "./StatusScreen";

/**
 * Renders the app only for a signed-in user: the sign-in screen when signed
 * out; otherwise the splash while `GET /v1/me` checks the stored token, then
 * the forced Change password page if the password must change, then the app.
 * A 401 from any request signs the user out (see `Session.end`).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const state = useSessionState();
  const queryClient = useQueryClient();

  // Nothing fetched for one user may survive into the next session.
  useEffect(() => {
    if (state.status === "signed_out") queryClient.clear();
  }, [state.status, queryClient]);

  if (state.status === "signed_out") return <SignInScreen notice={state.notice} />;
  return <CheckedSession mustChange={state.mustChange}>{children}</CheckedSession>;
}

function CheckedSession({ mustChange, children }: { mustChange: boolean; children: ReactNode }) {
  const me = useMe();
  const queryClient = useQueryClient();
  if (me.isSuccess) {
    if (mustChange || me.data.must_change_password) {
      return <ChangePasswordScreen onChanged={() => void queryClient.invalidateQueries()} />;
    }
    return <>{children}</>;
  }
  // A session error is already signing us out; keep the splash up until it does.
  if (me.isPending || (me.error instanceof ApiError && isSessionError(me.error))) return <Splash />;
  return <MeFailed error={me.error} retry={() => void me.refetch()} />;
}

/** `/v1/me` failed for a reason other than the session (network, server error). */
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
