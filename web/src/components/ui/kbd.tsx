import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * shadcn's kbd (#175), adapted to the V2 boards: 11px/500, a 1px border with a
 * 2px bottom edge, 4px radius, on the muted fill. Plain elements, so nothing
 * injects styles (CSP).
 */

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-[4px] border border-b-2 border-solid border-input bg-muted px-1.5 font-sans text-[11px] font-medium text-foreground select-none",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
