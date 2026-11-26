import { useState } from "react";
import { Link } from "react-router";
import {
  errorMessage,
  useMonthExpenses,
  useMonthIncome,
  useMonthMutations,
  useTemplateApplies,
} from "../../api";
import { Check, Undo2 } from "lucide-react";
import { LoadError } from "@/components/LoadError";
import { Button } from "@/components/ui/button";
import { monthName } from "../../lib/dates";
import { toast } from "../../lib/toast";
import { plural, undoableApply, unconfirmedCount } from "./preview";

/**
 * The orange banner shown while a month has unconfirmed template copies
 * (web/AGENTS.md "Transactions" and "Empty states → New month"): the count,
 * "Confirm all as-is", Undo for the latest apply that still has copies to
 * remove, and (outside Transactions) "Review in Transactions".
 * Renders nothing once every entry is confirmed.
 */
export function UnconfirmedBanner({
  month,
  showReview = false,
}: {
  month: string;
  /** Link to the month's Transactions (for Summary; Transactions is the review itself). */
  showReview?: boolean;
}) {
  const expenses = useMonthExpenses(month);
  const income = useMonthIncome(month);
  const applies = useTemplateApplies(month);
  const { undoApply, confirmAll } = useMonthMutations();
  const [error, setError] = useState<string | null>(null);

  if (!expenses.data || !income.data) return null;
  const n = unconfirmedCount(expenses.data, income.data);
  if (n === 0) return null;
  const undoable = undoableApply(applies.data ?? []);
  const busy = undoApply.isPending || confirmAll.isPending;
  const from = undoable?.template_name ? ` from “${undoable.template_name}”` : " from a template";

  async function undo() {
    if (!undoable) return;
    setError(null);
    try {
      const r = await undoApply.mutateAsync(undoable.id);
      toast(`Undone · removed ${plural(r.removed_expense_count + r.removed_income_entry_count, "copied item", "copied items")}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function confirm() {
    setError(null);
    try {
      const r = await confirmAll.mutateAsync(month);
      toast(`Confirmed ${plural(r.confirmed_expense_count + r.confirmed_income_entry_count, "item", "items")} in ${monthName(month)}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section
      data-slot="unconfirmed-banner"
      aria-label="Unconfirmed items"
      className="flex flex-col gap-3 rounded-xl border border-solid border-unconfirmed-pill bg-unconfirmed-tint px-4 py-3 text-unconfirmed-text"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="size-2.5 flex-none rounded-full bg-brand" />
          <p className="m-0 text-sm">
            <strong className="font-semibold">
              {plural(n, "item", "items")} {undoable ? `copied${from}` : "unconfirmed"}
            </strong>
            {undoable ? " · unconfirmed until you check each one." : " · check each one, or confirm them all as-is."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showReview && (
            <Button asChild variant="outline">
              <Link to={`/transactions?month=${month}`}>Review in Transactions</Link>
            </Button>
          )}
          <Button type="button" disabled={busy} onClick={() => void confirm()}>
            <Check aria-hidden="true" />
            {confirmAll.isPending ? "Confirming…" : "Confirm all as-is"}
          </Button>
          {undoable && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              aria-label={`Undo copying ${undoable.template_name ?? "the template"}`}
              onClick={() => void undo()}
            >
              <Undo2 aria-hidden="true" />
              {undoApply.isPending ? "Undoing…" : "Undo"}
            </Button>
          )}
        </div>
      </div>
      {error && <LoadError message={error} />}
    </section>
  );
}
