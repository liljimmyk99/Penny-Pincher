import * as Dialog from "@radix-ui/react-dialog";
import { useState, type FormEvent } from "react";
import { ApiError, errorMessage, fieldErrors, useResetUserPassword, type Schemas } from "../../api";
import { AlertIcon, CloseIcon } from "../../components/icons";
import { MIN_PASSWORD_LENGTH } from "../../auth/ChangePasswordForm";
import { PasswordField } from "./PasswordField";
import { SignInDetails } from "./SignInDetails";

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
    <Dialog.Root open onOpenChange={(next) => !next && !reset.isPending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="dialog" aria-modal="true">
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
              <div className="dialog__head">
                <div className="dialog__text">
                  <Dialog.Title className="dialog__title">Set a new password for {who}</Dialog.Title>
                  <Dialog.Description className="dialog__body">
                    They will be signed out on every device. Their entries are not touched.
                  </Dialog.Description>
                </div>
                <Dialog.Close className="icon-btn" aria-label="Close" disabled={reset.isPending}>
                  <CloseIcon />
                </Dialog.Close>
              </div>
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
                <div className="dialog__actions">
                  <button type="button" className="btn btn--ghost" disabled={reset.isPending} onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary" disabled={reset.isPending}>
                    {reset.isPending ? "Saving…" : "Reset password"}
                  </button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
