import * as Dialog from "@radix-ui/react-dialog";
import { ChangePasswordForm } from "../auth";
import { CloseIcon } from "../components/icons";

/** Change password from the account menu (the forced page is in `src/auth`). */
export function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="dialog" aria-modal="true">
          <div className="dialog__head">
            <div className="dialog__text">
              <Dialog.Title className="dialog__title">Change password</Dialog.Title>
              <Dialog.Description className="dialog__body">
                Enter your current password, then choose a new one.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-btn" aria-label="Close">
              <CloseIcon />
            </Dialog.Close>
          </div>
          <ChangePasswordForm
            currentLabel="Current password"
            onChanged={onChanged}
            secondary={
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Cancel
              </button>
            }
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
