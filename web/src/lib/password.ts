/** The shortest password the API accepts (`400 weak_password` below it; root AGENTS.md §10). */
export const MIN_PASSWORD_LENGTH = 12;

/** One line of the live password checklist. */
export interface PasswordRule {
  ok: boolean;
  label: string;
}

/**
 * The rules a new password is checked against as it is typed (web/AGENTS.md,
 * Change password). "Different from your current password" is included only when
 * `current` is given, and "Both new passwords match" only when `repeat` is given.
 */
export function newPasswordRules({
  next,
  current,
  repeat,
}: {
  next: string;
  current?: string;
  repeat?: string;
}): PasswordRule[] {
  const rules: PasswordRule[] = [
    { ok: next.length >= MIN_PASSWORD_LENGTH, label: `At least ${MIN_PASSWORD_LENGTH} characters` },
  ];
  if (current !== undefined) {
    rules.push({ ok: next.length > 0 && next !== current, label: "Different from your current password" });
  }
  if (repeat !== undefined) {
    rules.push({ ok: next.length > 0 && next === repeat, label: "Both new passwords match" });
  }
  return rules;
}

const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "-_.!@#%+=";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** An unbiased random index in [0, max) from the Web Crypto API (rejection sampling). */
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0]! >= limit);
  return buf[0]! % max;
}

function pick(chars: string): string {
  return chars[randomIndex(chars.length)]!;
}

/**
 * A random password of `length` (at least 12) with a lowercase, uppercase, digit
 * and symbol, from `crypto.getRandomValues`. Callers keep it in component state
 * only: never storage, logs or a URL.
 */
export function generatePassword(length = 16): string {
  const n = Math.max(length, MIN_PASSWORD_LENGTH);
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < n) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
