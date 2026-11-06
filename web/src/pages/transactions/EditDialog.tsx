import * as Dialog from "@radix-ui/react-dialog";
import type { FormEvent, ReactNode } from "react";
import { AlertIcon } from "../../components/icons";

interface Props {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  alert: string | null;
  onSubmit: () => void;
  onClose: () => void;
  /** The submit button; "Save changes" unless given. */
  submitLabel?: string;
  children: ReactNode;
}

/**
 * The modal frame shared by the expense and income editors: focus trapped,
 * Esc and Cancel close it (unless a save is in flight), labelled by its heading.
 */
export function EditDialog({
  open,
  title,
  description,
  pending,
  alert,
  onSubmit,
  onClose,
  submitLabel = "Save changes",
  children,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="dialog edit-dialog" aria-modal="true">
          <div className="dialog__text">
            <Dialog.Title className="dialog__title">{title}</Dialog.Title>
            <Dialog.Description className="dialog__body">{description}</Dialog.Description>
          </div>
          <form
            className="edit-form"
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {children}
            {alert && (
              <p role="alert" className="alert alert--danger">
                <AlertIcon width={18} height={18} />
                {alert}
              </p>
            )}
            <div className="dialog__actions">
              <Dialog.Close className="btn btn--ghost" type="button" disabled={pending}>
                Cancel
              </Dialog.Close>
              <button type="submit" className="btn btn--primary" disabled={pending}>
                {pending ? "Saving…" : submitLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A labelled form field with its error, wired with aria-describedby. */
export function FormField({
  id,
  label,
  error,
  wide,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "edit-form__field edit-form__field--wide" : "edit-form__field"}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-err`} className="edit-form__error">
          {error}
        </p>
      )}
    </div>
  );
}
