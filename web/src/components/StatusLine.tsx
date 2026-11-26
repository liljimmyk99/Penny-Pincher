import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A quiet one-line status (loading, empty, "nothing saved yet") in muted text.
 * `inset` pads it to a flush SectionCard's 20px edge.
 */
export function StatusLine({
  children,
  inset = false,
  live = true,
  className,
}: {
  children: ReactNode;
  inset?: boolean;
  /** Announce changes (`role="status"`); off for static notes. */
  live?: boolean;
  className?: string;
}) {
  return (
    <p role={live ? "status" : undefined} className={cn("m-0 text-sm text-muted-foreground", inset && "px-5", className)}>
      {children}
    </p>
  );
}
