import type { ReactNode } from "react";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** An inline load error (#177): a destructive Alert with an optional "Try again" link. */
export function LoadError({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertDescription>
        <p className="m-0">
          {message}
          {onRetry && (
            <>
              {" "}
              <Button variant="link" className="h-auto p-0 text-inherit" onClick={onRetry}>
                Try again
              </Button>
            </>
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}

/** An inline error that isn't a failed load (a save or confirm that failed, #176). */
export function ErrorAlert({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <Alert variant="destructive" className={className} id={id}>
      <AlertCircleIcon aria-hidden="true" />
      <AlertDescription className="block">{children}</AlertDescription>
    </Alert>
  );
}
