import { useEffect, type ReactNode } from "react";

/**
 * A screen's frame inside the shell: optional eyebrow, the page title (which
 * also names the browser tab) and the content. The title takes focus after
 * navigation (see AppShell), hence tabIndex -1.
 */
export function Page({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  /** Controls beside the title, e.g. a month switcher. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · Penny Pincher`;
  }, [title]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          {eyebrow && <p className="m-0 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{eyebrow}</p>}
          {/* Focused by code after navigation, not something to operate: no focus outline. */}
          <h1 className="m-0 text-[32px] leading-[1.2] font-semibold tracking-[-0.02em] focus:outline-none" tabIndex={-1}>
            {title}
          </h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
