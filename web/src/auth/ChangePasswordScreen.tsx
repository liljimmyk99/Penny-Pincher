import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { meQueryKey, type Schemas } from "../api";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { useSession } from "./context";
import { AuthHeading, AuthLayout } from "./SignInScreen";

/**
 * The forced Change password page: shown full-page, with nothing else
 * reachable, to a user whose password an admin set or reset.
 */
export function ChangePasswordScreen({ onChanged }: { onChanged: () => void }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <AuthLayout>
      <AuthHeading title="Choose a new password">An admin set your password. Choose your own to continue.</AuthHeading>
      <ChangePasswordForm
        currentLabel="Temporary password"
        onChanged={() => {
          queryClient.setQueryData<Schemas["Me"]>(meQueryKey, (me) =>
            me ? { ...me, must_change_password: false } : me,
          );
          onChanged();
            }}
        secondary={
          <Button
            type="button"
            variant="ghost"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              session.signOut().catch(() => setSigningOut(false));
                }}
              >
            Sign out
          </Button>
            }
      />
    </AuthLayout>
  );
}
