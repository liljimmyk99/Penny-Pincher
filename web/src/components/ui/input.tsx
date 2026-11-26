import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/*
 * App-wide rules (#169, web/AGENTS.md): 44px tall, the card fill in both themes,
 * a 3px focus ring of the ring colour at 35%, and the danger-alert line for
 * aria-invalid (also used by the old .field, so both look the same).
 *
 * `cell` (#175) is the quiet input inside a table row (the Add entries batch,
 * template items): 38px, no border or fill until hover or focus, so a grid of
 * them reads as a table rather than a stack of boxes.
 */
const inputVariants = cva(
  "w-full min-w-0 rounded-md border border-solid text-foreground transition-[color,box-shadow,background-color,border-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 aria-invalid:border-danger-alert-line aria-invalid:ring-danger-alert-line/20",
  {
    variants: {
      variant: {
        default: "h-11 border-input bg-card px-3 py-1 text-base shadow-xs md:text-sm",
        cell: "h-9.5 border-transparent bg-transparent px-2 text-sm shadow-none hover:border-input focus-visible:bg-card",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Input({
  className,
  type,
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
