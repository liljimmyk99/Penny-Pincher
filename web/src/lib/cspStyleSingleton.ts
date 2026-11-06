/**
 * Stands in for `react-style-singleton` (aliased in vite.config.ts), which Radix
 * dialogs and menus use, through `react-remove-scroll`, to lock page scrolling
 * while they are open.
 *
 * The package injects its CSS as a <style> element. The Content-Security-Policy
 * (deploy/Caddyfile) blocks inline styles: `style-src` has no 'unsafe-inline',
 * and a hash can't work because the CSS contains the scrollbar's width. This
 * version adds the same CSS as a constructed stylesheet (`adoptedStyleSheets`),
 * which the CSP doesn't restrict. Same exports and behaviour as the package
 * (v2.2): the CSS is added when the first instance mounts and removed when the
 * last one unmounts. Where constructed stylesheets aren't supported, nothing is
 * added, so the page simply doesn't lock while a dialog is open.
 */
import { useEffect } from "react";

function canAdopt(): boolean {
  return (
    typeof document !== "undefined" &&
    "adoptedStyleSheets" in document &&
    typeof CSSStyleSheet === "function" &&
    "replaceSync" in CSSStyleSheet.prototype
  );
}

export function stylesheetSingleton() {
  let counter = 0;
  let sheet: CSSStyleSheet | null = null;
  return {
    add(style: string) {
      if (counter === 0 && canAdopt()) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(style);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      }
      counter++;
    },
    remove() {
      counter--;
      if (counter === 0 && sheet) {
        const added = sheet;
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== added);
        sheet = null;
      }
    },
  };
}

export function styleHookSingleton() {
  const sheet = stylesheetSingleton();
  return function useStyle(styles: string, isDynamic?: boolean) {
    useEffect(
      () => {
        sheet.add(styles);
        return () => sheet.remove();
      },
      // As in the package: added once on mount; changed only when marked dynamic.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [styles && isDynamic],
    );
  };
}

export function styleSingleton() {
  const useStyle = styleHookSingleton();
  return function Sheet({ styles, dynamic }: { styles: string; dynamic?: boolean }) {
    useStyle(styles, dynamic);
    return null;
  };
}
