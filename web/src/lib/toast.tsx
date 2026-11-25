import { toast as sonner } from "sonner";

/** An optional button on a toast, e.g. Undo. Clicking it also dismisses the toast. */
export type ToastAction = { label: string; onClick: () => void };

/**
 * Confirms a finished background action ("Refund linked to …", "Backup
 * finished"). Announced politely by the Toaster's live region. A toast never
 * holds the only copy of something the user needs; the screen shows it too.
 */
function confirm(message: string, options: { action?: ToastAction } = {}) {
  return sonner.success(message, { action: options.action });
}

/** Reports a failed background action. Announced assertively. */
function error(message: string) {
  return sonner.error(<span role="alert">{message}</span>);
}

/** The one toast helper feature code uses (web/AGENTS.md); the Toaster lives in AppShell. */
export const toast = Object.assign(confirm, { error });
