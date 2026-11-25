import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { dialogContentClass, dialogOverlayClass, useReturnFocus } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/*
 * App-wide rules (#171, web/AGENTS.md "Interaction patterns"):
 * - Destructive confirmations: `role="alertdialog"`, the same frame as Dialog
 *   (no transform centring), no Close button and no click-outside dismissal.
 * - Focus starts on Cancel (Radix's default); Esc cancels.
 * - AlertDialogAction is a `destructive` Button naming the outcome, and
 *   AlertDialogCancel a `ghost` one. Both take Button's `variant`.
 * - AlertDialogMedia is the 44px danger tile for the icon beside the text.
 */

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(dialogOverlayClass, className)}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  const returnFocus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus })
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        aria-modal="true"
        className={cn(dialogContentClass, className)}
        {...props}
        {...returnFocus}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-dialog-header" className={cn("flex gap-4", className)} {...props} />
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="alert-dialog-media"
      aria-hidden="true"
      className={cn(
        "flex size-11 flex-none items-center justify-center rounded-xl bg-danger-alert text-danger-alert-foreground [&_svg]:size-[22px]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="alert-dialog-footer" className={cn("flex flex-wrap justify-end gap-2.5", className)} {...props} />
  )
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("m-0 [font:var(--text-section-title)]", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("m-0 text-sm leading-[1.55] text-muted-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = "destructive",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, "variant">) {
  return (
    <Button variant={variant} asChild>
      <AlertDialogPrimitive.Action data-slot="alert-dialog-action" className={className} {...props} />
    </Button>
  )
}

function AlertDialogCancel({
  className,
  variant = "outline",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant">) {
  return (
    <Button variant={variant} asChild>
      <AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" className={className} {...props} />
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
