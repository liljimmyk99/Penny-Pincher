/**
 * Constructed stylesheets (`document.adoptedStyleSheets`) for dependencies that
 * would otherwise inject CSS as a <style> element, which the Content-Security-
 * Policy blocks (`style-src` has no 'unsafe-inline'; deploy/Caddyfile). The CSP
 * doesn't restrict constructed stylesheets, so the same CSS still applies.
 *
 * `plugins/cspSafeStyles.ts` rewrites the dependencies to call these (#168):
 * - Sonner injects its whole stylesheet when it is first imported → `insertCss`.
 * - Radix Select and ScrollArea render a `<style>` element that hides their
 *   viewport's scrollbar → `CspStyle`, which renders nothing and adopts the CSS
 *   while mounted.
 * Radix's scroll lock has its own stand-in, `cspStyleSingleton.ts`, because its
 * CSS changes with the scrollbar's width.
 *
 * Where constructed stylesheets aren't supported nothing is added: the page loses
 * those cosmetic rules rather than reporting a CSP violation.
 */
import { useLayoutEffect } from "react";

export function canAdopt(): boolean {
  return (
    typeof document !== "undefined" &&
    "adoptedStyleSheets" in document &&
    typeof CSSStyleSheet === "function" &&
    "replaceSync" in CSSStyleSheet.prototype
  );
}

/** One sheet per distinct CSS text, kept while anything still uses it. */
const shared = new Map<string, { sheet: CSSStyleSheet; users: number }>();

/** Adopts `css` once, however many callers ask for it; the returned function releases this caller's use. */
export function adoptCss(css: string): () => void {
  if (!css || !canAdopt()) return () => {};
  let entry = shared.get(css);
  if (!entry) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    entry = { sheet, users: 0 };
    shared.set(css, entry);
  }
  entry.users++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = shared.get(css);
    if (!current || --current.users > 0) return;
    shared.delete(css);
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== current.sheet);
  };
}

/** For CSS a package adds once at import time and never removes (Sonner's `__insertCSS`). */
export function insertCss(css: string): void {
  adoptCss(css);
}

/** Stands in for a `<style dangerouslySetInnerHTML>` element: same CSS, adopted while mounted. */
export function CspStyle(props: { dangerouslySetInnerHTML?: { __html?: unknown }; nonce?: string }): null {
  const html = props.dangerouslySetInnerHTML?.__html;
  const css = typeof html === "string" ? html : "";
  // Layout effect, so the rule is in place before the first paint, as a <style> element's would be.
  useLayoutEffect(() => adoptCss(css), [css]);
  return null;
}
