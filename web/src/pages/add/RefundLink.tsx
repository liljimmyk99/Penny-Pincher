import { useMerchantExpenses, type Schemas } from "../../api";
import { formatShortDate } from "../../lib/dates";
import { formatCents } from "../../lib/money";

interface Props {
  id: string;
  rowLabel: string;
  merchantId: string | null;
  merchantName: string;
  value: string | null;
  categoryName: (id: string) => string;
  error?: string;
  onChange: (original: Schemas["Expense"] | null) => void;
}

/**
 * "Refund for …" under a refund row's merchant: optionally links the refund to
 * one of that merchant's past expenses. Linking is optional (web/AGENTS.md).
 */
export function RefundLink({ id, rowLabel, merchantId, merchantName, value, categoryName, error, onChange }: Props) {
  const originals = useMerchantExpenses(merchantId);

  if (!merchantId) {
    return (
      <p className="refund-link refund-link--hint">
        {merchantName.trim() ? "New merchant: nothing to link this refund to." : "Pick a merchant to link the original expense."}
      </p>
    );
  }

  const items = originals.data ?? [];
  return (
    <div className="refund-link">
      <label htmlFor={id}>Refund for</label>
      <select
        id={id}
        className="refund-link__select"
        aria-label={`Refund for, ${rowLabel}`}
        aria-invalid={error ? true : undefined}
        value={value ?? ""}
        disabled={originals.isPending}
        onChange={(e) => onChange(items.find((x) => x.id === e.target.value) ?? null)}
      >
        <option value="">{originals.isPending ? "Loading…" : originals.isError ? "Couldn’t load expenses" : "Not linked"}</option>
        {items.map((e) => (
          <option key={e.id} value={e.id}>
            {describe(e, categoryName)}
          </option>
        ))}
      </select>
      {error && <span className="refund-link__error">{error}</span>}
    </div>
  );
}

function describe(e: Schemas["Expense"], categoryName: (id: string) => string): string {
  const base = `${formatShortDate(e.date)}, ${e.date.slice(0, 4)} · ${formatCents(e.amount_cents)} · ${categoryName(e.category_id)}`;
  if (e.refunded_total_cents === 0) return base;
  return `${base} · net ${formatCents(e.amount_cents + e.refunded_total_cents)}`;
}
