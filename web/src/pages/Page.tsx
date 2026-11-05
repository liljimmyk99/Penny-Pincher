import { useEffect, type ReactNode } from "react";
import "./Page.css";

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
    <div className="page">
      <header className="page__header">
        <div className="page__heading">
          {eyebrow && <p className="eyebrow page__eyebrow">{eyebrow}</p>}
          <h1 className="page__title" tabIndex={-1}>
            {title}
          </h1>
        </div>
        {actions && <div className="page__actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
