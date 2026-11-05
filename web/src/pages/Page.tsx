import { useEffect, type ReactNode } from "react";
import "./Page.css";

/**
 * A screen's frame inside the shell: optional eyebrow, the page title (which
 * also names the browser tab) and the content. The title takes focus after
 * navigation (see AppShell), hence tabIndex -1.
 */
export function Page({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Penny Pincher`;
  }, [title]);

  return (
    <div className="page">
      <header className="page__header">
        {eyebrow && <p className="eyebrow page__eyebrow">{eyebrow}</p>}
        <h1 className="page__title" tabIndex={-1}>
          {title}
        </h1>
      </header>
      {children}
    </div>
  );
}
