import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Toggle as TogglePrimitive } from "radix-ui"

/*
 * App-wide rules (#170, web/AGENTS.md):
 * - 44px by default (our touch target); `sm` (36px) only in dense rows.
 * - On (pressed, or checked in a ToggleGroup) uses the selected tokens.
 * - Focus is the 3px ring at 35%. A lone Toggle is a filter chip (aria-pressed);
 *   one-of-N choices use ToggleGroup type="single" (radio semantics).
 */

const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border-0 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-[color,box-shadow] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-selected data-[state=on]:text-selected-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-solid border-input bg-card shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-11 min-w-11 px-3",
        sm: "h-9 min-w-9 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
