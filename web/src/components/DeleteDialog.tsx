import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertIcon, TrashIcon } from "./icons";

interface Props {
  open: boolean;
  title: string;
  body: string;
  extra?: string;
  /** The danger button, naming the outcome (e.g. "Delete and move to Other"). */
  confirmLabel: string;
  /** The safe button; defaults to "Cancel". */
  cancelLabel?: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The destructive confirmation (web/AGENTS.md "Interaction patterns"):
 * `role="alertdialog"`, focus trapped, Esc cancels, and a danger button that
 * names the outcome.
 */
export function DeleteDialog({ open, title, body, extra, confirmLabel, cancelLabel = "Cancel", pending, error, onConfirm, onCancel }: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-backdrop" />
        <AlertDialog.Content className="dialog" aria-modal="true">
          <div className="dialog__head">
            <span className="dialog__warn" aria-hidden="true">
              <TrashIcon width={22} height={22} />
            </span>
            <div className="dialog__text">
              <AlertDialog.Title className="dialog__title">{title}</AlertDialog.Title>
              <AlertDialog.Description className="dialog__body">{body}</AlertDialog.Description>
              {extra && <p className="dialog__body">{extra}</p>}
            </div>
          </div>
          {error && (
            <p role="alert" className="alert alert--danger">
              <AlertIcon width={18} height={18} />
              {error}
            </p>
          )}
          <div className="dialog__actions">
            <AlertDialog.Cancel className="btn btn--ghost" disabled={pending}>
              {cancelLabel}
            </AlertDialog.Cancel>
            <button type="button" className="btn btn--danger" onClick={onConfirm} disabled={pending}>
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
