/**
 * The one place integer cents become display strings.
 * Money is always integer cents; never do arithmetic on the formatted result.
 */

const MINUS = "−"; // typographic minus, matches the +/− change indicators
const SYMBOL = "$";

const wholeFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export interface FormatOptions {
  /** Prefix positive amounts with "+" (zero never gets a sign). Default false. */
  showPlus?: boolean;
  /** Omit the currency symbol. Default false. */
  hideSymbol?: boolean;
}

/** 123456 -> "$1,234.56", -500 -> "−$5.00". Throws on non-integer input. */
export function formatCents(cents: number, options: FormatOptions = {}): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`formatCents expects integer cents, got ${cents}`);
  }
  const abs = Math.abs(cents);
  const whole = wholeFormat.format(Math.trunc(abs / 100));
  const fraction = String(abs % 100).padStart(2, "0");
  const sign = cents < 0 ? MINUS : options.showPlus && cents > 0 ? "+" : "";
  const symbol = options.hideSymbol ? "" : SYMBOL;
  return `${sign}${symbol}${whole}.${fraction}`;
}
