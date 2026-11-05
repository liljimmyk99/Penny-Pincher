import { useEffect } from "react";
import { CheckIcon, CloseIcon } from "./icons";
import "./Toast.css";

/** How long a toast stays up before it dismisses itself. */
export const TOAST_MS = 6000;

/**
 * Confirms a background action, e.g. "Refund linked to …" (web/AGENTS.md
 * "Interaction patterns"). The live region is always rendered so screen
 * readers announce the message when it appears; Dismiss or the timer clears it.
 */
export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div role="status" aria-live="polite" className="toast-region">
      {message && (
        <div className="toast">
          <CheckIcon />
          <span>{message}</span>
          <button type="button" className="toast__close" aria-label="Dismiss" onClick={onDismiss}>
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
