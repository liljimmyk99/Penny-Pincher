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

const MONEY_INPUT = /^([+-]?)\$?(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?$/;
const MAX_CENTS = Number.MAX_SAFE_INTEGER;

/**
 * Parses what a user typed into a money field into integer cents, without
 * floating-point arithmetic: "12", "12.5", "$1,234.56", ".99", "−24.99".
 * Returns null for anything else (empty, letters, more than two decimals).
 */
export function parseCents(input: string): number | null {
  const text = input.trim().replace(/^[−–]/, "-").replace(/^([+-]?)\s*\$\s*/, "$1$");
  const match = MONEY_INPUT.exec(text);
  if (!match) return null;
  const [, sign, wholeRaw, fractionRaw] = match;
  const whole = wholeRaw.replaceAll(",", "");
  if (whole === "" && !fractionRaw) return null;
  const cents = Number(whole || "0") * 100 + Number((fractionRaw ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return sign === "-" && cents !== 0 ? -cents : cents;
}

/** Integer cents back to an editable field value: 123456 -> "1234.56", -500 -> "-5.00". */
export function centsToInput(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`centsToInput expects integer cents, got ${cents}`);
  }
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
