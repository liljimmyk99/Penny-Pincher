import { CheckIcon, CircleAlertIcon, XIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/*
 * App-wide rules (#173, web/AGENTS.md "Interaction patterns"): mounted once,
 * in AppShell. Feature code never imports `sonner`; it calls `toast()` from
 * `@/lib/toast`. Toasts are unstyled Sonner toasts drawn with our tokens
 * (light theme: dark toast; dark theme: light toast), bottom right, 24px from
 * the edges (16px on narrow screens, Sonner's defaults), and dismissible.
 * The app has no Tailwind preflight, so buttons reset their own fill and border.
 * Sonner's region is the polite live region; `toast.error` content is
 * `role="alert"`. Sonner's stylesheet is adopted, not injected (#168).
 */

/** How long a toast stays up before it dismisses itself. */
export const TOAST_MS = 6000

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      duration={TOAST_MS}
      closeButton
      containerAriaLabel="Notifications"
      icons={{
        success: <CheckIcon className="size-4" aria-hidden="true" />,
        error: <CircleAlertIcon className="size-4" aria-hidden="true" />,
        close: <XIcon className="size-4" aria-hidden="true" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: "Dismiss",
        classNames: {
          toast:
            "flex items-center gap-3 rounded-xl bg-toast py-2.5 pr-2.5 pl-4 font-sans text-sm font-semibold text-toast-foreground shadow-[var(--shadow-menu)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          icon: "flex flex-none items-center",
          content: "min-w-0 flex-1",
          actionButton:
            "inline-flex h-8 flex-none cursor-pointer items-center rounded-lg border-0 bg-transparent px-3 font-sans text-sm font-semibold text-inherit underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-current",
          closeButton:
            "order-last inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0 text-inherit opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
