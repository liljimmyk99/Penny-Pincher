import type { FormEvent, ReactNode } from "react";
import { ErrorAlert } from "../../components/LoadError";
import { FieldError, FieldLabel } from "../../components/ui/field";
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
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          {alert && <ErrorAlert>{alert}</ErrorAlert>}
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

/** The two-column grid of an editor's fields (one column at phone width). */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">{children}</div>;
}

/** "optional" after a field label. */
export function Optional() {
  return <span className="font-normal text-muted-foreground">optional</span>;
}

/**
 * A labelled form field with its error (shadcn Field parts, #176). The caller
 * gives the control `id` and wires it with `invalidProps(id, error)`, so the
 * error is `${id}-err` and the editors can focus the first invalid field by id.
 */
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
    <div data-slot="field" data-invalid={error ? true : undefined} className={wide ? "col-span-full flex flex-col gap-1.5" : "flex flex-col gap-1.5"}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
    </div>
  );
}
