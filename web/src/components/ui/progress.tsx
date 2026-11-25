import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

/*
 * App-wide rules (#170, web/AGENTS.md):
 * - role="progressbar" with the percent as aria-valuenow (Radix). Give it a name
 *   (aria-label) and a text alternative: `getValueLabel` sets aria-valuetext
 *   (Radix defaults to "N%"), e.g. "1,200 of 4,800 entries".
 * - `value` is passed on to Radix (shadcn's copy used it only for the fill, so
 *   aria-valuenow was missing).
 * - The track is muted, the fill primary; the fill is moved with React's style
 *   prop, which the CSP allows.
 */

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
