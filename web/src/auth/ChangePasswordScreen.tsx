import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { meQueryKey, type Schemas } from "../api";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { useSession } from "./context";
import { BrandPanel } from "./SignInScreen";
import "./SignInScreen.css";

/**
 * The forced Change password page: shown full-page, with nothing else
 * reachable, to a user whose password an admin set or reset.
 */
export function ChangePasswordScreen({ onChanged }: { onChanged: () => void }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="signin">
      <BrandPanel />
      <main className="signin__main">
        <div className="signin__card">
          <div className="signin__head">
            <h1>Choose a new password</h1>
            <p>An admin set your password. Choose your own to continue.</p>
          </div>
          <ChangePasswordForm
            currentLabel="Temporary password"
            onChanged={() => {
              queryClient.setQueryData<Schemas["Me"]>(meQueryKey, (me) =>
                me ? { ...me, must_change_password: false } : me,
              );
              onChanged();
            }}
            secondary={
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
            }
          />
        </div>
      </main>
    </div>
  );
}
