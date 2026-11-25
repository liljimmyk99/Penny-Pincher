/**
 * Rewrites the dependencies that inject <style> elements, which the Content-
 * Security-Policy blocks, to use constructed stylesheets instead
 * (src/lib/cspAdoptedStyles.ts; audit in docs/security.md, #168).
 *
 * Each rewrite must match: if an upgrade changes the code it looks for, the build
 * (and the test run) fails here instead of shipping a CSP violation.
 *
 * It runs on the production build and on Vitest (with these packages inlined in
 * vite.config.ts). Vite's dev server pre-bundles dependencies without it, which is
 * fine: the dev server doesn't send the CSP.
 */
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const helper = JSON.stringify(fileURLToPath(new URL("../src/lib/cspAdoptedStyles.ts", import.meta.url)));

interface Rewrite {
  /** Matches the module's resolved file path. */
  file: RegExp;
  apply(code: string): string | null;
}

const rewrites: Rewrite[] = [
  {
    // Sonner adds its stylesheet with `__insertCSS(...)` as soon as it is imported.
    file: /[\\/]node_modules[\\/]sonner[\\/]dist[\\/]index\.mjs$/,
    apply(code) {
      const head = "function __insertCSS(code) {";
      if (!code.includes(head)) return null;
      return (
        code.replace(head, `${head} return __cspInsertCss(code);`) +
        `\nimport { insertCss as __cspInsertCss } from ${helper};\n`
      );
    },
  },
  {
    // Radix Select and ScrollArea render a <style> element that hides the viewport's scrollbar.
    file: /[\\/]node_modules[\\/]@radix-ui[\\/]react-(select|scroll-area)[\\/]dist[\\/]index\.mjs$/,
    apply(code) {
      const style = /\bjsx\(\s*"style",/g;
      if (!style.test(code)) return null;
      return code.replace(style, "jsx(__CspStyle,") + `\nimport { CspStyle as __CspStyle } from ${helper};\n`;
    },
  },
];

export function cspSafeStyles(): Plugin {
  return {
    name: "penny-pincher:csp-safe-styles",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      const rewrite = rewrites.find((r) => r.file.test(file));
      if (!rewrite) return null;
      const out = rewrite.apply(code);
      if (out === null) {
        this.error(`cspSafeStyles: ${file} no longer has the code this rewrite expects; recheck it against the CSP (docs/security.md).`);
      }
      return { code: out, map: null };
    },
  };
}
