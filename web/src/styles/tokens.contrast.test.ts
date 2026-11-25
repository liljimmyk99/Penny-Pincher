/**
 * Contrast of every colour pair the design system promises (web/AGENTS.md, Design system):
 * text 4.5:1, large text, bars and control borders 3:1, in light and in dark.
 * Reads the literal hex values from tokens.css, so a changed token is checked here.
 */
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read from disk: Vitest runs with `css: false`, which empties CSS imports, ?raw included.
// Vitest runs from web/.
const tokensCss = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

type Palette = Record<string, string>;

function hexValues(block: string): Palette {
  const out: Palette = {};
  for (const [, name, hex] of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) out[name] = hex;
  return out;
}

function block(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} block in tokens.css`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("\n}", open));
}

const light = hexValues(block(tokensCss, ":root {"));
const dark = { ...light, ...hexValues(block(tokensCss, ':root[data-theme="dark"] {')) };

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background] token names. */
const TEXT: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "muted"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["destructive-foreground", "destructive"],
  ["destructive-foreground", "destructive-hover"],
  ["success-foreground", "success"],
  ["success-foreground", "success-hover"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-foreground", "sidebar-accent"],
  ["sidebar-muted-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["brand-on-sidebar", "sidebar"],
  ["sidebar", "sidebar-foreground"], // the current page's pill
  ["on-brand", "brand"],
  ["income", "card"],
  ["income", "background"],
  ["saving-text", "card"],
  ["saving-text", "background"],
  ["spent", "card"],
  ["refund-text", "card"],
  ["refund-text", "refund-row"],
  ["refund-text", "refund-pill"],
  ["unconfirmed-text", "card"],
  ["unconfirmed-text", "unconfirmed-tint"],
  ["unconfirmed-text", "unconfirmed-pill"],
  ["foreground", "unconfirmed-tint"],
  ["foreground", "refund-row"],
  ["danger-alert-text", "danger-alert-bg"],
  ["success-alert-text", "success-alert-bg"],
  ["info-alert-text", "info-alert-bg"],
  ["selected-foreground", "selected"],
  ["saving-text", "selected"], // the saving badge (#170)
  ["income", "success-alert-bg"], // the income badge (#170)
  ["toast-foreground", "toast"],
  ["link", "card"],
  ["link", "background"],
  ["link-hover", "card"],
  ["worse", "card"],
  ["better", "card"],
];

/**
 * Bars and focus rings against the card they sit on.
 * Not listed, on purpose (same as v1; see web/AGENTS.md, Design system):
 * - `input` (field borders): shadcn's and V2's light border, about 1.5:1. Fields are
 *   also found by their label and their white fill on the page colour.
 * - `brand` in light (2.8:1): only the logo and the unconfirmed dot, which always sits
 *   beside text that says the same.
 */
const NON_TEXT: [string, string][] = [
  ["ring", "card"],
  ["ring", "background"],
  ["danger-alert-line", "card"],
  ["saving-bar", "card"],
  ["spent", "card"],
  ["income", "card"],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): [string, string] => [`chart-${n}`, "card"]),
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s tokens", (_, palette) => {
  it.each(TEXT)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(palette[fg], fg).toBeDefined();
    expect(palette[bg], bg).toBeDefined();
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT)("%s against %s is at least 3:1", (fg, bg) => {
    expect(palette[fg], fg).toBeDefined();
    expect(palette[bg], bg).toBeDefined();
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(3);
  });
});
