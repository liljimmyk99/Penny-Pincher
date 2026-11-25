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

/** A random password of `length` (at least 12) with a lowercase, uppercase, digit and symbol. */
export function generatePassword(length = 16): string {
  const n = Math.max(length, 12);
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < n) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
