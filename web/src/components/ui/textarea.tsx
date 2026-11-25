import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * App-wide rules (#169, web/AGENTS.md): at least 44px tall, the card fill in both themes,
 * a 3px focus ring of the ring colour at 35%, and the danger-alert line for
 * aria-invalid (also used by the old .field, so both look the same).
 */

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-solid border-input bg-card px-3 py-2.5 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-invalid:border-danger-alert-line aria-invalid:ring-danger-alert-line/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
