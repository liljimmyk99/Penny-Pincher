import { useState, type FormEvent } from "react";
import { ApiError, errorMessage, fieldErrors, useResetUserPassword, type Schemas } from "../../api";
import { AlertIcon } from "../../components/icons";
import { MIN_PASSWORD_LENGTH } from "../../auth/ChangePasswordForm";
import { PasswordField } from "./PasswordField";
import { SignInDetails } from "./SignInDetails";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

interface Props {
  user: Schemas["AdminUser"];
  onClose: () => void;
}

export function ResetPasswordDialog({ user, onClose }: Props) {
  const reset = useResetUserPassword();
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [alert, setAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<{ password: string; mustChange: boolean } | null>(null);
  const who = user.display_name ? `${user.display_name} (${user.username})` : user.username;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    setError(undefined);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    try {
      await reset.mutateAsync({ id: user.id, body: { password, must_change_password: mustChange } });
      setDone({ password, mustChange });
      setPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.code === "weak_password") {
        setError(fieldErrors(err).password ?? errorMessage(err));
      } else setAlert(errorMessage(err));
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !reset.isPending && onClose()}>
      <DialogContent>
        {done ? (
          <SignInDetails
            title="Sign-in details"
            message={`Password reset. ${user.username} was signed out everywhere.`}
            username={user.username}
            {...done}
            onDone={onClose}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Set a new password for {who}</DialogTitle>
              <DialogDescription>
                They will be signed out on every device. Their entries are not touched.
              </DialogDescription>
            </DialogHeader>
            <form className="admin-users__form" noValidate onSubmit={(e) => void submit(e)}>
              <PasswordField label="New password" value={password} onChange={setPassword} error={error} />
              <label className="admin-users__check">
                <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
                Ask them to choose their own password
              </label>
              {alert && (
                <p className="alert alert--danger" role="alert">
                  <AlertIcon width={18} height={18} />
                  {alert}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={reset.isPending} onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={reset.isPending}>
                  {reset.isPending ? "Saving…" : "Reset password"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
