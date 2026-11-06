import { useState } from "react";
import { Link } from "react-router";
import {
  errorMessage,
  useMonthExpenses,
  useMonthIncome,
  useMonthMutations,
  useTemplateApplies,
} from "../../api";
import { AlertIcon, CheckIcon, UndoIcon } from "../../components/icons";
import { monthName } from "../../lib/dates";
import { plural, undoableApply, unconfirmedCount } from "./preview";
import "./months.css";

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
  onDone,
}: {
  month: string;
  /** Link to the month's Transactions (for Summary; Transactions is the review itself). */
  showReview?: boolean;
  /** Confirms a finished action, e.g. as a toast. */
  onDone: (message: string) => void;
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
      onDone(`Undone · removed ${plural(r.removed_expense_count + r.removed_income_entry_count, "copied item", "copied items")}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function confirm() {
    setError(null);
    try {
      const r = await confirmAll.mutateAsync(month);
      onDone(`Confirmed ${plural(r.confirmed_expense_count + r.confirmed_income_entry_count, "item", "items")} in ${monthName(month)}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="month-banner" aria-label="Unconfirmed items">
      <div className="month-banner__text">
        <span className="month-banner__dot" aria-hidden="true" />
        <p>
          <strong>
            {plural(n, "item", "items")} {undoable ? `copied${from}` : "unconfirmed"}
          </strong>
          {undoable ? " · unconfirmed until you check each one." : " · check each one, or confirm them all as-is."}
        </p>
      </div>
      <div className="month-banner__actions">
        {showReview && (
          <Link className="btn btn--ghost btn--sm" to={`/transactions?month=${month}`}>
            Review in Transactions
          </Link>
        )}
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void confirm()}>
          <CheckIcon />
          {confirmAll.isPending ? "Confirming…" : "Confirm all as-is"}
        </button>
        {undoable && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            aria-label={`Undo copying ${undoable.template_name ?? "the template"}`}
            onClick={() => void undo()}
          >
            <UndoIcon />
            {undoApply.isPending ? "Undoing…" : "Undo"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="alert alert--danger month-banner__error">
          <AlertIcon width={18} height={18} />
          {error}
        </p>
      )}
    </section>
  );
}
