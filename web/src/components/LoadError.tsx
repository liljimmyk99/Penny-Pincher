import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** An inline load error (#177): a destructive Alert with an optional "Try again" link. */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
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
