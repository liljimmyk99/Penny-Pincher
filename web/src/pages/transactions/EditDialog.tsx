import type { FormEvent, ReactNode } from "react";
import { AlertIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

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
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="w-[min(560px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
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
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
