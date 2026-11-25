import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/*
 * App-wide rules (#170, web/AGENTS.md):
 * - Variants on our alert tokens: `destructive` (inline errors, danger alert),
 *   `success` (confirmations), `info` (neutral banners) and `default`.
 * - The role follows the variant: an error interrupts (`alert`), the others are
 *   announced politely (`status`). A `role` prop still wins.
 * - The description keeps the alert's text colour, so it meets contrast on the
 *   tinted fills (shadcn's muted description would not).
 */
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        destructive:
          "border-danger-alert-border bg-danger-alert text-danger-alert-foreground",
        success:
          "border-success-alert-border bg-success-alert text-success-alert-foreground",
        info: "border-info-alert-border bg-info-alert text-info-alert-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>

function Alert({
  className,
  variant = "default",
  role,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  const v: AlertVariant = variant ?? "default"
  return (
    <div
      data-slot="alert"
      data-variant={v}
      role={role ?? (v === "destructive" ? "alert" : "status")}
      className={cn(alertVariants({ variant: v }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 min-h-4 font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-current [&_p]:m-0 [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
