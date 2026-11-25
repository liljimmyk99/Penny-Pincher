import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/*
 * App-wide rules (#171, web/AGENTS.md "Interaction patterns"):
 * - Centred with `inset-0` + auto margins, never a transform: a transform would
 *   make the dialog the containing block for fixed popups inside it (the
 *   merchant combobox's list). The zoom animation's transform only runs while
 *   opening and closing.
 * - At most 480px wide (`className` widens it), 16px from every edge at phone
 *   width, and scrolls inside when taller than the screen.
 * - The Close button (on by default) is a 44px ghost icon Button named "Close".
 *   Closing while something is saving is blocked by the caller's onOpenChange.
 */

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/** The backdrop; shared with AlertDialog's. */
const overlayClass =
  "fixed inset-0 z-50 bg-[var(--backdrop)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"

/** The panel; shared with AlertDialog's. */
const contentClass =
  "fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-32px))] flex-col gap-4 overflow-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-[var(--shadow-dialog)] outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none"

/**
 * Radix only returns focus to a `DialogTrigger`, and our dialogs open from
 * state (a row's Edit button, a menu item), so remember what had focus when
 * the dialog opened and focus it again on close. Skipped when another dialog
 * has opened in its place (apply a template → the reset confirmation), or when
 * that element has left the page. The caller's handlers still run first and can
 * opt out with `preventDefault()`.
 */
function useReturnFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const returnTo = React.useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus(event: Event) {
      // Radix calls this before it moves focus, so this is still the opener.
      const active = document.activeElement
      returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null
      onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      event.preventDefault()
      const target = returnTo.current
      returnTo.current = null
      const otherDialogOpen = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
      )
      if (target?.isConnected && !otherDialogOpen) target.focus()
    },
  }
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn(overlayClass, className)} {...props} />
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const returnFocus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus })
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        aria-modal="true"
        className={cn(contentClass, showCloseButton && "[&>[data-slot=dialog-header]]:pr-10", className)}
        {...props}
        {...returnFocus}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Close" className="absolute top-3 right-3">
              <XIcon className="size-5" />
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex min-w-0 flex-col gap-2", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-footer" className={cn("flex flex-wrap justify-end gap-2.5", className)} {...props} />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("m-0 [font:var(--text-section-title)]", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("m-0 text-sm leading-[1.55] text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  contentClass as dialogContentClass,
  overlayClass as dialogOverlayClass,
  useReturnFocus,
}
