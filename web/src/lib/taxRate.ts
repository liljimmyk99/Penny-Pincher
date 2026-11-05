/**
 * Tax rate is derived, never stored (root AGENTS.md §5):
 * (gross taxable − net) ÷ gross taxable. Null when gross taxable is 0.
 */
export function taxRate(grossTaxableCents: number, netCents: number): number | null {
  if (grossTaxableCents <= 0) return null;
  return (grossTaxableCents - netCents) / grossTaxableCents;
}

/** "23.4%", or "—" when there is no rate to show. */
export function formatTaxRate(grossTaxableCents: number, netCents: number): string {
  const rate = taxRate(grossTaxableCents, netCents);
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}
