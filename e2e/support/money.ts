/** "$1,234.56" / "−$4.50" (the app's typographic minus) -> integer cents. */
export function parseMoney(text: string): number {
  const t = text.trim().replace(/\s/g, "");
  const negative = t.startsWith("−") || t.startsWith("-");
  const m = /^[−-]?\$([\d,]+)\.(\d{2})$/.exec(t);
  if (!m) throw new Error(`not a money string: ${JSON.stringify(text)}`);
  const cents = Number(m[1].replace(/,/g, "")) * 100 + Number(m[2]);
  return negative ? -cents : cents;
}
