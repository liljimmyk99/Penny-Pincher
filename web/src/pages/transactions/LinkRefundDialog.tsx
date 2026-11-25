import { useId, useState, type FormEvent } from "react";
import { errorMessage, useEntryMutations, useExpensesBetween, type Schemas } from "../../api";
import { AlertIcon, SearchIcon } from "../../components/icons";
import { addDays, formatShortDate, monthName, monthOf } from "../../lib/dates";
import { formatCents } from "../../lib/money";
import { suggestOriginal } from "./refunds";
import { matchesSearch } from "./totals";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

/** How far back the dialog looks for the original purchase. */
export const LINK_WINDOW_DAYS = 90;
/** Most candidates listed at once; searching narrows the rest. */
const SHOWN = 50;

interface Props {
  refund: Schemas["Expense"];
  categoryName: (id: string) => string;
  onClose: () => void;
  onLinked: (original: Schemas["Expense"]) => void;
}

/**
 * "Link…" on an unlinked refund (web/AGENTS.md "Refunds"): searches expenses
 * from the 90 days up to the refund's date, preselects a Suggested match, and
 * sets `refunded_expense_id` on confirm. Linking is optional.
 */
export function LinkRefundDialog({ refund, categoryName, onClose, onLinked }: Props) {
  const uid = useId();
  const candidates = useExpensesBetween(addDays(refund.date, -LINK_WINDOW_DAYS), refund.date);
  const { updateExpense } = useEntryMutations();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const pending = updateExpense.isPending;

  const all = (candidates.data ?? []).filter((c) => c.id !== refund.id);
  const suggested = suggestOriginal(refund, all);
  const selected = chosen ?? suggested?.id ?? null;
  const matching = all.filter((c) => matchesSearch(c, query));
  const ordered =
    suggested && matching.includes(suggested) ? [suggested, ...matching.filter((c) => c !== suggested)] : matching;
  const shown = ordered.slice(0, SHOWN);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const original = all.find((c) => c.id === selected);
    if (!original) {
      setAlert("Choose the expense this refund is for.");
      return;
    }
    setAlert(null);
    const body: Schemas["ExpenseUpdate"] = { refunded_expense_id: original.id };
    // Any edit confirms an entry; linking alone shouldn't.
    if (!refund.confirmed) body.confirmed = false;
    try {
      await updateExpense.mutateAsync({ id: refund.id, body });
      onLinked(original);
    } catch (err) {
      setAlert(`Not linked. ${errorMessage(err)}`);
    }
  }

  const describe = [
    refund.merchant.name,
    formatShortDate(refund.date),
    formatCents(refund.amount_cents),
    categoryName(refund.category_id),
    refund.note,
  ]
    .filter(Boolean)
    .join(" · ");

  let list;
  if (candidates.isPending) list = <p className="link-dialog__status">Loading expenses…</p>;
  else if (candidates.isError)
    list = (
      <p role="alert" className="alert alert--danger">
        <AlertIcon width={18} height={18} />
        <span>
          Couldn’t load expenses. {errorMessage(candidates.error)}{" "}
          <button type="button" className="text-btn" onClick={() => void candidates.refetch()}>
            Try again
          </button>
        </span>
      </p>
    );
  else if (all.length === 0)
    list = <p className="link-dialog__status">No expenses in the {LINK_WINDOW_DAYS} days before this refund.</p>;
  else if (shown.length === 0) list = <p className="link-dialog__status">No expenses match “{query.trim()}”.</p>;
  else
    list = (
      <div role="radiogroup" aria-label="Expense to link" className="link-dialog__options">
        {shown.map((c) => {
          const on = c.id === selected;
          const net = c.amount_cents + c.refunded_total_cents;
          const meta = [formatShortDate(c.date), categoryName(c.category_id), c.note].filter(Boolean).join(" · ");
          return (
            <label key={c.id} className={on ? "link-opt is-on" : "link-opt"}>
              <input
                type="radio"
                name={`${uid}-original`}
                value={c.id}
                checked={on}
                onChange={() => setChosen(c.id)}
                className="link-opt__radio"
              />
              <span className="link-opt__text">
                <span className="link-opt__title">
                  <strong>{c.merchant.name}</strong>
                  {c === suggested && <span className="pill pill--suggested">Suggested</span>}
                </span>
                <span className="link-opt__meta">
                  {meta}
                  {c.refunded_total_cents !== 0 && ` · net ${formatCents(net)}`}
                </span>
              </span>
              <span className="link-opt__amount">{formatCents(c.amount_cents)}</span>
            </label>
          );
        })}
      </div>
    );

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="w-[min(560px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Link refund to an expense</DialogTitle>
          <DialogDescription>{describe}</DialogDescription>
        </DialogHeader>
        <form className="link-dialog__form" noValidate onSubmit={(e) => void submit(e)}>
          <label className="tx-search link-dialog__search">
            <SearchIcon />
            <span className="visually-hidden">Search expenses</span>
            <input
              type="search"
              placeholder={`Search expenses from the last ${LINK_WINDOW_DAYS} days`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {list}
          {ordered.length > SHOWN && (
            <p className="link-dialog__status">
              Showing {SHOWN} of {ordered.length}. Search to narrow the list.
            </p>
          )}
          <p className="link-dialog__note">
            Linking is optional. An unlinked refund still lowers {categoryName(refund.category_id)} spending for{" "}
            {monthName(monthOf(refund.date))}.
          </p>
          {alert && (
            <p role="alert" className="alert alert--danger">
              <AlertIcon width={18} height={18} />
              {alert}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !selected}>
              {pending ? "Linking…" : "Link refund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
