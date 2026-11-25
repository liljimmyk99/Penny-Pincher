import { ChangePasswordForm } from "../auth";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";

/** Change password from the account menu (the forced page is in `src/auth`). */
export function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter your current password, then choose a new one.</DialogDescription>
        </DialogHeader>
        <ChangePasswordForm
          currentLabel="Current password"
          onChanged={onChanged}
          secondary={
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
