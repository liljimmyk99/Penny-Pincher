import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * App-wide rules (#169, web/AGENTS.md): 44px tall, the card fill in both themes,
 * a 3px focus ring of the ring colour at 35%, and the danger-alert line for
 * aria-invalid (also used by the old .field, so both look the same).
 */

/**
 * The Input's classes, also used by inputs that can't be this component (the
 * merchant combobox renders its own <input>, #176).
 */
const inputClassName = cn(
  "h-11 w-full min-w-0 rounded-md border border-solid border-input bg-card px-3 py-1 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35",
  "aria-invalid:border-danger-alert-line aria-invalid:ring-danger-alert-line/20"
)

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputClassName, className)}
      {...props}
    />
  )
}

export { Input, inputClassName }
