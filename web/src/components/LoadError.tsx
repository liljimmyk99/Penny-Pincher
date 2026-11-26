import type { ReactNode } from "react";
import { AlertCircleIcon } from "lucide-react";
import { errorMessage } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A failed load (#176): "Couldn’t load <what>. <reason>" with Try again, as a
 * destructive Alert (role="alert").
 */
export function LoadError({
  what,
  error,
  retry,
  className,
}: {
  /** What failed to load, e.g. "this month’s income". */
  what: string;
  error: unknown;
  retry: () => void;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircleIcon aria-hidden="true" />
      <AlertDescription className="block">
        Couldn’t load {what}. {errorMessage(error)}{" "}
        <Button variant="link" className="h-auto p-0 text-current underline" onClick={retry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** An inline error that isn't a failed load (a save or confirm that failed). */
export function ErrorAlert({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <Alert variant="destructive" className={cn(className)} id={id}>
      <AlertCircleIcon aria-hidden="true" />
      <AlertDescription className="block">{children}</AlertDescription>
    </Alert>
  );
}
