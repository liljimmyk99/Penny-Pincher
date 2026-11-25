import { useMerchantExpenses, type Schemas } from "../../api";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { formatShortDate } from "../../lib/dates";
import { formatCents } from "../../lib/money";

/** Radix Select can't use "" as an item value, so "Not linked" has its own. */
const NOT_LINKED = "none";

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
      <p className="mt-1.5 mb-0 px-2 text-xs font-semibold text-muted-foreground">
        {merchantName.trim() ? "New merchant: nothing to link this refund to." : "Pick a merchant to link the original expense."}
      </p>
    );
  }

  const items = originals.data ?? [];
  const errorId = error ? `${id}-err` : undefined;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-2 text-xs font-bold text-refund-text">
      <Label htmlFor={id} className="text-xs font-bold text-refund-text">
        Refund for
      </Label>
      <Select
        value={value ?? NOT_LINKED}
        disabled={originals.isPending}
        onValueChange={(v) => onChange(items.find((x) => x.id === v) ?? null)}
      >
        <SelectTrigger
          id={id}
          size="sm"
          className="h-8 max-w-full min-w-0 text-xs font-semibold"
          aria-label={`Refund for, ${rowLabel}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value={NOT_LINKED}>
            {originals.isPending ? "Loading…" : originals.isError ? "Couldn’t load expenses" : "Not linked"}
          </SelectItem>
          {items.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {describe(e, categoryName)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <span id={errorId} className="text-danger-alert-foreground">
          {error}
        </span>
      )}
    </div>
  );
}

function describe(e: Schemas["Expense"], categoryName: (id: string) => string): string {
  const base = `${formatShortDate(e.date)}, ${e.date.slice(0, 4)} · ${formatCents(e.amount_cents)} · ${categoryName(e.category_id)}`;
  if (e.refunded_total_cents === 0) return base;
  return `${base} · net ${formatCents(e.amount_cents + e.refunded_total_cents)}`;
}
