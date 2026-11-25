import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * App-wide rules (#170, web/AGENTS.md):
 * - Badges are 6px radius (rounded-sm), 12px/600 with tabular numerals.
 * - Our domain variants live here so every screen draws them the same way:
 *   `refund` (refund tags), `unconfirmed` (template copies not yet confirmed),
 *   `saving` (Saving's badge) and `income`. Colours come from tokens only.
 * - `destructive` uses the danger-alert tokens, like inline errors.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/35 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        destructive:
          "border-danger-alert-border bg-danger-alert text-danger-alert-foreground",
        refund: "bg-refund-pill text-refund-text",
        unconfirmed: "bg-unconfirmed-pill text-unconfirmed-text",
        saving: "bg-selected text-saving",
        income: "bg-success-alert text-income",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
