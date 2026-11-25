import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * App-wide rules (#169, web/AGENTS.md):
 * - 44px tall by default (our minimum touch target; shadcn's is 36px). `sm` (36px)
 *   is only for dense table rows, `icon` / `icon-sm` are the square icon buttons.
 * - Colours come from our tokens: hover shades are their own tokens rather than
 *   an opacity, and `success` is the green Save / confirm button.
 * - The focus ring is 3px of the ring colour at 35%; invalid uses the danger-alert line.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap no-underline transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger-alert-line aria-invalid:ring-danger-alert-line/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        success: "bg-success text-success-foreground hover:bg-success-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        outline:
          "border border-input bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "bg-transparent text-link underline-offset-4 hover:text-link-hover hover:underline",
      },
      size: {
        default: "h-11 px-4 has-[>svg]:px-3",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>

/** An icon-only button has no text, so it must be named with `aria-label`. */
type SizeProps =
  | { size?: Exclude<ButtonSize, "icon" | "icon-sm"> }
  | { size: "icon" | "icon-sm"; "aria-label": string }

type ButtonProps = Omit<React.ComponentProps<"button">, "aria-label"> & {
  "aria-label"?: string
  variant?: VariantProps<typeof buttonVariants>["variant"]
  asChild?: boolean
} & SizeProps

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
