import { cn } from "@/lib/utils"

/*
 * App-wide rule (#170, web/AGENTS.md): a skeleton is decoration, hidden from
 * assistive tech. The section it fills says it is busy (aria-busy) and names
 * what is loading; use LoadingSection (src/components/LoadingSection.tsx).
 */

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
