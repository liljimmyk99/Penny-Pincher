import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** An inline error on an import card (`role="alert"`). */
export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/** A row of actions at the bottom of an import card, wrapping on narrow windows. */
export function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2.5">{children}</div>;
}
