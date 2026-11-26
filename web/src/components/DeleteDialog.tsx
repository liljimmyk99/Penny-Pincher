import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Trash2Icon } from "lucide-react";
import { ErrorAlert } from "./LoadError";

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
 * `role="alertdialog"`, focus trapped and starting on Cancel, Esc cancels, and
 * a danger button that names the outcome. The dialog stays open while the
 * action runs; the caller closes it on success.
 */
export function DeleteDialog({ open, title, body, extra, confirmLabel, cancelLabel = "Cancel", pending, error, onConfirm, onCancel }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <div className="flex min-w-0 flex-col gap-2">
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{body}</AlertDialogDescription>
            {extra && <p className="m-0 text-sm leading-[1.55] text-muted-foreground">{extra}</p>}
          </div>
        </AlertDialogHeader>
        {error && <ErrorAlert>{error}</ErrorAlert>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
