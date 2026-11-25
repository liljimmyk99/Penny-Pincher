import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type LoadingSectionProps = {
  /** What is loading, read to screen readers as "Loading <label>…". */
  label: string;
  /** Number of placeholder rows when no children are given. */
  rows?: number;
  /** Custom skeleton layout; defaults to `rows` full-width bars. */
  children?: ReactNode;
  className?: string;
};

/**
 * A loading placeholder (#170): the section is `aria-busy` and says what is
 * loading in text, while the skeleton shapes stay hidden from assistive tech.
 */
export function LoadingSection({ label, rows = 3, children, className }: LoadingSectionProps) {
  return (
    <section aria-busy="true" aria-label={`Loading ${label}`} className={cn("flex flex-col gap-3", className)}>
      <span className="sr-only">Loading {label}…</span>
      {children ?? Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </section>
  );
}
